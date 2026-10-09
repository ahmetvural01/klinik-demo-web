import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";
import { isValidDateKey, turkeyDayRangeUtc } from "@/lib/tz";
import { deriveInvoiceStatus, summarizeInvoices } from "@/components/superadmin/invoice-status";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  // "OPEN" = ödenmemiş ve iptal edilmemiş (bekleyen + gecikmiş): iş kuyruğu.
  const validStatuses = new Set(["OPEN", "PENDING", "PAID", "OVERDUE", "CANCELLED"]);
  if (status && !validStatuses.has(status)) {
    return NextResponse.json({ message: "Geçersiz fatura durumu" }, { status: 400 });
  }
  const institutionId = searchParams.get("institutionId") || "";
  const q = (searchParams.get("q") || "").trim();
  // Durum filtresi veritabanında DEĞİL, canlı türetilmiş duruma göre uygulanır:
  // vadesi geçmiş ama veritabanında hâlâ "PENDING" duran fatura "Gecikti"
  // sayılır (bkz. components/superadmin/invoice-status.ts). Özet, arama
  // metninden ve durum filtresinden BAĞIMSIZ hesaplanır; iptal edilen fatura
  // hiçbir borç toplamına girmez.
  const scopeWhere = institutionId ? { institutionId } : {};
  const where = {
    ...scopeWhere,
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

  const [invoices, scopeAll] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        institution: { select: { id: true, name: true, subscriptionPlan: true, billingCycle: true } },
        reminders: { select: { sentAt: true, channel: true, status: true }, orderBy: { sentAt: "desc" }, take: 1 },
        _count: { select: { reminders: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    q ? prisma.invoice.findMany({ where: scopeWhere, select: { status: true, amount: true, dueDate: true, paidAt: true } }) : Promise.resolve(null),
  ]);

  const now = new Date();
  const normalized = invoices.map(({ reminders, _count, ...inv }) => ({
    ...inv,
    // Prisma Decimal JSON'da metin olarak gider; ekran sayı bekler.
    amount: Number(inv.amount),
    dbStatus: inv.status,
    status: deriveInvoiceStatus(inv, now),
    lastReminderAt: reminders[0]?.sentAt ?? null,
    reminderCount: _count.reminders,
  }));

  const summary = summarizeInvoices(scopeAll ?? invoices, now);
  const filtered = status === "OPEN"
    ? normalized.filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
    : status ? normalized.filter((i) => i.status === status) : normalized;

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
  // "YYYY-MM-DD" gelirse vade, o günün Türkiye saatiyle SONU olarak yazılır:
  // klinik vade gününün tamamında ödeme yapabilir (önceden gün başı UTC
  // yazıldığı için fatura vade günü sabah 03:00'te "Gecikti" oluyordu).
  const dueDate = typeof body.dueDate === "string" && isValidDateKey(body.dueDate)
    ? turkeyDayRangeUtc(body.dueDate).end
    : body.dueDate ? new Date(body.dueDate) : null;

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

  await writeAudit(auth.user.id, "SUPERADMIN_INVOICE_CREATE", `${institution.name} için ${invoice.invoiceNo} kesildi: ₺${Number(invoice.amount).toLocaleString("tr-TR")}${invoice.dueDate ? `, vade ${invoice.dueDate.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}` : ""}${description ? ` (${description.slice(0, 80)})` : ""}`);
  return NextResponse.json(invoice);
}
