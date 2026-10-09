import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { patientFollowUpUpdateSchema } from "@/lib/validators";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { FOLLOW_UP_INCLUDE, maskFollowUpPhone } from "../follow-up-include";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("hastatracking:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

  const body = await request.json();
  const parsed = patientFollowUpUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz takip güncellemesi" }, { status: 400 });
  }

  const existing = await prisma.patientFollowUp.findFirst({
    where: {
      id: params.id,
      patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId },
    },
    include: { patient: { select: { fullName: true } } },
  });
  if (!existing) {
    return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
  }

  const shouldClose = parsed.data.close === true || parsed.data.status === "KAPALI";
  const shouldOpen = parsed.data.close === false || parsed.data.status === "ACIK";

  const updated = await prisma.patientFollowUp.update({
    where: {
      id_institutionId_branchId: {
        id: existing.id,
        institutionId: existing.institutionId,
        branchId: existing.branchId,
      },
    },
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
    include: FOLLOW_UP_INCLUDE,
  });

  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_UPDATE", `${existing.patient.fullName} takip kaydı güncellendi`);
  const hidePhone = await shouldHidePatientPhoneForRole(auth.user.role);
  return NextResponse.json(maskFollowUpPhone(updated, hidePhone));
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("hastatracking:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

  const existing = await prisma.patientFollowUp.findFirst({
    where: {
      id: params.id,
      patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId },
    },
    include: { patient: { select: { fullName: true } } },
  });

  if (!existing) {
    return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
  }

  await prisma.patientFollowUp.update({
    where: {
      id_institutionId_branchId: {
        id: existing.id,
        institutionId: existing.institutionId,
        branchId: existing.branchId,
      },
    },
    data: { status: "KAPALI", closedAt: new Date(), resolutionNote: "Takip kaydı iptal edildi." },
  });
  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_CANCEL", `${existing.patient.fullName} takip kaydı iptal edildi`);

  return NextResponse.json({ ok: true });
}
