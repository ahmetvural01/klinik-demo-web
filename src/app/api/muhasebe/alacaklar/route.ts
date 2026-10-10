import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";
import {
  calculateBalance,
  computePatientBalances,
  isCreditBalance,
  isDebtorBalance,
  loadBalanceTotals,
  loadOpenInstallmentSummaries,
  loadTreatmentDoctors,
  moneyToNumber,
  type BalanceFigures,
} from "@/lib/patient-balance";

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
 *
 * Bakiye tek kaynaktan (src/lib/patient-balance.ts): hasta dosyası ve hasta
 * listesiyle aynı kural — iptal edilen ve planlanan tedaviler borç değildir.
 * Önceden bu uç onları borca sayıyordu. Hekim listesi ve son tedavi de aynı
 * kuralla: iptal edilmiş bir tedavinin hekimi tahsilata önerilmez.
 */
export const GET = withApiTiming("muhasebe-alacaklar", async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

    const institutionId = auth.user.institutionId;
    const params = request.nextUrl.searchParams;
    const singlePatientId = params.get("patientId")?.trim() || null;
    const creditMode = params.get("durum") === "avans";
    const scope = { institutionId, branchId: branch.branchId };

    // Satırın hasta kartı, hekimleri ve açık taksit özeti — yalnız listede
    // gösterilecek hastalar için (önceden şubedeki her hasta okunuyordu).
    const loadRowContext = (patientIds: string[]) => Promise.all([
      patientIds.length > 0
        ? prisma.patient.findMany({
            where: {
              id: { in: patientIds },
              archivedAt: null,
              ...(institutionId ? { institutionId } : {}),
              homeBranchId: branch.branchId,
            },
            select: { id: true, fullName: true, phone: true, discountRate: true },
          })
        : Promise.resolve([]),
      loadTreatmentDoctors({ ...scope, patientIds }),
      loadOpenInstallmentSummaries({ ...scope, patientIds }),
    ]);

    let balanceOf: (patient: { id: string; discountRate: number }) => BalanceFigures & { lastPaymentAt: Date | null };
    let context: Awaited<ReturnType<typeof loadRowContext>>;
    let hidePatientPhone: boolean;

    if (singlePatientId) {
      // Tek hasta (tahsilat / taksit planı formu): tek turda, hastanın kendi
      // indirim oranıyla.
      const [totals, rowContext, hidePhone] = await Promise.all([
        loadBalanceTotals({ ...scope, patientIds: [singlePatientId] }),
        loadRowContext([singlePatientId]),
        shouldHidePatientPhoneForUser(auth.user),
      ]);
      context = rowContext;
      hidePatientPhone = hidePhone;
      balanceOf = (patient) => {
        const total = totals.get(patient.id);
        return {
          lastPaymentAt: total?.lastPaymentAt ?? null,
          ...calculateBalance({ tedaviToplam: total?.tedaviToplam, indirimOrani: patient.discountRate, tahsilatToplam: total?.tahsilatToplam }),
        };
      };
    } else {
      // Liste: önce şubedeki bütün bakiyeler veritabanında gruplanır, eşiği
      // geçenler seçilir; ad/telefon/hekim/taksit yalnız onlar için okunur.
      const [balances, hidePhone] = await Promise.all([
        computePatientBalances(scope),
        shouldHidePatientPhoneForUser(auth.user),
      ]);
      hidePatientPhone = hidePhone;
      const listedIds = [...balances.values()]
        .filter((balance) => (creditMode ? isCreditBalance(balance.bakiye) : isDebtorBalance(balance.bakiye)))
        .map((balance) => balance.patientId);
      context = await loadRowContext(listedIds);
      balanceOf = (patient) => balances.get(patient.id) ?? { lastPaymentAt: null, ...calculateBalance({ tedaviToplam: 0, indirimOrani: patient.discountRate, tahsilatToplam: 0 }) };
    }

    const [patients, doctorMap, planMap] = context;
    const listed = patients.map((patient) => ({ patient, balance: balanceOf(patient) }));
    if (!singlePatientId) {
      listed.sort((a, b) => (creditMode ? a.balance.bakiye.comparedTo(b.balance.bakiye) : b.balance.bakiye.comparedTo(a.balance.bakiye)));
    }
    const toplamAlacak = listed.reduce((sum, item) => sum.plus(item.balance.bakiye), new Prisma.Decimal(0));

    const rows = listed.map(({ patient: p, balance }) => {
      const doctorInfo = doctorMap.get(p.id);
      const doctors = doctorInfo?.doctors ?? [];
      const plan = planMap.get(p.id) ?? null;

      return {
        id: p.id,
        fullName: p.fullName,
        phone: hidePatientPhone ? "" : p.phone,
        brutTedavi: moneyToNumber(balance.tedaviToplam),
        indirim: moneyToNumber(balance.indirim),
        netTedavi: moneyToNumber(balance.netTedavi),
        odenen: moneyToNumber(balance.tahsilatToplam),
        bakiye: moneyToNumber(balance.bakiye),
        discountRate: p.discountRate,
        doctors,
        doctorNames: doctors.map((doctor) => doctor.fullName),
        lastDoctorId: doctorInfo?.lastDoctorId ?? null,
        lastPaymentAt: balance.lastPaymentAt?.toISOString() ?? null,
        lastTreatmentAt: doctorInfo?.lastTreatmentAt?.toISOString() ?? null,
        hasActiveTaksitPlan: Boolean(plan),
        plan,
      };
    });

    return NextResponse.json({ rows, toplamAlacak: moneyToNumber(toplamAlacak) });
  } catch (error) {
    console.error("[muhasebe alacaklar GET]", error);
    return NextResponse.json({ message: "Hasta alacakları hesaplanamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});
