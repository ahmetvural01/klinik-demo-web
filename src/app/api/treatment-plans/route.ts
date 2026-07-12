import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

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
  const q         = (searchParams.get("q") || "").trim();
  const { page, take, skip, pageCount } = parsePagination(searchParams, { defaultTake: 30, maxTake: 100 });

  const baseWhere: Record<string, unknown> = {
    ...(patientId ? { patientId } : {}),
    ...(status    ? { status }    : {}),
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

  const hidePhone = shouldHidePatientPhone(user.role);
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

  const body = await req.json();
  const { patientId, doctorId, title, notes, steps = [] } = body;

  if (!patientId || !doctorId || !title) {
    return NextResponse.json({ error: "patientId, doctorId ve title zorunlu" }, { status: 400 });
  }

  if (user.role !== "SUPERADMIN") {
    const [patient, doctor] = await Promise.all([
      (prisma as any).patient.findFirst({
        where: { id: patientId, institutionId: user.institutionId },
        select: { id: true },
      }),
      (prisma as any).user.findFirst({
        where: { id: doctorId, institutionId: user.institutionId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
  }

  const totalCost = steps.reduce((sum: number, s: { amount?: number }) => sum + (Number(s.amount) || 0), 0);

  const plan = await (prisma as any).treatmentPlan.create({
    data: {
      patientId,
      doctorId,
      title,
      notes,
      totalCost,
      steps: {
        create: steps.map((s: { treatmentName: string; toothNo?: string; amount: number; note?: string }, i: number) => ({
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
