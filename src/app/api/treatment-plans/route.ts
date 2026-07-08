import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("treatment:read");
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status    = searchParams.get("status");

  const plans = await (prisma as any).treatmentPlan.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(status    ? { status }    : {}),
      ...(user.role !== "SUPERADMIN" ? { patient: { institutionId: user.institutionId } } : {}),
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
  const auth = await requireAuth("treatment:write");
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, doctorId, title, notes, steps = [] } = body;

  if (!patientId || !doctorId || !title) {
    return NextResponse.json({ error: "patientId, doctorId ve title zorunlu" }, { status: 400 });
  }

  if (user.role !== "SUPERADMIN") {
    const [patient, doctor] = await Promise.all([
      (prisma as any).patient.findFirst({
        where: { id: patientId, institutionId: user.institutionId },
        select: { id: true },
      }),
      (prisma as any).user.findFirst({
        where: { id: doctorId, institutionId: user.institutionId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
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
