import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { requireActiveBranch } from "@/lib/branch-context";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { activeStepsTotal, withActiveTotal } from "@/app/api/treatment-plans/plan-total";

const PLAN_STATUSES = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"] as const;
const MAX_STEP_AMOUNT = new Prisma.Decimal("99999999.99");

export const GET = withApiTiming("treatment-plans", async function GET(req: NextRequest) {
  const auth = await requireAuth("treatment:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  const user = auth.user;
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status    = searchParams.get("status");
  const doctorId  = searchParams.get("doctorId");
  const q         = (searchParams.get("q") || "").trim();
  if (status && !PLAN_STATUSES.includes(status as (typeof PLAN_STATUSES)[number])) {
    return NextResponse.json({ error: "Geçersiz tedavi planı durumu" }, { status: 400 });
  }
  const { page, take, skip, pageCount } = parsePagination(searchParams, { defaultTake: 30, maxTake: 100 });

  const baseWhere: Record<string, unknown> = {
    ...(patientId ? { patientId } : {}),
    ...(status    ? { status }    : {}),
    ...(doctorId  ? { doctorId }  : {}),
    institutionId: user.institutionId,
    branchId: branch.branchId,
  };
  const searchWhere = q
    ? {
        OR: [
          { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
          { title:   { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const listWhere = q ? { AND: [baseWhere, searchWhere] } : baseWhere;
  // Durum sayaçları listeyle aynı süzgeçlerle (hasta, hekim, arama) — yalnız durum hariç;
  // önceden sekme sayısı hekim/arama süzgecini yok sayıyor, listeyle uyuşmuyordu.
  const { status: _status, ...countBase } = baseWhere;
  const countWhere = q ? { AND: [countBase, searchWhere] } : countBase;

  const [total, plans, statusCountsRaw] = await Promise.all([
    (prisma as any).treatmentPlan.count({ where: listWhere }),
    (prisma as any).treatmentPlan.findMany({
      where: listWhere,
      include: {
        patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
        doctor:  { select: { id: true, fullName: true } },
        steps:   { where: { archivedAt: null }, orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    (prisma as any).treatmentPlan.groupBy({
      by: ["status"],
      where: countWhere,
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = Object.fromEntries(PLAN_STATUSES.map((s) => [s, 0]));
  for (const row of statusCountsRaw) statusCounts[row.status] = row._count._all;
  const totalAll = Object.values(statusCounts).reduce((s, n) => s + n, 0);

  const hidePhone = !(await hasEffectivePermission(user, "patients:phone"));
  const items = plans.map((plan: any) => {
    const withTotal = withActiveTotal(plan);
    return hidePhone
      ? { ...withTotal, patient: plan.patient ? { ...plan.patient, phone: "***", tcNo: plan.patient.tcNo ? "***" : plan.patient.tcNo } : plan.patient }
      : withTotal;
  });

  return NextResponse.json({
    items,
    total,
    page,
    pageCount: pageCount(total),
    stats: { total: totalAll, byStatus: statusCounts },
  });
});

/** "1250.50", 1250.5 → Decimal (2 hane); geçersizse null. */
function parseStepAmount(value: unknown): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return new Prisma.Decimal(0);
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d{1,12}(\.\d+)?$/.test(text)) return null;
  try {
    const amount = new Prisma.Decimal(text).toDecimalPlaces(2);
    return amount.greaterThan(MAX_STEP_AMOUNT) ? null : amount;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("treatment:write");
  if (auth.error) return auth.error;
  const user = auth.user;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const rawRequestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  if (rawRequestKey && (rawRequestKey.length < 8 || rawRequestKey.length > 180)) {
    return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  const requestKey = rawRequestKey;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  const { patientId, doctorId, title, notes, steps = [] } = body as {
    patientId?: unknown;
    doctorId?: unknown;
    title?: unknown;
    notes?: unknown;
    steps?: unknown;
  };

  if (
    typeof patientId !== "string" || !patientId.trim() || patientId.trim().length > 80
    || typeof doctorId !== "string" || !doctorId.trim() || doctorId.trim().length > 80
    || typeof title !== "string" || !title.trim()
  ) {
    return NextResponse.json({ error: "Hasta, hekim ve plan adı zorunludur." }, { status: 400 });
  }
  // Tedavi kaydı ve reçeteyle aynı kural: doktor planı yalnız kendi adına açar
  // (görünmez destek oturumu hariç). Yönetici, asistan ve banko hekim seçer.
  if (user.role === "DOKTOR" && !user.ghost && doctorId.trim() !== user.id) {
    return NextResponse.json({ error: "Yalnız kendi adınıza tedavi planı açabilirsiniz." }, { status: 403 });
  }

  if (
    title.trim().length > 200
    || (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 5000))
  ) {
    return NextResponse.json({ error: "Plan başlığı veya notu geçersiz" }, { status: 400 });
  }

  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 100) {
    return NextResponse.json({ error: "Tedavi adımları geçersiz veya çok fazla" }, { status: 400 });
  }

  const normalizedSteps: Array<{ treatmentName: string; toothNo?: string; amount: Prisma.Decimal; note?: string }> = [];
  for (const [index, rawStep] of steps.entries()) {
    if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımı geçersiz` }, { status: 400 });
    }
    const step = rawStep as { treatmentName?: unknown; toothNo?: unknown; amount?: unknown; note?: unknown };
    const treatmentName = typeof step.treatmentName === "string" ? step.treatmentName.trim() : "";
    // Tutar Decimal olarak okunur; JS number ile toplama/yuvarlama yapılmaz.
    const amount = parseStepAmount(step.amount);
    if (!treatmentName || treatmentName.length > 200) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının adı zorunludur` }, { status: 400 });
    }
    if (!amount) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının tutarı geçersiz` }, { status: 400 });
    }
    if (step.toothNo !== undefined && step.toothNo !== null && (typeof step.toothNo !== "string" || step.toothNo.length > 50)) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının diş numarası geçersiz` }, { status: 400 });
    }
    if (step.note !== undefined && step.note !== null && (typeof step.note !== "string" || step.note.length > 2000)) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının notu geçersiz` }, { status: 400 });
    }
    normalizedSteps.push({
      treatmentName,
      toothNo: typeof step.toothNo === "string" && step.toothNo.trim() ? step.toothNo.trim() : undefined,
      amount,
      note: typeof step.note === "string" ? step.note.trim() || undefined : undefined,
    });
  }

  const planInclude = {
    patient: { select: { id: true, fullName: true } },
    doctor:  { select: { id: true, fullName: true } },
    steps:   { where: { archivedAt: null }, orderBy: { order: "asc" } },
  };

  // Aynı işlem anahtarıyla tekrar gelen istek (ağ yeniden denemesi) ikinci plan açmaz.
  if (requestKey) {
    const existingPlan = await (prisma as any).treatmentPlan.findFirst({
      where: { requestKey, institutionId: user.institutionId, branchId: branch.branchId },
      include: planInclude,
    });
    if (existingPlan) {
      const { requestKey: _existingKey, ...publicPlan } = existingPlan;
      return NextResponse.json({ ...withActiveTotal(publicPlan), duplicateRequest: true }, { status: 200 });
    }
  }

  const [patient, doctor] = await Promise.all([
    (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        institutionId: user.institutionId,
        homeBranchId: branch.branchId,
      },
      select: { id: true },
    }),
    (prisma as any).user.findFirst({
      where: { id: doctorId, ...effectiveDoctorWhere(user.institutionId, branch.branchId) },
      select: { id: true },
    }),
  ]);
  if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
  if (!doctor) return NextResponse.json({ error: "Seçilen hekim bu şubede bulunamadı. Hekim listesinden yeniden seçin." }, { status: 404 });

  const totalCost = activeStepsTotal(normalizedSteps.map((step) => ({ amount: step.amount, status: "BEKLIYOR" })));

  let plan;
  try {
    plan = await (prisma as any).treatmentPlan.create({
      data: {
        patientId,
        doctorId,
        institutionId: user.institutionId,
        branchId: branch.branchId,
        requestKey,
        title: title.trim(),
        notes: typeof notes === "string" ? notes.trim() || null : null,
        totalCost,
        steps: {
          create: normalizedSteps.map((s, i) => ({
            order:         i + 1,
            treatmentName: s.treatmentName,
            toothNo:       s.toothNo,
            amount:        s.amount,
            note:          s.note,
          })),
        },
      },
      include: planInclude,
    });
  } catch (error) {
    if (requestKey && error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      const existingPlan = await (prisma as any).treatmentPlan.findFirst({
        where: { requestKey, institutionId: user.institutionId, branchId: branch.branchId },
        include: planInclude,
      });
      if (existingPlan) {
        const { requestKey: _existingKey, ...publicPlan } = existingPlan;
        return NextResponse.json({ ...withActiveTotal(publicPlan), duplicateRequest: true }, { status: 200 });
      }
    }
    throw error;
  }

  await writeAudit(auth.user.id, "TREATMENT_PLAN_CREATE", `"${title}" tedavi planı oluşturuldu`);
  const { requestKey: _createdKey, ...publicPlan } = plan;
  return NextResponse.json(publicPlan, { status: 201 });
}
