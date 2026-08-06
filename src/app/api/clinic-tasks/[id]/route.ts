import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { clinicTaskUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("clinictasks:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bağlantısı bulunamadı." }, { status: 403 });
  }

  const existing = await prisma.clinicTask.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId },
  });
  if (!existing) {
    return NextResponse.json({ message: "Görev bulunamadı" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const parsed = clinicTaskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz güncelleme verisi" }, { status: 400 });
  }

  const p = parsed.data;

  const hasAssigneeUpdate = p.assignedToIds !== undefined || p.assignedToId !== undefined;
  const requestedAssignees = hasAssigneeUpdate
    ? Array.from(new Set([...(p.assignedToIds || []), ...(typeof p.assignedToId === "string" && p.assignedToId ? [p.assignedToId] : [])].filter(Boolean)))
    : undefined;

  if (requestedAssignees && requestedAssignees.length) {
    const assignees = await prisma.user.findMany({
      where: { id: { in: requestedAssignees }, institutionId: auth.user.institutionId, isActive: true },
      select: { id: true },
    });
    if (assignees.length !== requestedAssignees.length) {
      return NextResponse.json({ message: "Atanan personellerden bazıları kurumda bulunamadı veya artık aktif değil." }, { status: 400 });
    }
  }

  const nextStatus = p.status || existing.status;
  const nextDueAt = p.dueAt === undefined ? existing.dueAt : p.dueAt ? new Date(p.dueAt) : null;
  const nextRemindAt = p.remindAt === undefined ? existing.remindAt : p.remindAt ? new Date(p.remindAt) : null;
  if (nextDueAt && nextRemindAt && nextRemindAt > nextDueAt) {
    return NextResponse.json({ message: "Hatırlatma zamanı son tarihten sonra olamaz" }, { status: 400 });
  }

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
            : p.status !== undefined
              ? (nextStatus === "TAMAMLANDI" ? (existing.completedAt || new Date()) : null)
              : undefined,
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
        assignedTo: { select: { id: true, fullName: true, isActive: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  });

  await writeAudit(auth.user.id, "CLINIC_TASK_UPDATE", `${task.title} (oncelik:${task.priority}, durum:${task.status})`);

  return NextResponse.json(task);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("clinictasks:delete");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bağlantısı bulunamadı." }, { status: 403 });
  }

  const existing = await prisma.clinicTask.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId },
    select: { id: true, title: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Görev bulunamadı" }, { status: 404 });
  }

  if (existing.status === "IPTAL") return NextResponse.json({ ok: true, status: "IPTAL" });
  if (existing.status === "TAMAMLANDI") {
    return NextResponse.json({ message: "Tamamlanmış görev silinemez; işlem geçmişi korunmalıdır" }, { status: 409 });
  }

  await prisma.clinicTask.update({ where: { id: existing.id }, data: { status: "IPTAL", completedAt: null } });
  await writeAudit(auth.user.id, "CLINIC_TASK_CANCEL", existing.title);
  return NextResponse.json({ ok: true, status: "IPTAL" });
}
