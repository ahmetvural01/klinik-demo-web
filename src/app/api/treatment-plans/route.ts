import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const user = auth.user;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status    = searchParams.get("status");

  const plans = await (prisma as any).treatmentPlan.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(status    ? { status }    : {}),
    },
    include: {
      patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
  const result = hidePhone
    ? plans.map((p: any) => ({
        ...p,
        patient: p.patient ? { ...p.patient, phone: "***" } : p.patient,
      }))
    : plans;

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const user = auth.user;

  const body = await req.json();
  const { patientId, doctorId, title, notes, steps = [] } = body;

  if (!patientId || !doctorId || !title) {
    return NextResponse.json({ error: "patientId, doctorId ve title zorunlu" }, { status: 400 });
  }

  const totalCost = steps.reduce((sum: number, s: { amount?: number }) => sum + (Number(s.amount) || 0), 0);

  const plan = await (prisma as any).treatmentPlan.create({
    data: {
      patientId,
      doctorId,
      title,
      notes,
      totalCost,
      steps: {
        create: steps.map((s: { treatmentName: string; toothNo?: string; amount: number; note?: string }, i: number) => ({
          order:         i + 1,
          treatmentName: s.treatmentName,
          toothNo:       s.toothNo,
          amount:        s.amount,
          note:          s.note,
        })),
      },
    },
    include: {
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
