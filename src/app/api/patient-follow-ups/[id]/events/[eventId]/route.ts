import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { patientFollowUpEventUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string; eventId: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  try {
  const auth = await requireAuth("hastatracking:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

    const event = await prisma.patientFollowUpEvent.findFirst({
      where: {
        id: params.eventId,
        voidedAt: null,
        followUpId: params.id,
        followUp: { patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId } },
      },
      include: {
        followUp: {
          select: {
            id: true,
            patient: { select: { fullName: true } },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "Süreç notu bulunamadı." }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patientFollowUpEventUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Geçersiz süreç notu güncellemesi" }, { status: 400 });
    }

    const updated = await prisma.patientFollowUpEvent.update({
      where: {
        id_institutionId_branchId: {
          id: event.id,
          institutionId: event.institutionId,
          branchId: event.branchId,
        },
      },
      data: {
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
        channel: parsed.data.channel === undefined ? undefined : (parsed.data.channel?.trim() || null),
        summary: parsed.data.summary?.trim(),
        detail: parsed.data.detail === undefined ? undefined : (parsed.data.detail?.trim() || null),
        patientResponse: parsed.data.patientResponse === undefined ? undefined : (parsed.data.patientResponse?.trim() || null),
        nextStep: parsed.data.nextStep === undefined ? undefined : (parsed.data.nextStep?.trim() || null),
        updatedById: auth.user.id,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_EVENT_UPDATE", `${event.followUp.patient.fullName} süreç notu güncellendi`);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Süreç notu şu an güncellenemiyor. Veritabanı bağlantısını kontrol edin." }, { status: 503 });
  }
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  try {
  const auth = await requireAuth("hastatracking:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

    const event = await prisma.patientFollowUpEvent.findFirst({
      where: {
        id: params.eventId,
        voidedAt: null,
        followUpId: params.id,
        followUp: { patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId } },
      },
      include: {
        followUp: {
          select: {
            patient: { select: { fullName: true } },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "Süreç notu bulunamadı." }, { status: 404 });
    }

    await prisma.patientFollowUpEvent.update({
      where: {
        id_institutionId_branchId: {
          id: event.id,
          institutionId: event.institutionId,
          branchId: event.branchId,
        },
      },
      data: { voidedAt: new Date(), voidedById: auth.user.id },
    });
    await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_EVENT_CANCEL", `${event.followUp.patient.fullName} süreç notu iptal edildi`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Süreç notu şu an silinemiyor. Veritabanı bağlantısını kontrol edin." }, { status: 503 });
  }
}
