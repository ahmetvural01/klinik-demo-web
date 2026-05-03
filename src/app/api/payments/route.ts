import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { applyTaksitIntegration } from "@/lib/taksit-integration";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const { patientId, method, amount, description, doctorId, posId } = body;
  const numericAmount = Number(amount);

  if (!method || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ message: "Eksik alan" }, { status: 400 });
  }

  const { payment, taksitInfo } = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        patientId: patientId || null,
        method,
        amount: numericAmount,
        description: description || null,
        doctorId: doctorId || null,
        posId: posId || null,
      },
      include: { patient: { select: { id: true, fullName: true } } },
    });

    let taksitInfo = null;
    if (patientId) {
      taksitInfo = await applyTaksitIntegration(
        tx, patientId, numericAmount, method, posId || null
      );
    }
    return { payment: created, taksitInfo };
  });

  const auditNote = taksitInfo?.updatedCount
    ? `${numericAmount} TL ödeme — ${taksitInfo.updatedCount} taksit otomatik güncellendi`
    : `${numericAmount} TL ödeme eklendi`;
  await writeAudit(auth.user.id, "PAYMENT_CREATE", auditNote);
  return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId");

  const payments = await prisma.payment.findMany({
    where: patientId ? { patientId } : undefined,
    include: { patient: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json(payments);
}
