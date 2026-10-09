import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { z } from "zod";
import { patientFollowUpEventCreateSchema } from "@/lib/validators";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { FOLLOW_UP_INCLUDE, maskFollowUpPhone } from "../../follow-up-include";

// "Görüşme kaydet" tek adımda hem görüşmeyi geçmişe yazar hem takibin
// sonucunu (tür, son görüşme, sonraki arama, kapanış) günceller. Önceden iki
// ayrı yol vardı ve ikisi de yarım kalıyordu: not girilince takip "Gecikti"
// kalıyor, sonuç düğmesine basılınca geçmişe hiçbir şey yazılmıyordu (bkz.
// denetim HL-02). Sonuç alanları isteğe bağlıdır; verilmezse eskisi gibi
// yalnız görüşme notu eklenir.
const eventWithOutcomeSchema = patientFollowUpEventCreateSchema.extend({
  outcome: z.object({
    type: z.enum(["GERI_ARA", "ULASILAMADI", "DONUS_BEKLENIYOR", "DIGER"]).optional(),
    nextActionAt: z.string().datetime().nullable().optional(),
    close: z.boolean().optional(),
    resolutionNote: z.string().max(2000).optional(),
  }).optional(),
});

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
        patient: { select: { id: true, fullName: true, institutionId: true, homeBranchId: true, archivedAt: true } },
        createdBy: { select: { id: true, institutionId: true } },
      },
    });

    if (!followUp) {
      return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
    }
    if (followUp.patient.archivedAt) {
      return NextResponse.json({ message: "Hasta arşivlenmiş; görüşme eklemek için önce hastayı arşivden çıkarın." }, { status: 409 });
    }

    const body = await request.json();
    const parsed = eventWithOutcomeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Geçersiz süreç notu" }, { status: 400 });
    }

    const actorUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true },
    });
    const actorUserId = actorUser?.id || followUp.createdBy.id;

    const occurredAt = new Date(parsed.data.occurredAt);
    const outcome = parsed.data.outcome;
    const { event, updatedFollowUp } = await prisma.$transaction(async (tx) => {
      const created = await tx.patientFollowUpEvent.create({
        data: {
          institutionId,
          branchId: branch.branchId,
          followUpId: followUp.id,
          patientId: followUp.patientId,
          occurredAt,
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
      if (!outcome) return { event: created, updatedFollowUp: null };
      const close = outcome.close === true;
      const updated = await tx.patientFollowUp.update({
        where: {
          id_institutionId_branchId: {
            id: followUp.id,
            institutionId: followUp.institutionId,
            branchId: followUp.branchId,
          },
        },
        data: {
          type: outcome.type,
          lastContactAt: occurredAt,
          nextActionAt: close
            ? null
            : outcome.nextActionAt === undefined
              ? undefined
              : outcome.nextActionAt
                ? new Date(outcome.nextActionAt)
                : null,
          ...(close
            ? {
                status: "KAPALI",
                closedAt: new Date(),
                resolutionNote: (outcome.resolutionNote || parsed.data.summary).trim(),
              }
            : {}),
        },
        include: FOLLOW_UP_INCLUDE,
      });
      return { event: created, updatedFollowUp: updated };
    });

    await writeAudit(
      actorUserId,
      "PATIENT_FOLLOW_UP_EVENT_CREATE",
      `${followUp.patient.fullName} için görüşme kaydedildi${outcome?.close ? " ve takip kapatıldı" : ""}`,
    );
    const hidePhone = updatedFollowUp ? await shouldHidePatientPhoneForRole(auth.user.role) : false;
    return NextResponse.json(
      { ...event, followUp: updatedFollowUp ? maskFollowUpPhone(updatedFollowUp, hidePhone) : null },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ message: "Süreç notu şu an kaydedilemiyor. Veritabanı bağlantısını kontrol edin." }, { status: 503 });
  }
}
