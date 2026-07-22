import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json();

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      status: body.status,
      paidAt: body.status === "PAID" ? new Date() : null,
    },
  });

  // Ödendi/iptal işaretlendiğinde veya tekrar açıldığında kurumun yazma
  // kısıtlaması (paymentGraceUntil) kalan ödenmemiş faturalara göre yeniden
  // hesaplanır — süperadmin ayrıca elle kısıtlamayı kaldırmak zorunda kalmaz.
  await syncInstitutionPaymentGate(invoice.institutionId).catch(() => {});

  return NextResponse.json(invoice);
}
