import { NextRequest, NextResponse } from "next/server";
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

  // Fatura numarası oluştur
  const invoiceNo = `INV-${Date.now()}`;

  // Fatura oluşturma ile kurumun paymentGraceUntil senkronu TEK transaction
  // içinde yapılır — sync adımı başarısız olursa fatura da hiç oluşturulmamış
  // sayılır (bkz. denetim raporu, önceden `.catch(() => {})` ile hata
  // sessizce yutuluyordu).
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNo,
        institutionId: body.institutionId,
        amount: body.amount,
        description: body.description,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        status: body.status || "PENDING",
      },
    });

    if (created.status !== "PAID") {
      await syncInstitutionPaymentGate(body.institutionId, tx);
    }

    return created;
  });

  if (invoice.status !== "PAID") {
    invalidateInstitutionCache(invoice.institutionId);
  }

  const institution = await prisma.institution.findUnique({ where: { id: body.institutionId }, select: { name: true } });
  await writeAudit(auth.user.id, "SUPERADMIN_INVOICE_CREATE", `${institution?.name || body.institutionId} için ${invoice.invoiceNo} oluşturuldu: ₺${Number(invoice.amount).toLocaleString("tr-TR")}`);
  return NextResponse.json(invoice);
}
