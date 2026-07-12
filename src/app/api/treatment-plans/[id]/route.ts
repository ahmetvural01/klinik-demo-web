import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

const PLAN_STATUSES = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"];
const CLOSED_PLAN_STATUSES = new Set(["TAMAMLANDI", "IPTAL"]);

function treatmentPlanTenantWhere(id: string, institutionId: string | null | undefined, role: string) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { patient: { institutionId } } : {}),
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

  const hidePhone = shouldHidePatientPhone(user.role);
  const result = hidePhone
    ? {
        ...plan,
        patient: plan.patient ? { ...plan.patient, phone: "***" } : plan.patient,
      }
    : plan;
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("treatment:write");
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const body = await req.json();
  const { status, stepUpdates } = body;

  if (status !== undefined && !PLAN_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Geçersiz plan durumu" }, { status: 400 });
  }

  const existing = await (prisma as any).treatmentPlan.findFirst({
    where: treatmentPlanTenantWhere(params.id, user.institutionId, user.role),
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  // Tamamlanmış/iptal bir planın adımları, plan aynı istekte yeniden
  // açılmadıkça değiştirilemez (bkz. denetim raporu Tema 5 — önceden sunucu
  // tarafında hiçbir geçiş doğrulaması yoktu).
  const planStaysClosedOrClosing = CLOSED_PLAN_STATUSES.has(status ?? existing.status);
  if (stepUpdates && Array.isArray(stepUpdates) && stepUpdates.length > 0 && planStaysClosedOrClosing) {
    return NextResponse.json(
      { error: "Tamamlanmış/iptal edilmiş planın adımları değiştirilemez. Önce planı yeniden açın." },
      { status: 400 }
    );
  }

  if (stepUpdates && Array.isArray(stepUpdates)) {
    for (const su of stepUpdates) {
      await (prisma as any).treatmentStep.update({
        where: { id: su.id, planId: params.id },
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

  await writeAudit(auth.user.id, "TREATMENT_PLAN_UPDATE", `Tedavi planı güncellendi (${params.id})`);
  return NextResponse.json(plan);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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
