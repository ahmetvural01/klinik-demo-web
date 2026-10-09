import { NextRequest, NextResponse } from "next/server";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";
import { isValidDateKey, turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Bekliyor",
  OVERDUE: "Gecikti",
  PAID: "Ödendi",
  CANCELLED: "İptal edildi",
};

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  const VALID_STATUSES = new Set(["PENDING", "PAID", "OVERDUE", "CANCELLED"]);
  if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ message: "Geçersiz fatura durumu" }, { status: 400 });
  }

  // Tahsilat tarihi isteğe bağlıdır (varsayılan: şimdi). Geçmiş bir gün
  // seçilirse o günün öğlesi (Türkiye saati) yazılır; gelecekteki tarih kabul
  // edilmez. Not ve iptal nedeni yalnız denetim kaydına yazılır.
  let paidAt = new Date();
  if (body.status === "PAID" && body.paidDate !== undefined && body.paidDate !== null && body.paidDate !== "") {
    if (typeof body.paidDate !== "string" || !isValidDateKey(body.paidDate)) {
      return NextResponse.json({ message: "Geçerli bir ödeme tarihi girin" }, { status: 400 });
    }
    const today = turkeyDateKey();
    if (body.paidDate > today) {
      return NextResponse.json({ message: "Ödeme tarihi bugünden ileri olamaz" }, { status: 400 });
    }
    if (body.paidDate !== today) paidAt = turkeyLocalDateTimeToUtc(body.paidDate, "12:00");
  }
  const note = cleanText(body.note, 300);
  const reason = cleanText(body.reason, 300);

  const existing = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: { status: true, amount: true, institutionId: true, invoiceNo: true, institution: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });
  }
  if (existing.status === body.status) {
    const current = await prisma.invoice.findUnique({ where: { id: params.id } });
    return NextResponse.json(current);
  }
  const allowedTransitions: Record<string, ReadonlySet<string>> = {
    PENDING: new Set(["OVERDUE", "PAID", "CANCELLED"]),
    OVERDUE: new Set(["PAID", "CANCELLED"]),
    PAID: new Set(),
    CANCELLED: new Set(),
  };
  if (!allowedTransitions[existing.status]?.has(body.status)) {
    const message = existing.status === "PAID"
      ? "Bu fatura zaten ödendi olarak kayıtlı; durumu değiştirilemez."
      : existing.status === "CANCELLED"
        ? "Bu fatura iptal edilmiş; durumu değiştirilemez."
        : "Bu fatura durum geçişine izin verilmiyor";
    return NextResponse.json({ message }, { status: 409 });
  }

  // Fatura durumu güncellemesi ile kurumun paymentGraceUntil senkronu TEK
  // transaction içinde yapılır: sync adımı (ör. geçici DB hatası) başarısız
  // olursa fatura durumu da güncellenmemiş sayılır — "fatura PAID ama kurum
  // hâlâ kısıtlı görünüyor" gibi atomik olmayan bir tutarsızlık oluşmaz
  // (bkz. denetim raporu, önceden `.catch(() => {})` ile hata sessizce
  // yutuluyordu).
  const invoice = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${existing.institutionId} FOR UPDATE`;
    const changed = await tx.invoice.updateMany({
      where: { id: params.id, status: existing.status },
      data: {
        status: body.status,
        paidAt: body.status === "PAID" ? paidAt : null,
      },
    });
    if (changed.count !== 1) return null;
    const updated = await tx.invoice.findUniqueOrThrow({ where: { id: params.id } });

    // Ödendi/iptal işaretlendiğinde veya tekrar açıldığında kurumun yazma
    // kısıtlaması (paymentGraceUntil) kalan ödenmemiş faturalara göre yeniden
    // hesaplanır — süperadmin ayrıca elle kısıtlamayı kaldırmak zorunda kalmaz.
    await syncInstitutionPaymentGate(updated.institutionId, tx);

    return updated;
  });
  if (!invoice) {
    return NextResponse.json({ message: "Fatura başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
  }

  // requireAuth() kurum kısıtlama durumunu 60sn'lik in-process cache'ten
  // okuyor — bu invalidasyon olmadan süperadmin faturayı "Ödendi" işaretleyip
  // kliniğe "artık yazabilirsiniz" dese bile klinik en fazla 60sn boyunca
  // hâlâ kilitli görünürdü (bkz. denetim raporu).
  invalidateInstitutionCache(invoice.institutionId);

  // Bir faturanın ödendi/iptal olarak işaretlenmesi elle yapılan, gerçek
  // ödeme doğrulaması olmayan bir işlemdir ve denetim kaydına yazılır.
  // Kayıtta ham kimlik yerine klinik adı ve fatura numarası bulunur.
  const extra = [
    invoice.status === "PAID" ? `ödeme tarihi ${turkeyDateKey(paidAt)}` : "",
    note ? `not: ${note}` : "",
    reason ? `neden: ${reason}` : "",
  ].filter(Boolean).join(" · ");
  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INVOICE_STATUS_UPDATE",
    `${existing.institution.name} / ${existing.invoiceNo}: ${STATUS_LABEL[existing.status] || existing.status} → ${STATUS_LABEL[invoice.status] || invoice.status} (${Number(existing.amount).toLocaleString("tr-TR")} TL)${extra ? ` — ${extra}` : ""}`,
  );

  return NextResponse.json(invoice);
}
