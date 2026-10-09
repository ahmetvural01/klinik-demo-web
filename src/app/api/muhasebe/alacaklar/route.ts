import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";
import { turkeyTodayStartUtc } from "@/lib/tz";

/**
 * GET /api/muhasebe/alacaklar
 * Her hasta için: tedavi toplamı (indirimli), ödenen, bakiye.
 *
 * Parametreler:
 * - (yok)            → yalnız borcu olan hastalar (bakiye > 0,5 TL), büyükten küçüğe.
 * - durum=avans      → fazla ödeme / ön ödeme yapmış hastalar (bakiye < −0,5 TL).
 * - patientId=…      → tek hasta (borcu olmasa da döner); tahsilat formunda güncel
 *                      borç, açık taksit ve önerilen hekim için kullanılır.
 *
 * Her satırda hekimler (kimlikleriyle), son tedaviyi yapan hekim ve açık taksit
 * planı özeti (kalan, sonraki vade, gecikmiş taksit sayısı, planın hekimi) döner.
 */
export const GET = withApiTiming("muhasebe-alacaklar", async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

    const institutionId = auth.user.institutionId;
    const hidePatientPhone = await shouldHidePatientPhoneForRole(auth.user.role);
    const params = request.nextUrl.searchParams;
    const singlePatientId = params.get("patientId")?.trim() || null;
    const creditMode = params.get("durum") === "avans";

    const treatmentOnlyWhere = {
      NOT: [
        { status: { contains: "diagnoz", mode: "insensitive" as const } },
        { status: { contains: "ön teşhis", mode: "insensitive" as const } },
        { status: { contains: "on teshis", mode: "insensitive" as const } },
      ],
    };

    const patientFilter = singlePatientId ? { patientId: singlePatientId } : {};
    const examinationWhere = {
      ...treatmentOnlyWhere,
      ...(institutionId ? { institutionId } : {}),
      branchId: branch.branchId,
      ...patientFilter,
    };
    const paymentWhere = {
      ...(institutionId ? { institutionId } : {}),
      branchId: branch.branchId,
      status: "ACTIVE" as const,
      patientId: singlePatientId ? singlePatientId : { not: null },
    };

    // Birbirinden bağımsız defter sorgularını ardışık bekletmek, hasta sayısı
    // arttıkça ekranın açılışını gereksiz yere uzatıyordu. Aynı tutarlı anlık
    // görünüm için paralel okuyup son aşamada hasta kartlarıyla birleştiriyoruz.
    const [
      examGroups,
      payGroups,
      examDoctorRows,
      latestTreatmentRows,
      latestPayments,
      openInstallments,
    ] = await Promise.all([
      prisma.examination.groupBy({
        by: ["patientId"],
        where: examinationWhere,
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["patientId"],
        _sum: { amount: true },
        where: paymentWhere,
      }),
      prisma.examination.findMany({
        where: examinationWhere,
        select: {
          patientId: true,
          doctorId: true,
          doctor: { select: { fullName: true } },
        },
        distinct: ["patientId", "doctorId"],
      }),
      prisma.examination.findMany({
        where: examinationWhere,
        select: {
          patientId: true,
          doctorId: true,
          diagnosedAt: true,
        },
        orderBy: { diagnosedAt: "desc" },
        distinct: ["patientId"],
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        select: { patientId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        distinct: ["patientId"],
      }),
      // Açık (iptal/tamamlanmamış) planların ödenmemiş taksitleri — satırdaki plan özeti için.
      prisma.taksit.findMany({
        where: {
          institutionId: institutionId || undefined,
          branchId: branch.branchId,
          status: { in: ["BEKLIYOR", "GECIKTI"] },
          kalan: { gt: 0 },
          plan: {
            status: { in: ["AKTIF", "DEVAM_EDIYOR"] },
            branchId: branch.branchId,
            ...(singlePatientId ? { patientId: singlePatientId } : {}),
          },
        },
        select: { kalan: true, vadeDate: true, status: true, plan: { select: { id: true, patientId: true, doctorId: true } } },
        orderBy: { vadeDate: "asc" },
      }),
    ]);

    const doctorMap = new Map<string, Map<string, string>>();
    examDoctorRows.forEach((exam) => {
      const doctors = doctorMap.get(exam.patientId) || new Map<string, string>();
      if (exam.doctorId && exam.doctor?.fullName) doctors.set(exam.doctorId, exam.doctor.fullName);
      doctorMap.set(exam.patientId, doctors);
    });

    const treatmentMap = new Map<string, { at: Date; doctorId: string | null }>();
    latestTreatmentRows.forEach((exam) => {
      const current = treatmentMap.get(exam.patientId);
      if (!current || exam.diagnosedAt > current.at) treatmentMap.set(exam.patientId, { at: exam.diagnosedAt, doctorId: exam.doctorId });
    });

    const paymentDateMap = new Map<string, Date>();
    latestPayments.forEach((payment) => {
      if (!payment.patientId) return;
      paymentDateMap.set(payment.patientId, payment.createdAt);
    });

    // Açık plan özeti: hastanın açık taksitlerinin toplam kalanı, en yakın vade ve gecikmiş taksit sayısı.
    const todayStart = turkeyTodayStartUtc();
    const planMap = new Map<string, { kalan: number; nextDueDate: string | null; nextDueAmount: number; overdueCount: number; doctorId: string | null; planIds: Set<string> }>();
    for (const item of openInstallments) {
      const patientId = item.plan.patientId;
      const summary = planMap.get(patientId) || { kalan: 0, nextDueDate: null, nextDueAmount: 0, overdueCount: 0, doctorId: item.plan.doctorId, planIds: new Set<string>() };
      summary.kalan += Number(item.kalan);
      summary.planIds.add(item.plan.id);
      if (!summary.nextDueDate) {
        summary.nextDueDate = item.vadeDate.toISOString();
        summary.nextDueAmount = Number(item.kalan);
        summary.doctorId = item.plan.doctorId;
      }
      if (item.status === "GECIKTI" || item.vadeDate < todayStart) summary.overdueCount += 1;
      planMap.set(patientId, summary);
    }

    // Hasta bilgileri — tedavisi ya da ödemesi olan herkes (yalnız ödemesi olan hasta ön ödeme yapmıştır).
    const patientIds = [...new Set([
      ...examGroups.map((e) => e.patientId),
      ...payGroups.map((p) => p.patientId).filter((id): id is string => Boolean(id)),
      ...(singlePatientId ? [singlePatientId] : []),
    ])];
    const patients = await prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        archivedAt: null,
        ...(institutionId ? { institutionId } : {}),
        homeBranchId: branch.branchId,
      },
      select: { id: true, fullName: true, phone: true, discountRate: true },
    });

    const examMap = new Map(examGroups.map((e) => [e.patientId, Number(e._sum.amount ?? 0)]));
    const payMap = new Map(
      payGroups.map((p) => [p.patientId as string, Number(p._sum.amount ?? 0)])
    );

    const allRows = patients.map((p) => {
      const brutTedavi = examMap.get(p.id) ?? 0;
      const indirim    = brutTedavi * (Number(p.discountRate || 0) / 100);
      const netTedavi  = brutTedavi - indirim;
      const odenen     = payMap.get(p.id) ?? 0;
      const bakiye     = Math.round((netTedavi - odenen) * 100) / 100;
      const doctors = Array.from(doctorMap.get(p.id)?.entries() || []).map(([id, fullName]) => ({ id, fullName }));
      const plan = planMap.get(p.id);
      const lastTreatment = treatmentMap.get(p.id);

      return {
        id: p.id,
        fullName: p.fullName,
        phone: hidePatientPhone ? "" : p.phone,
        brutTedavi,
        indirim,
        netTedavi,
        odenen,
        bakiye,
        discountRate: p.discountRate,
        doctors,
        doctorNames: doctors.map((doctor) => doctor.fullName),
        lastDoctorId: lastTreatment?.doctorId || null,
        lastPaymentAt: paymentDateMap.get(p.id)?.toISOString() || null,
        lastTreatmentAt: lastTreatment?.at.toISOString() || null,
        hasActiveTaksitPlan: Boolean(plan),
        plan: plan
          ? {
              kalan: Math.round(plan.kalan * 100) / 100,
              nextDueDate: plan.nextDueDate,
              nextDueAmount: Math.round(plan.nextDueAmount * 100) / 100,
              overdueCount: plan.overdueCount,
              doctorId: plan.doctorId,
              planCount: plan.planIds.size,
            }
          : null,
      };
    });

    const rows = singlePatientId
      ? allRows
      : allRows
          .filter((r) => (creditMode ? r.bakiye < -0.5 : r.bakiye > 0.5))
          .sort((a, b) => (creditMode ? a.bakiye - b.bakiye : b.bakiye - a.bakiye));

    const toplamAlacak = rows.reduce((s, r) => s + r.bakiye, 0);
    return NextResponse.json({ rows, toplamAlacak: Math.round(toplamAlacak * 100) / 100 });
  } catch (error) {
    console.error("[muhasebe alacaklar GET]", error);
    return NextResponse.json({ message: "Hasta alacakları hesaplanamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});
