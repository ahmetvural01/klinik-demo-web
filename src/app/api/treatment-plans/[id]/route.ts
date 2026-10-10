import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { PLAN_STATUS_LABEL, activeStepsTotal, withActiveTotal } from "@/app/api/treatment-plans/plan-total";

const PLAN_STATUSES = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"];
const CLOSED_PLAN_STATUSES = new Set(["TAMAMLANDI", "IPTAL"]);
const STEP_STATUSES = new Set(["BEKLIYOR", "YAPILDI", "TAMAMLANDI", "IPTAL"]);
const COMPLETED_STEP_STATUSES = new Set(["YAPILDI", "TAMAMLANDI"]);
const PLAN_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  PLANLANDI: new Set(["DEVAM_EDIYOR", "IPTAL"]),
  DEVAM_EDIYOR: new Set(["TAMAMLANDI", "IPTAL"]),
  TAMAMLANDI: new Set(),
  IPTAL: new Set(),
};
const STEP_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  BEKLIYOR: new Set(["YAPILDI", "TAMAMLANDI", "IPTAL"]),
  YAPILDI: new Set(),
  TAMAMLANDI: new Set(),
  IPTAL: new Set(),
};

/**
 * Plan "Tamamlandı" olabilir mi? Bekleyen adım kalmamalı ve en az bir adım
 * yapılmış olmalı. İptal edilen adım tamamlamayı ENGELLEMEZ: önceden iptal
 * edilmiş adım "işlem görmüş" sayılıp kaldırılamadığı için böyle bir plan hiç
 * tamamlanamıyordu (yalnız iptal edilebiliyordu).
 */
const COMPLETION_ERROR: Record<string, string> = {
  PLAN_HAS_NO_STEPS: "Adımı olmayan tedavi planı tamamlanamaz.",
  PLAN_HAS_PENDING_STEPS: "Bekleyen adımı olan plan tamamlanamaz. Önce adımları “Yapıldı” ya da “İptal” olarak işaretleyin.",
  PLAN_HAS_NO_DONE_STEPS: "Yapılmış adımı olmayan plan tamamlanamaz; tedavi yapılmayacaksa planı iptal edin.",
};

function completionErrorCode(steps: ReadonlyArray<{ status: string }>) {
  if (steps.length === 0) return "PLAN_HAS_NO_STEPS";
  if (steps.some((step) => step.status === "BEKLIYOR")) return "PLAN_HAS_PENDING_STEPS";
  if (!steps.some((step) => COMPLETED_STEP_STATUSES.has(step.status))) return "PLAN_HAS_NO_DONE_STEPS";
  return null;
}

function isAllowedTransition(current: string, next: string, transitions: Record<string, ReadonlySet<string>>) {
  return current === next || Boolean(transitions[current]?.has(next));
}

