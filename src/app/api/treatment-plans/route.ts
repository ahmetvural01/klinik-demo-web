import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";

const PLAN_STATUSES = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"] as const;

export const GET = withApiTiming("treatment-plans", async function GET(req: NextRequest) {
  const auth = await requireAuth("treatment:read");
  if (auth.error) return auth.error;
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
    ...(user.role !== "SUPERADMIN" ? { patient: { institutionId: user.institutionId } } : {}),
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

  const [total, plans, statusCountsRaw] = await Promise.all([
    (prisma as any).treatmentPlan.count({ where: listWhere }),
    (prisma as any).treatmentPlan.findMany({
      where: listWhere,
      include: {
        patient: { select: { id: true, fullName: true, tcNo: true, phone: true } },
        doctor:  { select: { id: true, fullName: true } },
        steps:   { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    (prisma as any).treatmentPlan.groupBy({
      by: ["status"],
      where: { ...(patientId ? { patientId } : {}), ...(user.role !== "SUPERADMIN" ? { patient: { institutionId: user.institutionId } } : {}) },
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = Object.fromEntries(PLAN_STATUSES.map((s) => [s, 0]));
  for (const row of statusCountsRaw) statusCounts[row.status] = row._count._all;
  const totalAll = Object.values(statusCounts).reduce((s, n) => s + n, 0);

  const hidePhone = await shouldHidePatientPhoneForRole(user.role);
  const items = hidePhone
    ? plans.map((p: any) => ({
        ...p,
        patient: p.patient ? { ...p.patient, phone: "***" } : p.patient,
      }))
    : plans;

  return NextResponse.json({
    items,
    total,
    page,
    pageCount: pageCount(total),
    stats: { total: totalAll, byStatus: statusCounts },
  });
});

export async function POST(req: NextRequest) {
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

  const { patientId, doctorId, title, notes, steps = [] } = body as {
    patientId?: unknown;
    doctorId?: unknown;
    title?: unknown;
    notes?: unknown;
    steps?: unknown;
  };

  if (typeof patientId !== "string" || !patientId.trim() || typeof doctorId !== "string" || !doctorId.trim() || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "patientId, doctorId ve title zorunlu" }, { status: 400 });
  }

  if (title.trim().length > 200 || (notes !== undefined && notes !== null && typeof notes !== "string")) {
    return NextResponse.json({ error: "Plan başlığı veya notu geçersiz" }, { status: 400 });
  }

  if (!Array.isArray(steps) || steps.length > 100) {
    return NextResponse.json({ error: "Tedavi adımları geçersiz veya çok fazla" }, { status: 400 });
  }

  const normalizedSteps: Array<{ treatmentName: string; toothNo?: string; amount: number; note?: string }> = [];
  for (const [index, rawStep] of steps.entries()) {
    if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımı geçersiz` }, { status: 400 });
    }
    const step = rawStep as { treatmentName?: unknown; toothNo?: unknown; amount?: unknown; note?: unknown };
    const treatmentName = typeof step.treatmentName === "string" ? step.treatmentName.trim() : "";
    const amount = Number(step.amount ?? 0);
    if (!treatmentName || treatmentName.length > 200) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının adı zorunludur` }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının tutarı geçersiz` }, { status: 400 });
    }
    if (step.toothNo !== undefined && step.toothNo !== null && typeof step.toothNo !== "string") {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının diş numarası geçersiz` }, { status: 400 });
    }
    if (step.note !== undefined && step.note !== null && typeof step.note !== "string") {
      return NextResponse.json({ error: `${index + 1}. tedavi adımının notu geçersiz` }, { status: 400 });
    }
    normalizedSteps.push({
      treatmentName,
      toothNo: typeof step.toothNo === "string" && step.toothNo.trim() ? step.toothNo.trim() : undefined,
      amount,
      note: typeof step.note === "string" ? step.note.trim() || undefined : undefined,
    });
  }

  const [patient, doctor] = await Promise.all([
    (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        ...(user.role !== "SUPERADMIN" ? { institutionId: user.institutionId } : {}),
      },
      select: { id: true },
    }),
    (prisma as any).user.findFirst({
      where: {
        id: doctorId,
        isActive: true,
        ...(user.role !== "SUPERADMIN" ? { institutionId: user.institutionId } : {}),
        OR: [
          { role: { in: ["DOKTOR", "ADMIN", "SUPERADMIN"] } },
          { role: "YONETICI", profile: { hideAsDoctor: false } },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
  if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });

  const totalCost = normalizedSteps.reduce((sum, step) => sum + step.amount, 0);

  const plan = await (prisma as any).treatmentPlan.create({
    data: {
      patientId,
      doctorId,
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
    include: {
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "TREATMENT_PLAN_CREATE", `"${title}" tedavi planı oluşturuldu`);
  return NextResponse.json(plan, { status: 201 });
}
