import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { patientFollowUpEventCreateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
  try {
  const auth = await requireAuth("hastatracking:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

    const followUp = await prisma.patientFollowUp.findFirst({
      where: { id: params.id, institutionId, branchId: branch.branchId },
      select: { id: true, patient: { select: { institutionId: true, homeBranchId: true } } },
    });

    if (!followUp) {
      return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
    }

    const events = await prisma.patientFollowUpEvent.findMany({
      where: { followUpId: params.id, institutionId, branchId: branch.branchId, voidedAt: null },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ message: "Veritabanı bağlantısı kurulamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  try {
  const auth = await requireAuth("hastatracking:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

    const followUp = await prisma.patientFollowUp.findFirst({
      where: { id: params.id, institutionId, branchId: branch.branchId },
      include: {
        patient: { select: { id: true, fullName: true, institutionId: true, homeBranchId: true } },
        createdBy: { select: { id: true, institutionId: true } },
      },
    });

    if (!followUp) {
      return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patientFollowUpEventCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Geçersiz süreç notu" }, { status: 400 });
    }

    const actorUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true },
    });
    const actorUserId = actorUser?.id || followUp.createdBy.id;

    const event = await prisma.patientFollowUpEvent.create({
      data: {
        institutionId,
        branchId: branch.branchId,
        followUpId: followUp.id,
        patientId: followUp.patientId,
        occurredAt: new Date(parsed.data.occurredAt),
        channel: parsed.data.channel?.trim() || null,
        summary: parsed.data.summary.trim(),
        detail: parsed.data.detail?.trim() || null,
        patientResponse: parsed.data.patientResponse?.trim() || null,
        nextStep: parsed.data.nextStep?.trim() || null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(actorUserId, "PATIENT_FOLLOW_UP_EVENT_CREATE", `${followUp.patient.fullName} için süreç notu eklendi`);
    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Süreç notu şu an kaydedilemiyor. Veritabanı bağlantısını kontrol edin." }, { status: 503 });
  }
}
