import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";

const PLAN_STATUSES = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"];
const CLOSED_PLAN_STATUSES = new Set(["TAMAMLANDI", "IPTAL"]);
const STEP_STATUSES = new Set(["BEKLIYOR", "YAPILDI", "TAMAMLANDI", "IPTAL"]);
const COMPLETED_STEP_STATUSES = new Set(["YAPILDI", "TAMAMLANDI"]);

function treatmentPlanTenantWhere(id: string, institutionId: string | null | undefined, role: string) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { patient: { institutionId } } : {}),
  };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:read");
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const plan = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, user.institutionId, user.role),
    include: {
      patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  if (!plan) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const hidePhone = await shouldHidePatientPhoneForRole(user.role);
  const result = hidePhone
    ? {
        ...plan,
        patient: plan.patient ? { ...plan.patient, phone: "***" } : plan.patient,
      }
    : plan;
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:write");
  if (auth.error) return auth.error;
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
    force?: unknown;
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
  if (normalizedStepUpdates.some((step) => deleteIds.has(step.id as string))) {
    return NextResponse.json({ error: "Aynı adım aynı istekte hem silinip hem güncellenemez" }, { status: 400 });
  }

  const existing = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, user.institutionId, user.role),
    select: { id: true, status: true, patientId: true, doctorId: true, createdAt: true, totalCost: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const referencedStepIds = [...new Set([...deleteIds, ...normalizedStepUpdates.map((step) => step.id as string)])];
  if (referencedStepIds.length > 0) {
    const existingSteps = await (prisma as any).treatmentStep.findMany({
      where: { planId: params.id, id: { in: referencedStepIds } },
      select: { id: true },
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
      { error: "Tamamlanmış/iptal edilmiş planın adımları değiştirilemez. Önce planı yeniden açın." },
      { status: 400 }
    );
  }

  // Bu istekte adımlar değişirken plan aynı anda tamamlanıyorsa koşulu
  // mutasyondan ÖNCE hesapla. Aksi halde adımlar silinip/güncellenip daha
  // sonra 400 dönülebilir ve kullanıcı hata görürken veri kısmen değişirdi.
  if (status === "TAMAMLANDI" && existing.status !== "TAMAMLANDI") {
    const currentSteps = await (prisma as any).treatmentStep.findMany({
      where: { planId: params.id },
      select: { id: true, status: true },
    });
    const projectedSteps = currentSteps
      .filter((step: { id: string }) => !deleteIds.has(step.id))
      .map((step: { id: string; status: string }) => {
        const update = normalizedStepUpdates.find((candidate) => candidate.id === step.id);
        return update ? { status: update.status as string } : { status: step.status };
      });
    if (projectedSteps.length === 0) {
      return NextResponse.json(
        { error: "Adımı olmayan bir tedavi planı \"Tamamlandı\" olarak işaretlenemez." },
        { status: 400 }
      );
    }
    if (projectedSteps.some((step: { status: string }) => !COMPLETED_STEP_STATUSES.has(step.status))) {
      return NextResponse.json(
        { error: "Bekleyen adımları olan bir tedavi planı \"Tamamlandı\" olarak işaretlenemez. Önce tüm adımları \"Yapıldı\" olarak işaretleyin." },
        { status: 400 }
      );
    }
  }

  if (normalizedStepDeletes.length > 0) {
    // Payment modeli doğrudan bir tedavi planına bağlı değil (planId FK'sı
    // yok), bu yüzden adım silindiğinde toplam tutar (totalCost) hastanın bu
    // plan oluşturulduktan sonra bu doktora yaptığı tahsilatların altına
    // düşüyorsa uyarıyoruz — kesin bir eşleşme değil (aynı hasta+doktor için
    // birden fazla plan olabilir) ama ödeme kaydıyla tedavi tutarının
    // sessizce tutarsızlaşmasına karşı en azından bir sinyal veriyor
    // (bkz. denetim raporu — tedavi planı tutarı ödeme defterinden kopuk).
    if (body.force !== true) {
      const deletedTotal = await (prisma as any).treatmentStep.aggregate({
        where: { id: { in: normalizedStepDeletes as string[] }, planId: params.id },
        _sum: { amount: true },
      });
      const newTotalCost = Number(existing.totalCost || 0) - Number(deletedTotal._sum.amount || 0);
      const paidSinceCreation = await prisma.payment.aggregate({
        where: {
          patientId: existing.patientId,
          doctorId: existing.doctorId,
          status: "ACTIVE",
          createdAt: { gte: existing.createdAt },
        },
        _sum: { amount: true },
      });
      const paidAmount = Number(paidSinceCreation._sum.amount || 0);
      if (paidAmount > 0 && newTotalCost < paidAmount - 0.01) {
        return NextResponse.json({
          error: `Bu hasta, plan oluşturulduktan sonra bu doktora ${paidAmount.toFixed(2)} TL ödeme yapmış — silinecek adımlarla yeni plan tutarı (${newTotalCost.toFixed(2)} TL) bunun altına düşüyor. Devam etmek istediğinize emin misiniz?`,
          requiresForce: true,
        }, { status: 409 });
      }
    }

    await (prisma as any).treatmentStep.deleteMany({
      where: { id: { in: normalizedStepDeletes as string[] }, planId: params.id },
    });
  }

  if (normalizedStepUpdates.length > 0) {
    for (const su of normalizedStepUpdates) {
      await (prisma as any).treatmentStep.update({
        where: { id: su.id as string, planId: params.id },
        data: {
          status: su.status as string,
          doneAt: COMPLETED_STEP_STATUSES.has(su.status as string) ? new Date() : null,
        },
      });
    }
  }

  // Bir plan "Tamamlandı" işaretlenmeden önce (adım silme/güncellemeleri bu
  // istekte uygulandıktan SONRA) kalan tüm adımların fiilen "Yapıldı" olması
  // gerekir — aksi halde 0 adımlı VEYA hâlâ bekleyen adımları olan bir plan
  // "Tamamlandı" görünüp raporlarda sessizce yanıltıcı veri üretiyordu
  // (bkz. denetim raporu).
  if (status === "TAMAMLANDI" && existing.status !== "TAMAMLANDI") {
    const remainingSteps = await (prisma as any).treatmentStep.findMany({
      where: { planId: params.id },
      select: { status: true },
    });
    if (remainingSteps.length === 0) {
      return NextResponse.json(
        { error: "Adımı olmayan bir tedavi planı \"Tamamlandı\" olarak işaretlenemez." },
        { status: 400 }
      );
    }
    if (remainingSteps.some((s: { status: string }) => !COMPLETED_STEP_STATUSES.has(s.status))) {
      return NextResponse.json(
        { error: "Bekleyen adımları olan bir tedavi planı \"Tamamlandı\" olarak işaretlenemez. Önce tüm adımları \"Yapıldı\" olarak işaretleyin." },
        { status: 400 }
      );
    }
  }

  const recomputedTotalCost = normalizedStepDeletes.length > 0
    ? await (prisma as any).treatmentStep.aggregate({ where: { planId: params.id }, _sum: { amount: true } }).then((r: any) => Number(r._sum.amount ?? 0))
    : undefined;

  const plan = await (prisma as any).treatmentPlan.update({
    where: { id: params.id },
    data: { ...(status ? { status } : {}), ...(recomputedTotalCost !== undefined ? { totalCost: recomputedTotalCost } : {}) },
    include: {
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "TREATMENT_PLAN_UPDATE", `Tedavi planı güncellendi (${params.id})`);
  return NextResponse.json(plan);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("treatment:delete");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const existing = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, auth.user.institutionId, auth.user.role),
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  await (prisma as any).treatmentPlan.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "TREATMENT_PLAN_DELETE", `Tedavi planı silindi (${params.id})`);
  return NextResponse.json({ ok: true });
}
