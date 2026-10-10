import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, withApiTiming } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import {
  calculateBalance,
  loadBalanceTotals,
  loadOpenInstallmentSummaries,
  loadTreatmentDoctors,
  moneyToNumber,
} from "@/lib/patient-balance";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/patients/[id]/balance — hastanın güncel bakiyesi (tek kaynak,
 * src/lib/patient-balance.ts). Hasta dosyası, tahsilat ve taksit planı
 * formları için hafif uç: hasta kartını, tedavi kalemlerini ya da klinik
 * ayrıntıyı döndürmez; yalnız toplamlar.
 *
 * İzin: payments:read VEYA finance:read. Tedavi kalemlerini göremeyen ama
 * tahsilat alan rol (varsayılan BANKO) de hastanın doğru borcunu ve tahsilat
 * formunun hekim önerisini buradan alır — önceden hasta dosyası bu rolde
 * tedavi toplamını 0 sayıp tahsilatları "avans" gösteriyordu.
 *
 * Yanıt:
 *   { patientId, bakiye, tedaviToplam, indirimOrani, indirim, netTedavi,
 *     tahsilatToplam, doctors: [{ id, fullName }], lastDoctorId,
 *     plan?: { kalan, nextDueDate, nextDueAmount, overdueCount, doctorId, planCount } | null }
 * `plan` (açık taksit planı özeti) yalnız installments:read ya da finance:read
 * yetkisinde döner; plan kalanı bakiyenin parçasıdır, ayrıca borç değildir.
 */
export const GET = withApiTiming("patients-balance", async function GET(_request: NextRequest, props: Params) {
  try {
    const params = await props.params;
    // payments:read VEYA finance:read. Varsayılan rollerde finans görebilen
    // herkeste tahsilat okuma da var: önce o denenir (tek tur); yalnız tahsilat
    // yetkisi olmayan özel bir rol için finance:read ile ikinci deneme yapılır.
    let auth = await requireAuth("payments:read");
    if (auth.error?.status === 403) {
      const financeAuth = await requireAuth("finance:read");
      if (!financeAuth.error) auth = financeAuth;
    }
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

    const institutionId = auth.user.institutionId;
    const patientId = String(params.id || "").trim();
    if (!patientId) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    const scope = { institutionId, branchId: branch.branchId, patientIds: [patientId] };

    // Hepsi aynı turda: hasta (kurum + şube + arşiv kontrolü ve indirim oranı),
    // toplamlar, hekimler, açık taksit özeti ve taksit görme yetkisi.
    const [patient, totals, doctorInfo, plans, canReadInstallments, canReadFinance] = await Promise.all([
      prisma.patient.findFirst({
        where: {
          id: patientId,
          archivedAt: null,
          ...(institutionId ? { institutionId } : {}),
          homeBranchId: branch.branchId,
        },
        select: { id: true, discountRate: true },
      }),
      loadBalanceTotals(scope),
      loadTreatmentDoctors(scope),
      loadOpenInstallmentSummaries(scope),
      hasEffectivePermission(auth.user, "installments:read"),
      hasEffectivePermission(auth.user, "finance:read"),
    ]);
    if (!patient) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });

    const total = totals.get(patient.id);
    const balance = calculateBalance({
      tedaviToplam: total?.tedaviToplam,
      indirimOrani: patient.discountRate,
      tahsilatToplam: total?.tahsilatToplam,
    });
    const doctors = doctorInfo.get(patient.id);

    return NextResponse.json(
      {
        patientId: patient.id,
        bakiye: moneyToNumber(balance.bakiye),
        tedaviToplam: moneyToNumber(balance.tedaviToplam),
        indirimOrani: balance.indirimOrani,
        indirim: moneyToNumber(balance.indirim),
        netTedavi: moneyToNumber(balance.netTedavi),
        tahsilatToplam: moneyToNumber(balance.tahsilatToplam),
        doctors: doctors?.doctors ?? [],
        lastDoctorId: doctors?.lastDoctorId ?? null,
        ...(canReadInstallments || canReadFinance ? { plan: plans.get(patient.id) ?? null } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[patients balance GET]", error);
    return NextResponse.json({ message: "Hastanın bakiyesi hesaplanamadı. Lütfen biraz sonra yeniden deneyin." }, { status: 503 });
  }
});
