import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const user = auth.user;

  const plan = await (prisma as any).treatmentPlan.findUnique({
    where: { id: params.id },
    include: {
      patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  if (!plan) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
  const result = hidePhone
    ? {
        ...plan,
        patient: plan.patient ? { ...plan.patient, phone: "***" } : plan.patient,
      }
    : plan;
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const user = auth.user;

  const body = await req.json();
  const { status, stepUpdates } = body;

  if (stepUpdates && Array.isArray(stepUpdates)) {
    for (const su of stepUpdates) {
      await (prisma as any).treatmentStep.update({
        where: { id: su.id },
        data: {
          status: su.status,
          doneAt: su.status === "YAPILDI" ? new Date() : null,
        },
      });
    }
  }

  const plan = await (prisma as any).treatmentPlan.update({
    where: { id: params.id },
    data: { ...(status ? { status } : {}) },
    include: {
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(plan);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  await (prisma as any).treatmentPlan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