function treatmentPlanTenantWhere(id: string, institutionId: string | null | undefined, branchId: string) {
  return {
    id,
    institutionId: institutionId || "__no_institution__",
    branchId,
  };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const plan = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, user.institutionId, branch.branchId),
    include: {
      patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { where: { archivedAt: null }, orderBy: { order: "asc" } },
    },
  });

  if (!plan) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const hidePhone = !(await hasEffectivePermission(user, "patients:phone"));
  const withTotal = withActiveTotal(plan);
  const result = hidePhone
    ? {
        ...withTotal,
        patient: plan.patient ? { ...plan.patient, phone: "***", tcNo: plan.patient.tcNo ? "***" : plan.patient.tcNo } : plan.patient,
      }
    : withTotal;
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { status, stepUpdates, stepDeletes } = body as {
    status?: unknown;
    stepUpdates?: unknown;
    stepDeletes?: unknown;
  };

  if (status !== undefined && (typeof status !== "string" || !PLAN_STATUSES.includes(status))) {
    return NextResponse.json({ error: "Geçersiz plan durumu" }, { status: 400 });
  }

  if (stepUpdates !== undefined && (!Array.isArray(stepUpdates) || stepUpdates.length > 100)) {
    return NextResponse.json({ error: "Tedavi adımları geçersiz veya çok fazla" }, { status: 400 });
  }
  if (stepDeletes !== undefined && (!Array.isArray(stepDeletes) || stepDeletes.length > 100)) {
    return NextResponse.json({ error: "Silinecek tedavi adımları geçersiz veya çok fazla" }, { status: 400 });
  }

  const normalizedStepUpdates = (stepUpdates ?? []) as Array<{ id?: unknown; status?: unknown }>;
  const normalizedStepDeletes = (stepDeletes ?? []) as unknown[];
  if (normalizedStepUpdates.some((step) => !step || typeof step !== "object" || typeof step.id !== "string" || !step.id || typeof step.status !== "string" || !STEP_STATUSES.has(step.status))) {
    return NextResponse.json({ error: "Tedavi adımı durumu geçersiz" }, { status: 400 });
  }
  if (normalizedStepDeletes.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "Silinecek tedavi adımı geçersiz" }, { status: 400 });
  }
  const deleteIds = new Set(normalizedStepDeletes as string[]);
  const updateIds = normalizedStepUpdates.map((step) => step.id as string);
  if (new Set(updateIds).size !== updateIds.length) {
    return NextResponse.json({ error: "Aynı tedavi adımı bir istekte birden fazla güncellenemez" }, { status: 400 });
  }
  if (normalizedStepUpdates.some((step) => deleteIds.has(step.id as string))) {
    return NextResponse.json({ error: "Aynı adım aynı istekte hem silinip hem güncellenemez" }, { status: 400 });
  }

  const existing = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, user.institutionId, branch.branchId),
    select: { id: true, status: true, patientId: true, doctorId: true, createdAt: true, totalCost: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (typeof status === "string" && !isAllowedTransition(existing.status, status, PLAN_TRANSITIONS)) {
    return NextResponse.json(
      { error: `“${PLAN_STATUS_LABEL[existing.status] || existing.status}” durumundaki plan “${PLAN_STATUS_LABEL[status] || status}” yapılamaz.` },
      { status: 409 },
    );
  }

  const referencedStepIds = [...new Set([...deleteIds, ...normalizedStepUpdates.map((step) => step.id as string)])];
  if (referencedStepIds.length > 0) {
    const existingSteps = await (prisma as any).treatmentStep.findMany({
      where: { planId: params.id, archivedAt: null, id: { in: referencedStepIds } },
      select: { id: true, status: true },
    });
    if (existingSteps.length !== referencedStepIds.length) {
      return NextResponse.json({ error: "Tedavi adımlarından biri bu plana ait değil veya bulunamadı" }, { status: 400 });
    }
  }

  // Tamamlanmış/iptal bir planın adımları, plan aynı istekte yeniden
  // açılmadıkça değiştirilemez (bkz. denetim raporu Tema 5 — önceden sunucu
  // tarafında hiçbir geçiş doğrulaması yoktu).
  const planStaysClosedOrClosing = CLOSED_PLAN_STATUSES.has(status ?? existing.status);
  const hasStepChanges = normalizedStepUpdates.length > 0 || normalizedStepDeletes.length > 0;
  if (hasStepChanges && planStaysClosedOrClosing) {
    return NextResponse.json(
      { error: "Tamamlanmış ya da iptal edilmiş planın adımları değiştirilemez." },
      { status: 400 }
    );
  }

  // Bu istekte adımlar değişirken plan aynı anda tamamlanıyorsa koşulu
  // mutasyondan ÖNCE hesapla. Aksi halde adımlar silinip/güncellenip daha
  // sonra 400 dönülebilir ve kullanıcı hata görürken veri kısmen değişirdi.
  if (status === "TAMAMLANDI" && existing.status !== "TAMAMLANDI") {
    const currentSteps = await (prisma as any).treatmentStep.findMany({
      where: { planId: params.id, archivedAt: null },
      select: { id: true, status: true },
    });
    const projectedSteps = currentSteps
      .filter((step: { id: string }) => !deleteIds.has(step.id))
      .map((step: { id: string; status: string }) => {
        const update = normalizedStepUpdates.find((candidate) => candidate.id === step.id);
        return update ? { status: update.status as string } : { status: step.status };
      });
    const blocked = completionErrorCode(projectedSteps);
    if (blocked) {
      return NextResponse.json({ error: COMPLETION_ERROR[blocked] }, { status: 400 });
    }
  }

  let plan;
  try {
    plan = await prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      await transaction.$queryRaw`SELECT "id" FROM "TreatmentPlan" WHERE "id" = ${params.id} FOR UPDATE`;

      const lockedPlan = await tx.treatmentPlan.findFirst({
        where: treatmentPlanTenantWhere(params.id, user.institutionId, branch.branchId),
        select: { id: true, status: true, patientId: true, doctorId: true, createdAt: true, totalCost: true },
      });
      if (!lockedPlan) throw new Error("PLAN_NOT_FOUND");
      if (typeof status === "string" && !isAllowedTransition(lockedPlan.status, status, PLAN_TRANSITIONS)) {
        throw new Error("INVALID_PLAN_TRANSITION");
      }

      let lockedSteps: Array<{ id: string; status: string }> = [];
      if (referencedStepIds.length > 0) {
        lockedSteps = await tx.treatmentStep.findMany({
          where: { planId: params.id, archivedAt: null, id: { in: referencedStepIds } },
          select: { id: true, status: true },
        });
        if (lockedSteps.length !== referencedStepIds.length) throw new Error("STEP_NOT_FOUND");
      }

      for (const stepUpdate of normalizedStepUpdates) {
        const current = lockedSteps.find((step) => step.id === stepUpdate.id);
        if (!current || !isAllowedTransition(current.status, stepUpdate.status as string, STEP_TRANSITIONS)) {
          throw new Error("INVALID_STEP_TRANSITION");
        }
      }
      const deletedSteps = lockedSteps.filter((step) => deleteIds.has(step.id));
      if (deletedSteps.some((step) => step.status !== "BEKLIYOR")) {
        throw new Error("STEP_HISTORY_PROTECTED");
      }

      if (normalizedStepDeletes.length > 0) {
        await tx.treatmentStep.updateMany({
          where: { id: { in: normalizedStepDeletes as string[] }, planId: params.id, archivedAt: null },
          data: {
            archivedAt: new Date(),
            archivedById: auth.user.id,
            archiveReason: "Tedavi planı düzenlenirken kaldırıldı",
          },
        });
      }

      for (const stepUpdate of normalizedStepUpdates) {
        await tx.treatmentStep.update({
          where: { id: stepUpdate.id as string, planId: params.id, archivedAt: null },
          data: {
            status: stepUpdate.status as string,
            doneAt: COMPLETED_STEP_STATUSES.has(stepUpdate.status as string) ? new Date() : null,
          },
        });
      }

      if (status === "TAMAMLANDI" && lockedPlan.status !== "TAMAMLANDI") {
        const remainingSteps = await tx.treatmentStep.findMany({
          where: { planId: params.id, archivedAt: null },
          select: { status: true },
        });
        const blocked = completionErrorCode(remainingSteps);
        if (blocked) throw new Error(blocked);
      }

      // Adım kaldırıldığında ya da durumu değiştiğinde toplam yeniden hesaplanır;
      // iptal edilen adım toplama girmez (Decimal ile).
      const recomputedTotalCost = normalizedStepDeletes.length > 0 || normalizedStepUpdates.length > 0
        ? activeStepsTotal(await tx.treatmentStep.findMany({ where: { planId: params.id, archivedAt: null }, select: { amount: true, status: true } }))
        : undefined;

      return tx.treatmentPlan.update({
        where: { id: params.id },
        data: { ...(status ? { status } : {}), ...(recomputedTotalCost !== undefined ? { totalCost: recomputedTotalCost } : {}) },
        include: {
          patient: { select: { id: true, fullName: true } },
          doctor:  { select: { id: true, fullName: true } },
          steps:   { where: { archivedAt: null }, orderBy: { order: "asc" } },
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "STEP_NOT_FOUND") {
      return NextResponse.json({ error: "Tedavi adımlarından biri bu plana ait değil veya artık bulunamıyor" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVALID_PLAN_TRANSITION") {
      return NextResponse.json({ error: "Tedavi planı başka bir kullanıcı tarafından değiştirildi; bu durum geçişi artık geçerli değil." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVALID_STEP_TRANSITION") {
      return NextResponse.json({ error: "“Yapıldı” ya da “İptal” olarak işaretlenen adım geri alınamaz. Ekranı yenileyip tekrar deneyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "STEP_HISTORY_PROTECTED") {
      return NextResponse.json({ error: "İşlem görmüş veya iptal edilmiş tedavi adımı kaldırılamaz; klinik geçmişte korunmalıdır." }, { status: 409 });
    }
    if (error instanceof Error && COMPLETION_ERROR[error.message]) {
      return NextResponse.json({ error: COMPLETION_ERROR[error.message] }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ error: "Tedavi planı aynı anda başka bir kullanıcı tarafından değiştirildi. Lütfen yenileyip tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }

  await writeAudit(auth.user.id, "TREATMENT_PLAN_UPDATE", `Tedavi planı güncellendi (${params.id})`);
  return NextResponse.json(withActiveTotal(plan));
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:delete");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const existing = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, auth.user.institutionId, branch.branchId),
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (existing.status === "TAMAMLANDI") {
    return NextResponse.json({ error: "Tamamlanmış tedavi planı silinemez; klinik geçmişte korunmalıdır." }, { status: 409 });
  }

  if (existing.status !== "IPTAL") {
    await (prisma as any).treatmentPlan.update({
      where: {
        id_institutionId_branchId: {
          id: params.id,
          institutionId: auth.user.institutionId,
          branchId: branch.branchId,
        },
      },
      data: { status: "IPTAL" },
    });
    await writeAudit(auth.user.id, "TREATMENT_PLAN_CANCEL", `Tedavi planı iptal edildi (${params.id})`);
  }
  return NextResponse.json({ ok: true, status: "IPTAL" });
}
