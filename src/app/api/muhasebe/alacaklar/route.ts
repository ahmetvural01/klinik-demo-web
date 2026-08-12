import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";

/**
 * GET /api/muhasebe/alacaklar
 * Her hasta için: tedavi toplam, ödenen, bakiye (alacak)
 * Sadece pozitif bakiyeli (borçlu) hastaları döner.
 */
export const GET = withApiTiming("muhasebe-alacaklar", async function GET() {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

    const institutionId = auth.user.institutionId;
    const hidePatientPhone = await shouldHidePatientPhoneForRole(auth.user.role);

    const treatmentOnlyWhere = {
      NOT: [
        { status: { contains: "diagnoz", mode: "insensitive" as const } },
        { status: { contains: "ön teşhis", mode: "insensitive" as const } },
        { status: { contains: "on teshis", mode: "insensitive" as const } },
      ],
    };

    const examinationWhere = {
      ...treatmentOnlyWhere,
      ...(institutionId ? { institutionId } : {}),
      branchId: branch.branchId,
    };
    const paymentWhere = {
      ...(institutionId ? { institutionId } : {}),
      branchId: branch.branchId,
      status: "ACTIVE",
      patientId: { not: null },
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
      activeTaksitPatientRows,
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
      prisma.taksitPlan.findMany({
        where: {
          status: { in: ["AKTIF", "DEVAM_EDIYOR"] },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        select: { patientId: true },
        distinct: ["patientId"],
      }),
    ]);

    const doctorMap = new Map<string, Set<string>>();
    const treatmentDateMap = new Map<string, Date>();
    examDoctorRows.forEach((exam) => {
      const doctors = doctorMap.get(exam.patientId) || new Set<string>();
      if (exam.doctor?.fullName) doctors.add(exam.doctor.fullName);
      doctorMap.set(exam.patientId, doctors);
    });

    latestTreatmentRows.forEach((exam) => {
      const current = treatmentDateMap.get(exam.patientId);
      if (!current || exam.diagnosedAt > current) treatmentDateMap.set(exam.patientId, exam.diagnosedAt);
    });

    const paymentDateMap = new Map<string, Date>();
    latestPayments.forEach((payment) => {
      if (!payment.patientId) return;
      paymentDateMap.set(payment.patientId, payment.createdAt);
    });

    // Aktif veya ödemesi başlamış taksit planı olan hastaları ayrıca işaretle.
    const activeTaksitPatientIds = new Set(activeTaksitPatientRows.map((r) => r.patientId));

    // Patient bilgileri
    const patientIds = [...new Set(examGroups.map((e) => e.patientId))];
    const patients = await prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        archivedAt: null,
        ...(institutionId ? { institutionId } : {}),
        homeBranchId: branch.branchId,
      },
      select: { id: true, fullName: true, phone: true, discountRate: true },
    });

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const payMap = new Map(
      payGroups.map((p) => [p.patientId as string, Number(p._sum.amount ?? 0)])
    );

    const rows = examGroups
      .map((e) => {
        const p = patientMap.get(e.patientId);
        if (!p) return null;

        const brutTedavi = Number(e._sum.amount ?? 0);
        const indirim    = brutTedavi * (Number(p.discountRate || 0) / 100);
        const netTedavi  = brutTedavi - indirim;
        const odenen     = payMap.get(e.patientId) ?? 0;
        const bakiye     = netTedavi - odenen;

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
          doctorNames: Array.from(doctorMap.get(e.patientId) || []),
          lastPaymentAt: paymentDateMap.get(e.patientId)?.toISOString() || null,
          lastTreatmentAt: treatmentDateMap.get(e.patientId)?.toISOString() || null,
          hasActiveTaksitPlan: activeTaksitPatientIds.has(e.patientId),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.bakiye > 0.5)
      .sort((a, b) => b.bakiye - a.bakiye);

    const toplamAlacak = rows.reduce((s, r) => s + r.bakiye, 0);
    return NextResponse.json({ rows, toplamAlacak });
  } catch (error) {
    console.error("[muhasebe alacaklar GET]", error);
    return NextResponse.json({ message: "Hasta alacakları hesaplanamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});
