import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { clinicTaskUpdateSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum baglantisi bulunamadi" }, { status: 403 });
  }

  const existing = await prisma.clinicTask.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId },
  });
  if (!existing) {
    return NextResponse.json({ message: "Gorev bulunamadi" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = clinicTaskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Gecersiz guncelleme verisi" }, { status: 400 });
  }

  const p = parsed.data;

  const requestedAssignees = p.assignedToIds
    ? Array.from(new Set([...(p.assignedToIds || []), ...(typeof p.assignedToId === "string" && p.assignedToId ? [p.assignedToId] : [])].filter(Boolean)))
    : undefined;

  if (requestedAssignees && requestedAssignees.length) {
    const assignees = await prisma.user.findMany({
      where: { id: { in: requestedAssignees }, institutionId: auth.user.institutionId },
      select: { id: true },
    });
    if (assignees.length !== requestedAssignees.length) {
      return NextResponse.json({ message: "Atanan personellerden bazi kayitlar kurumda bulunamadi" }, { status: 400 });
    }
  }

  const nextStatus = p.status || existing.status;

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.clinicTask.update({
      where: { id: existing.id },
      data: {
        title: p.title,
        details: p.details === undefined ? undefined : p.details || null,
        vendorName: p.vendorName === undefined ? undefined : p.vendorName || null,
        type: p.type,
        priority: p.priority,
        status: p.status,
        dueAt: p.dueAt === undefined ? undefined : p.dueAt ? new Date(p.dueAt) : null,
        remindAt: p.remindAt === undefined ? undefined : p.remindAt ? new Date(p.remindAt) : null,
        assignedToId:
          requestedAssignees !== undefined
            ? (requestedAssignees[0] || null)
            : (p.assignedToId === undefined ? undefined : p.assignedToId || null),
        completedAt:
          p.completedAt !== undefined
            ? (p.completedAt ? new Date(p.completedAt) : null)
            : (nextStatus === "TAMAMLANDI" ? new Date() : nextStatus === "ACIK" ? null : undefined),
      },
    });

    if (requestedAssignees !== undefined) {
      await tx.clinicTaskAssignee.deleteMany({ where: { taskId: existing.id } });
      if (requestedAssignees.length) {
        await tx.clinicTaskAssignee.createMany({
          data: requestedAssignees.map((userId) => ({ taskId: existing.id, userId })),
          skipDuplicates: true,
        });
      }
    }

    return tx.clinicTask.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  });

  await writeAudit(auth.user.id, "CLINIC_TASK_UPDATE", `${task.title} (oncelik:${task.priority}, durum:${task.status})`);

  return NextResponse.json(task);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum baglantisi bulunamadi" }, { status: 403 });
  }

  const existing = await prisma.clinicTask.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId },
    select: { id: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Gorev bulunamadi" }, { status: 404 });
  }

  await prisma.clinicTask.delete({ where: { id: existing.id } });
  await writeAudit(auth.user.id, "CLINIC_TASK_DELETE", existing.title);
  return NextResponse.json({ ok: true });
}
