import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const validStatuses = new Set(["PENDING", "PAID", "OVERDUE", "CANCELLED"]);
  if (status && !validStatuses.has(status)) {
    return NextResponse.json({ message: "Geçersiz fatura durumu" }, { status: 400 });
  }
  const institutionId = searchParams.get("institutionId") || "";
  const q = (searchParams.get("q") || "").trim();
  // "status" filtresi burada UYGULANMAZ — ham DB durumuna göre filtrelemek,
  // vadesi geçmiş ama henüz DB'de "OVERDUE" işaretlenmemiş (hâlâ "PENDING")
  // faturaları "Gecikti" filtresinden tamamen gizliyordu (bkz. denetim
  // raporu). Bunun yerine tüm kayıtlar çekilip aşağıda canlı türetilmiş
  // duruma göre filtrelenir — summary de aynı canlı duruma göre, filtreden
  // BAĞIMSIZ tam veri setinden hesaplanır.
  const where = {
    ...(institutionId ? { institutionId } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" as const } },
            { institution: { name: { contains: q, mode: "insensitive" as const } } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      institution: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const normalized = invoices.map((inv) => {
    if (inv.status === "PENDING" && inv.dueDate && inv.dueDate < now) {
      return { ...inv, status: "OVERDUE" as const };
    }
    return inv;
  });

  const summary = {
    total: normalized.length,
    pending: normalized.filter((i) => i.status === "PENDING").length,
    overdue: normalized.filter((i) => i.status === "OVERDUE").length,
    paid: normalized.filter((i) => i.status === "PAID").length,
    totalAmount: normalized.reduce((s, i) => s + Number(i.amount), 0),
    unpaidAmount: normalized.filter((i) => i.status !== "PAID").reduce((s, i) => s + Number(i.amount), 0),
  };

  const filtered = status ? normalized.filter((i) => i.status === status) : normalized;

  return NextResponse.json({ invoices: filtered, summary });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }

  const institutionId = typeof body.institutionId === "string" ? body.institutionId.trim() : "";
  const amount = Number(body.amount);
  const status = body.status ?? "PENDING";
  const validStatuses = new Set(["PENDING", "PAID", "OVERDUE", "CANCELLED"]);
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;

  if (!institutionId) {
    return NextResponse.json({ message: "Klinik seçimi zorunlu" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) {
    return NextResponse.json({ message: "Geçerli bir fatura tutarı girin" }, { status: 400 });
  }
  if (!validStatuses.has(status)) {
    return NextResponse.json({ message: "Geçersiz fatura durumu" }, { status: 400 });
  }
  if (body.dueDate && Number.isNaN(dueDate?.getTime())) {
    return NextResponse.json({ message: "Geçerli bir son ödeme tarihi girin" }, { status: 400 });
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return NextResponse.json({ message: "Fatura açıklaması geçersiz" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : null;
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true },
  });
  if (!institution) {
    return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });
  }

  // Fatura numarası oluştur
  const invoiceNo = `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

  // Fatura oluşturma ile kurumun paymentGraceUntil senkronu TEK transaction
  // içinde yapılır — sync adımı başarısız olursa fatura da hiç oluşturulmamış
  // sayılır (bkz. denetim raporu, önceden `.catch(() => {})` ile hata
  // sessizce yutuluyordu).
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNo,
        institutionId,
        amount,
        description,
        dueDate,
        status,
        paidAt: status === "PAID" ? new Date() : null,
      },
    });

    if (created.status !== "PAID") {
      await syncInstitutionPaymentGate(institutionId, tx);
    }

    return created;
  });

  if (invoice.status !== "PAID") {
    invalidateInstitutionCache(invoice.institutionId);
  }

  await writeAudit(auth.user.id, "SUPERADMIN_INVOICE_CREATE", `${institution.name} için ${invoice.invoiceNo} oluşturuldu: ₺${Number(invoice.amount).toLocaleString("tr-TR")}`);
  return NextResponse.json(invoice);
}
