import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { patientFollowUpUpdateSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = patientFollowUpUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz takip güncellemesi" }, { status: 400 });
  }

  const existing = await prisma.patientFollowUp.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    include: { patient: { select: { fullName: true } } },
  });
  if (!existing) {
    return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
  }

  const shouldClose = parsed.data.close === true || parsed.data.status === "KAPALI";
  const shouldOpen = parsed.data.close === false || parsed.data.status === "ACIK";

  const updated = await prisma.patientFollowUp.update({
    where: { id: params.id },
    data: {
      type: parsed.data.type,
      priority: parsed.data.priority,
      note: parsed.data.note,
      resolutionNote: parsed.data.resolutionNote,
      nextActionAt: parsed.data.nextActionAt === undefined
        ? undefined
        : parsed.data.nextActionAt
          ? new Date(parsed.data.nextActionAt)
          : null,
      lastContactAt: parsed.data.lastContactAt === undefined
        ? undefined
        : parsed.data.lastContactAt
          ? new Date(parsed.data.lastContactAt)
          : null,
      status: shouldClose ? "KAPALI" : shouldOpen ? "ACIK" : undefined,
      closedAt: shouldClose ? new Date() : shouldOpen ? null : undefined,
    },
    include: {
      patient: { select: { id: true, fullName: true, phone: true } },
      appointment: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          doctor: { select: { id: true, fullName: true } },
        },
      },
      assignedDoctor: { select: { id: true, fullName: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  });

  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_UPDATE", `${existing.patient.fullName} takip kaydı güncellendi`);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const existing = await prisma.patientFollowUp.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    include: { patient: { select: { fullName: true } } },
  });

  if (!existing) {
    return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
  }

  await prisma.patientFollowUp.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_DELETE", `${existing.patient.fullName} takip kaydı silindi`);

  return NextResponse.json({ ok: true });
}
