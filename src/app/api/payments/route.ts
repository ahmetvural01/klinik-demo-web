import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { createIntegratedPayment } from "@/lib/payment-ledger";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;

    const body = await request.json();
    const { patientId, method, amount, description, doctorId, posId } = body;
    const numericAmount = Number(amount);

    if (!method || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ message: "Eksik alan" }, { status: 400 });
    }

    const institutionUsers = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, isActive: true },
          select: { id: true },
        })
      : [];
    const userIds = institutionUsers.map((user) => user.id);

    if (auth.user.institutionId && doctorId && !userIds.includes(doctorId)) {
      return NextResponse.json({ message: "Bu doktor kurum kapsamı disinda" }, { status: 403 });
    }

    if (auth.user.institutionId && patientId) {
      const relatedPatient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          institutionId: auth.user.institutionId,
        },
        select: { id: true },
      });

      if (!relatedPatient) {
        return NextResponse.json({ message: "Hasta kurum kapsamı disinda" }, { status: 403 });
      }
    }

    const { payment, taksitInfo } = await prisma.$transaction((tx) =>
      createIntegratedPayment({
        tx,
        patientId,
        doctorId,
        method,
        amount: numericAmount,
        description,
        posId,
      })
    );

    const auditNote = taksitInfo?.updatedCount
      ? `${numericAmount} TL ödeme — ${taksitInfo.updatedCount} taksit otomatik güncellendi`
      : `${numericAmount} TL ödeme eklendi`;
    await writeAudit(auth.user.id, "PAYMENT_CREATE", auditNote);
    return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Ödeme kaydedilemedi" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("payments:read");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const institutionUsers = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, isActive: true },
          select: { id: true },
        })
      : [];
    const userIds = institutionUsers.map((user) => user.id);
    const institutionFilter = auth.user.institutionId
      ? {
          OR: [
            { doctorId: { in: userIds } },
            { patient: { institutionId: auth.user.institutionId } },
          ],
        }
      : {};

    const payments = await prisma.payment.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...institutionFilter,
      },
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(payments);
  } catch {
    return NextResponse.json([]);
  }
}
