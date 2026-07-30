import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json();

  const VALID_STATUSES = new Set(["PENDING", "PAID", "OVERDUE", "CANCELLED"]);
  if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ message: "Geçersiz fatura durumu" }, { status: 400 });
  }

  const existing = await prisma.invoice.findUnique({ where: { id: params.id }, select: { status: true, amount: true, institutionId: true } });
  if (!existing) {
    return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });
  }

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      status: body.status,
      paidAt: body.status === "PAID" ? new Date() : null,
    },
  });

  // Bir faturanın ödendi/iptal olarak işaretlenmesi elle yapılan, gerçek
  // ödeme doğrulaması olmayan bir işlemdir ve önceden hiçbir denetim
  // kaydına yazılmıyordu (bkz. denetim raporu — fatura oluşturma zaten
  // loglanıyordu ama durum değişikliği loglanmıyordu).
  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INVOICE_STATUS_UPDATE",
    `Fatura durumu değişti: ${existing.status} → ${invoice.status} (${Number(existing.amount)} TL, kurum: ${existing.institutionId})`,
  );

  // Ödendi/iptal işaretlendiğinde veya tekrar açıldığında kurumun yazma
  // kısıtlaması (paymentGraceUntil) kalan ödenmemiş faturalara göre yeniden
  // hesaplanır — süperadmin ayrıca elle kısıtlamayı kaldırmak zorunda kalmaz.
  await syncInstitutionPaymentGate(invoice.institutionId).catch(() => {});

  return NextResponse.json(invoice);
}
