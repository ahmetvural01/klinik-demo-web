import { NextRequest, NextResponse } from "next/server";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";

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

  const existing = await prisma.invoice.findUnique({ where: { id: params.id }, select: { status: true, amount: true, institutionId: true } });
  if (!existing) {
    return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });
  }
  if (existing.status === body.status) {
    const current = await prisma.invoice.findUnique({ where: { id: params.id } });
    return NextResponse.json(current);
  }

  // Fatura durumu güncellemesi ile kurumun paymentGraceUntil senkronu TEK
  // transaction içinde yapılır: sync adımı (ör. geçici DB hatası) başarısız
  // olursa fatura durumu da güncellenmemiş sayılır — "fatura PAID ama kurum
  // hâlâ kısıtlı görünüyor" gibi atomik olmayan bir tutarsızlık oluşmaz
  // (bkz. denetim raporu, önceden `.catch(() => {})` ile hata sessizce
  // yutuluyordu).
  const invoice = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${existing.institutionId} FOR UPDATE`;
    const updated = await tx.invoice.update({
      where: { id: params.id },
      data: {
        status: body.status,
        paidAt: body.status === "PAID" ? new Date() : null,
      },
    });

    // Ödendi/iptal işaretlendiğinde veya tekrar açıldığında kurumun yazma
    // kısıtlaması (paymentGraceUntil) kalan ödenmemiş faturalara göre yeniden
    // hesaplanır — süperadmin ayrıca elle kısıtlamayı kaldırmak zorunda kalmaz.
    await syncInstitutionPaymentGate(updated.institutionId, tx);

    return updated;
  });

  // requireAuth() kurum kısıtlama durumunu 60sn'lik in-process cache'ten
  // okuyor — bu invalidasyon olmadan süperadmin faturayı "Ödendi" işaretleyip
  // kliniğe "artık yazabilirsiniz" dese bile klinik en fazla 60sn boyunca
  // hâlâ kilitli görünürdü (bkz. denetim raporu).
  invalidateInstitutionCache(invoice.institutionId);

  // Bir faturanın ödendi/iptal olarak işaretlenmesi elle yapılan, gerçek
  // ödeme doğrulaması olmayan bir işlemdir ve önceden hiçbir denetim
  // kaydına yazılmıyordu (bkz. denetim raporu — fatura oluşturma zaten
  // loglanıyordu ama durum değişikliği loglanmıyordu).
  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INVOICE_STATUS_UPDATE",
    `Fatura durumu değişti: ${existing.status} → ${invoice.status} (${Number(existing.amount)} TL, kurum: ${existing.institutionId})`,
  );

  return NextResponse.json(invoice);
}
