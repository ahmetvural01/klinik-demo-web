import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { applyTaksitIntegration } from "@/lib/taksit-integration";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const dateRaw = searchParams.get("date"); // YYYY-MM-DD

  const date  = dateRaw ? new Date(dateRaw) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { patient: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  const byMethod: Record<string, number> = { NAKIT: 0, KREDI_KARTI: 0, HAVALE_EFT: 0 };
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
  }

  return NextResponse.json({ date: start.toISOString(), total, byMethod, payments });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { patientId, doctorId, method, amount, description, posId } = body;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !method) {
    return NextResponse.json({ error: "amount ve method zorunlu" }, { status: 400 });
  }

  const { payment, taksitInfo } = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: { patientId: patientId || null, doctorId: doctorId || null, method, amount: numericAmount, description, posId: posId || null },
      include: { patient: { select: { id: true, fullName: true } } },
    });
    let taksitInfo = null;
    if (patientId) {
      taksitInfo = await applyTaksitIntegration(tx, patientId, numericAmount, method, posId || null);
    }
    return { payment: created, taksitInfo };
  });

  return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
}
