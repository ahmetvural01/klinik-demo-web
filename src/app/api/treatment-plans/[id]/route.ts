import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  await (prisma as any).treatmentPlan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
