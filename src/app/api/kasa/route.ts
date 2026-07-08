import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { createIntegratedPayment } from "@/lib/payment-ledger";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("payments:read");
    if (auth.error) return auth.error;

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((doctor) => doctor.id);
    const institutionFilter = auth.user.institutionId
      ? {
          OR: [
            { doctorId: { in: doctorIds } },
            { patient: { examinations: { some: { doctorId: { in: doctorIds } } } } },
          ],
        }
      : {};

    const { searchParams } = new URL(req.url);
    const dateRaw = searchParams.get("date"); // YYYY-MM-DD

    const date  = dateRaw ? new Date(dateRaw) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...institutionFilter,
      },
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    const byMethod: Record<string, number> = { NAKIT: 0, KREDI_KARTI: 0, HAVALE_EFT: 0 };
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return NextResponse.json({ date: start.toISOString(), total, byMethod, payments });
  } catch {
    return NextResponse.json({ date: new Date().toISOString(), total: 0, byMethod: { NAKIT: 0, KREDI_KARTI: 0, HAVALE_EFT: 0 }, payments: [] });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const institutionDoctors = auth.user.institutionId
    ? await prisma.user.findMany({
        where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
        select: { id: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);

  const body = await req.json();
  const { patientId, doctorId, method, amount, description, posId } = body;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !method) {
    return NextResponse.json({ error: "amount ve method zorunlu" }, { status: 400 });
  }

  if (auth.user.institutionId && doctorId && !doctorIds.includes(doctorId)) {
    return NextResponse.json({ error: "Bu doktor kurum kapsamı disinda" }, { status: 403 });
  }

  if (auth.user.institutionId && patientId && doctorIds.length > 0) {
    const relatedPatient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        OR: [
          { examinations: { some: { doctorId: { in: doctorIds } } } },
          { appointments: { some: { doctorId: { in: doctorIds } } } },
        ],
      },
      select: { id: true },
    });

    if (!relatedPatient) {
      return NextResponse.json({ error: "Hasta kurum kapsamı disinda" }, { status: 403 });
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

  await writeAudit(auth.user.id, "KASA_PAYMENT_CREATE", `${numericAmount} TL kasa tahsilatı eklendi`);
  return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
}
