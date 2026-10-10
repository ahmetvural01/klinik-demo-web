import { parseReportDateInput } from "@/lib/report-date-range";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { turkeyDayRangeUtc, turkeyDateKey, turkeyTodayStartUtc } from "@/lib/tz";
import { requireActiveBranch } from "@/lib/branch-context";
import { CHARGEABLE_EXAMINATION_WHERE } from "@/lib/examination-status";
import { computePatientBalances, isDebtorBalance, moneyToNumber } from "@/lib/patient-balance";
import { routes } from "@/lib/routes";
import { calculateIncomeTax, INCOME_TAX_TARIFF_YEAR } from "@/lib/tax-brackets";

// Rapor ekranındaki <input type="datetime-local"> zaman dilimi belirtmeden
// ("2026-07-15T09:30") gönderir — bu, kullanıcının Türkiye yerel saatidir.
// Ham `new Date(str)` tarih-saatli dizgelerde bunu SUNUCUNUN yerel saat
// dilimiyle (üretimde genelde UTC) yorumlar, bu da 3 saatlik bir kaymaya
// ve yıl/gün sınırlarında hatalı dahil/hariç tutmaya yol açıyordu (bkz.
// denetim raporu). Ayrıştırma src/lib/report-date-range.ts'tedir.
// Gelir vergisi tarifesi tek kaynaktan (src/lib/tax-brackets.ts; ekrandaki
// dilim listesi de oradan okunur).

const ZERO = new Prisma.Decimal(0);
const dec = (value: Prisma.Decimal | number | null | undefined) => new Prisma.Decimal(value ?? 0);
/** KDV dahil tutarın KDV'siz kısmı (oran yüzde olarak). */
const withoutVat = (amount: Prisma.Decimal, ratePercent: number) =>
  ratePercent > 0 ? amount.div(new Prisma.Decimal(ratePercent).div(100).plus(1)) : amount;
const round2 = (value: Prisma.Decimal) => moneyToNumber(value);

export const GET = withApiTiming("reports", async function GET(request: NextRequest) {
  const auth = await requireAuth("reports:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const institutionId = auth.user.institutionId;

  const from = request.nextUrl.searchParams.get("from") || request.nextUrl.searchParams.get("start");
  const to   = request.nextUrl.searchParams.get("to")   || request.nextUrl.searchParams.get("end");

  // Yıl bazlı vergi hesabı için yıl başı/sonu
  const pivotYear = from ? Number(from.slice(0, 4)) : Number(turkeyDateKey().slice(0, 4));
  const yearStart = turkeyDayRangeUtc(`${pivotYear}-01-01`).start;
  const yearEnd   = turkeyDayRangeUtc(`${pivotYear}-12-31`).end;

  // from/to hiç verilmezse tüm geçmiş taranmasın diye içinde bulunulan yıl varsayılır.
  let dateFilter: { gte?: Date; lte?: Date };
  try {
    dateFilter = (from || to) ? { gte: parseReportDateInput(from), lte: parseReportDateInput(to, true) } : { gte: yearStart, lte: yearEnd };
    if (dateFilter.gte && dateFilter.lte && dateFilter.gte > dateFilter.lte) throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Rapor tarihleri geçersiz." }, { status: 400 });
  }

  try {
    // Tedavi kalemleri hasta dosyası ve bakiyeyle aynı kuralla sayılır: yalnız
    // yapılan / devam eden tedaviler. Ön teşhis, planlanan ve iptal edilen
    // (silinen) kayıtlar "işlenen tedavi" değildir (bkz. src/lib/examination-status.ts).
    const examWhereFor = (doctorIds: string[]): Prisma.ExaminationWhereInput => (institutionId
      ? { institutionId, branchId: branch.branchId, diagnosedAt: dateFilter, ...CHARGEABLE_EXAMINATION_WHERE, doctorId: { in: doctorIds } }
      : { diagnosedAt: dateFilter, ...CHARGEABLE_EXAMINATION_WHERE });

    const doctorIdsPromise: Promise<string[]> = institutionId
      ? prisma.user.findMany({ where: effectiveDoctorWhere(institutionId, branch.branchId), select: { id: true } })
          .then((rows) => rows.map((row) => row.id))
      : Promise.resolve([]);

    // Tedaviye bağlı sorgular hekim listesini bekler; diğer bütün sorgular aynı
    // anda başlar (önceden üç ayrı tur vardı). Satırlar belleğe çekilmez, veritabanı
    // toplar/gruplar.
    const treatmentStatsPromise = doctorIdsPromise.then(async (doctorIds) => {
      const examWhere = examWhereFor(doctorIds);
      const [byTreatment, byTooth, treatedPatients] = await Promise.all([
        prisma.examination.groupBy({ by: ["treatmentName"], where: examWhere, _count: { _all: true } }),
        prisma.examination.groupBy({ by: ["toothNo"], where: examWhere, _count: { _all: true } }),
        // "Tahsil edilmemiş tedaviler": dönemde tedavi gören (arşivlenmemiş) hastalar.
        prisma.examination.groupBy({ by: ["patientId"], where: { ...examWhere, patient: { archivedAt: null } }, _count: { _all: true } }),
      ]);
      // Bu hastaların GÜNCEL bakiyesi tek kaynaktan: dönem öncesi borç ve
      // ödemeler, indirim ve iptal/planlanan tedavi kuralı dahil. Önceden yalnız
      // dönem içi tedavi − dönem içi tahsilat farkına bakılıyordu.
      const balances = await computePatientBalances({
        institutionId,
        branchId: branch.branchId,
        patientIds: treatedPatients.map((row) => row.patientId),
      });
      let unpaidTreatmentPatientCount = 0;
      for (const balance of balances.values()) {
        if (isDebtorBalance(balance.bakiye)) unpaidTreatmentPatientCount += 1;
      }
      return { byTreatment, byTooth, unpaidTreatmentPatientCount };
    });

    const paymentWhere: Prisma.PaymentWhereInput = institutionId
      ? { institutionId, branchId: branch.branchId, status: "ACTIVE", createdAt: dateFilter, patientId: { not: null } }
      : { status: "ACTIVE", createdAt: dateFilter };
    const overdueTodayStart = turkeyTodayStartUtc();

    const [
      paymentsByMethod,
      labOrdersByStatus,
      labInvoiceSum,
      expenses,
      firmaIslemler,
      newPatients,
      overdueInstallments,
      annualPayments,
      annualExpensesByVat,
      openLabCount,
      openFollowUpCount,
      treatmentStats,
    ] = await Promise.all([
      prisma.payment.groupBy({ by: ["method"], where: paymentWhere, _sum: { amount: true } }),
      prisma.labOrder.groupBy({
        by: ["status"],
        where: institutionId
          ? { institutionId, branchId: branch.branchId, createdAt: dateFilter, status: { not: "IPTAL" } }
          : { createdAt: dateFilter, status: { not: "IPTAL" } },
        _count: { _all: true },
      }),
      // Lab maliyeti, sipariş açılış tarihine (LabOrder.createdAt) göre değil
      // fatura kesim tarihine (LabOrderInvoice.issuedAt) göre hesaplanır —
      // hakedis.ts'teki computeDoctorMonthlyHakedis ile aynı kaynak/tarih
      // kullanılmazsa Rapor ve Hakediş ekranları aynı ay için farklı lab
      // maliyeti/brüt kâr gösterir (bkz. denetim raporu).
      prisma.labOrderInvoice.aggregate({
        where: {
          status: "ACTIVE",
          labOrder: institutionId ? { institutionId, branchId: branch.branchId } : { branchId: branch.branchId },
          issuedAt: dateFilter,
        },
        _sum: { amount: true },
      }),
      prisma.expense.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        select: { tutar: true, kdvOrani: true, yontem: true, sourceType: true, category: true, expenseCategory: { select: { name: true } } },
      }),
      prisma.firmaIslem.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          islemTipi: { in: ["ALIM", "HIZMET"] },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        select: { tutar: true, kdvOrani: true, firma: { select: { name: true } } },
      }),
      prisma.patient.count({
        where: institutionId
          ? { createdAt: dateFilter, institutionId, homeBranchId: branch.branchId }
          : { createdAt: dateFilter },
      }),
      // Vadesi geçmiş BEKLIYOR taksitler yalnızca mark-gecikti sweep'i
      // çalıştıktan sonra DB'de GECIKTI olur — burada da diğer uçlarla (bkz.
      // /api/taksit-plani, /api/taksit-plani/[id], /api/patients/[id]) aynı
      // desende canlı türetilmiş durum sorgulanır (bkz. denetim raporu).
      // Ekranda yalnız sayısı gösterildiği için satırlar değil sayı okunur.
      prisma.taksit.count({
        where: {
          OR: [
            { status: "GECIKTI" },
            { status: "BEKLIYOR", vadeDate: { lt: overdueTodayStart } },
          ],
          ...(institutionId ? { plan: { institutionId, branchId: branch.branchId } } : {}),
        },
      }),
      // Yıllık vergi tahmini (aynı yıl verisi üzerinden)
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "ACTIVE",
          // Dönem tahsilatıyla aynı kapsam: hastasız eski hakediş ödemeleri gelir değildir.
          patientId: { not: null },
          createdAt: { gte: yearStart, lte: yearEnd },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
      }),
      prisma.expense.groupBy({
        by: ["kdvOrani"],
        where: {
          tarih: { gte: yearStart, lte: yearEnd },
          status: { not: "IPTAL" },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        _sum: { tutar: true },
      }),
      // Veri tutarlılığı denetimi (stok, lab bağlantıları vb.) Sistem Durumu ekranının işidir;
      // rapor her açıldığında yeniden hesaplanıp rapor sekmesine uyarı rozeti eklemesin.
      prisma.labOrder.count({
        where: {
          status: "DEVAM_EDIYOR",
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
      }),
      prisma.patientFollowUp.count({
        where: {
          status: "ACIK",
          ...(institutionId ? { patient: { institutionId, homeBranchId: branch.branchId } } : {}),
        },
      }),
      treatmentStatsPromise,
    ]);

    // ── Ödeme yöntemi toplamları ──────────────────────────────────────────────
    let totalRevenue = ZERO, cashTotal = ZERO, cardTotal = ZERO, transferTotal = ZERO, mailOrderTotal = ZERO, otherTotal = ZERO;
    for (const row of paymentsByMethod) {
      const amt = dec(row._sum.amount);
      totalRevenue = totalRevenue.plus(amt);
      if (row.method === "NAKIT")            cashTotal = cashTotal.plus(amt);
      else if (row.method === "KREDI_KARTI") cardTotal = cardTotal.plus(amt);
      else if (row.method === "HAVALE_EFT")  transferTotal = transferTotal.plus(amt);
      else if (row.method === "MAIL_ORDER")  mailOrderTotal = mailOrderTotal.plus(amt);
      else                                   otherTotal = otherTotal.plus(amt);
    }

    // ── Gider özeti ────────────────────────────────────────────────────────────
    let totalExpenses = ZERO;
    const expenseByCategory = new Map<string, Prisma.Decimal>();
    for (const e of expenses) {
      const amount = dec(e.tutar);
      totalExpenses = totalExpenses.plus(amount);
      const cat = e.expenseCategory?.name || e.category || "Diğer";
      expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? ZERO).plus(amount));
    }

    // ── Lab maliyeti özeti ─────────────────────────────────────────────────────
    const totalLabCost = dec(labInvoiceSum._sum.amount);

    // ── Firma alımları (tedarikçi) ─────────────────────────────────────────────
    let totalFirmaAlim = ZERO;
    const firmaByName = new Map<string, Prisma.Decimal>();
    for (const f of firmaIslemler) {
      const amount = dec(f.tutar);
      totalFirmaAlim = totalFirmaAlim.plus(amount);
      const n = f.firma?.name || "Bilinmiyor";
      firmaByName.set(n, (firmaByName.get(n) ?? ZERO).plus(amount));
    }

    // ── Net nakit akışı: tahsilat − fiilen ödenen giderler ────────────────────
    // Önceden "Net Kasa" = gelir − gider − firma ALIMI idi: firmaya yapılan ödeme
    // zaten "Firma Ödemesi" gideri olarak giderlerde olduğu için aynı tedarikçi
    // maliyeti iki kez düşülüyor, ödenmemiş alım faturası da kasadan çıkmış
    // sayılıyordu. Firma alımları (fatura) artık ayrı bilgi satırıdır.
    const netCash = totalRevenue.minus(totalExpenses);
    // Çekmecedeki nakit değişimi: nakit tahsilat − nakit ödenen giderler.
    const cashExpenses = expenses.reduce((s, e) => ((e.yontem || "NAKIT") === "NAKIT" ? s.plus(dec(e.tutar)) : s), ZERO);

    // ── KDV Özeti ────────────────────────────────────────────────────────────
    // Çıkan KDV (tahsil edilen): gelirden %10 KDV hesapla
    const REVENUE_VAT_RATE = 10;
    const outputVAT = totalRevenue.minus(withoutVat(totalRevenue, REVENUE_VAT_RATE));
    // Girdi KDV (ödenen): giderlerin kdvOrani alanından
    let inputVAT = ZERO;
    for (const e of expenses) {
      // Firma ödemesinden oluşan giderin KDV'si alım faturasında (firma işlemi) zaten
      // sayılır; ödeme satırındaki KDV ikinci kez eklenmez.
      if (e.sourceType === "FIRMA_ISLEM") continue;
      const rate = Number(e.kdvOrani || 0);
      if (rate > 0) inputVAT = inputVAT.plus(dec(e.tutar).minus(withoutVat(dec(e.tutar), rate)));
    }
    for (const f of firmaIslemler) {
      const rate = Number(f.kdvOrani || 0);
      if (rate > 0) inputVAT = inputVAT.plus(dec(f.tutar).minus(withoutVat(dec(f.tutar), rate)));
    }
    // Pozitif = ödenecek, negatif = devreden. Ekrandaki iki sayının (kuruşa
    // yuvarlanmış) farkı alınır: yuvarlanmamış değerlerin farkı ekranla 1 kuruş
    // tutmuyordu (686,36 − 1.141,67 = −455,31 iken −455,30 dönüyordu).
    const netVAT = outputVAT.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .minus(inputVAT.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));

    // ── Yıllık vergi matrahı (dönem net kâr üzerinden) ────────────────────────
    const netRevenuePeriod = withoutVat(totalRevenue, REVENUE_VAT_RATE);
    const netExpensePeriod = expenses.reduce((s, e) => s.plus(withoutVat(dec(e.tutar), Number(e.kdvOrani || 0))), ZERO);
    const periodNetProfit = netRevenuePeriod.minus(netExpensePeriod);

    const annualRevenue = withoutVat(dec(annualPayments._sum.amount), REVENUE_VAT_RATE);
    const annualExpense = annualExpensesByVat.reduce((s, row) => s.plus(withoutVat(dec(row._sum.tutar), Number(row.kdvOrani || 0))), ZERO);
    const annualNetProfit = annualRevenue.minus(annualExpense);
    const gelirVergisi = calculateIncomeTax(annualNetProfit.toNumber());

    // Not: önceden burada her zaman "Tamam" dönen bir "Kasa ve tahsilat defteri"
    // kontrolü vardı (koşul totalRevenue >= 0); hiç tahsilat yokken bile "Tamam"
    // dediği için kaldırıldı. Kasa özeti dayClose.cash* alanlarında.
    // Bağlantılar ortak adres kaynağından (src/lib/routes.ts); eski adresler
    // yönlendirmeyle çalışmaya devam ettiği için yönlendirme adımı eklenmesin.
    const dayCloseChecks = [
      {
        key: "open-lab",
        label: "Açık laboratuvar işleri",
        status: openLabCount === 0 ? "ok" : openLabCount > 10 ? "critical" : "warning",
        detail: openLabCount === 0 ? "Açık laboratuvar işi yok." : `${openLabCount} açık laboratuvar işi takip bekliyor.`,
        href: "/lab",
      },
      {
        key: "open-follow-up",
        label: "Hasta aramaları",
        status: openFollowUpCount === 0 ? "ok" : openFollowUpCount > 20 ? "critical" : "warning",
        detail: openFollowUpCount === 0 ? "Açık hasta araması yok." : `${openFollowUpCount} açık hasta araması var.`,
        href: routes.todos("arama"),
      },
      {
        key: "installments",
        label: "Gecikmiş taksit",
        status: overdueInstallments === 0 ? "ok" : "warning",
        detail: overdueInstallments === 0 ? "Gecikmiş taksit yok." : `${overdueInstallments} gecikmiş taksit var.`,
        href: routes.overdueInstallments(),
      },
    ];

    // ── İşlem analizi ─────────────────────────────────────────────────────────
    const treatmentCounts = new Map<string, number>();
    let totalExaminations = 0;
    for (const row of treatmentStats.byTreatment) {
      const t = row.treatmentName || "Bilinmiyor";
      treatmentCounts.set(t, (treatmentCounts.get(t) ?? 0) + row._count._all);
      totalExaminations += row._count._all;
    }
    const toothCounts = new Map<string, number>();
    for (const row of treatmentStats.byTooth) {
      // "11, 12," gibi kayıtlarda boş parça "Diş " satırı üretmesin diye kırpılıp süzülür.
      for (const tooth of (row.toothNo || "").split(",").map((part) => part.trim()).filter(Boolean)) {
        toothCounts.set(tooth, (toothCounts.get(tooth) ?? 0) + row._count._all);
      }
    }
    const topExaminations = [...treatmentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([treatmentName, count]) => ({ treatmentName, count }));
    const topTeeth = [...toothCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tooth, count]) => ({ tooth, count }));
    const labStatusMap: Record<string, number> = {};
    let totalLabOrders = 0;
    for (const row of labOrdersByStatus) {
      labStatusMap[row.status] = (labStatusMap[row.status] || 0) + row._count._all;
      totalLabOrders += row._count._all;
    }

    const revenue = round2(totalRevenue);
    const cash = round2(cashTotal);
    const card = round2(cardTotal);
    const transfer = round2(transferTotal);
    const mailOrder = round2(mailOrderTotal);
    const other = round2(otherTotal);
    const expenseTotal = round2(totalExpenses);
    const net = round2(netCash);

    return NextResponse.json({
      // Genel
      total: revenue,
      totalRevenue: revenue,
      totalExpenses: expenseTotal,
      totalLabCost: round2(totalLabCost),
      totalFirmaAlim: round2(totalFirmaAlim),
      netCash: net,
      newPatients,
      totalExaminations,
      // Ödeme yöntemleri
      cash,
      card,
      transfer,
      mailOrder,
      other,
      // Gider
      expenseByCategory: [...expenseByCategory.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([category, amount]) => ({ category, amount: round2(amount) })),
      // Tedarikçi
      firmaByName: [...firmaByName.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([name, amount]) => ({ name, amount: round2(amount) })),
      // KDV
      outputVAT: round2(outputVAT),
      inputVAT:  round2(inputVAT),
      netVAT:    round2(netVAT),
      // Vergi
      periodNetProfit: round2(periodNetProfit),
      annualNetProfit: round2(annualNetProfit),
      gelirVergisi:    Math.round(gelirVergisi * 100) / 100,
      // Yıllık kârın ve gelir vergisinin hesaplandığı yıl (başlangıç tarihinin
      // yılı) ve uygulanan tarifenin yılı.
      taxYear: pivotYear,
      taxTariffYear: INCOME_TAX_TARIFF_YEAR,
      // İşlemler
      topExaminations,
      topTeeth,
      labStatusSummary: labStatusMap,
      totalLabOrders,
      overdueInstallments,
      dayClose: {
        income: revenue,
        expense: expenseTotal,
        net,
        cashIn: cash,
        cashOut: round2(cashExpenses),
        cashNet: round2(cashTotal.minus(cashExpenses)),
        cash,
        card,
        transfer,
        mailOrder,
        other,
        openLabCount,
        openFollowUpCount,
        overdueInstallments,
        unpaidTreatmentPatientCount: treatmentStats.unpaidTreatmentPatientCount,
        checks: dayCloseChecks,
      },
    });
  } catch (error) {
    console.error("[reports GET]", error);
    return NextResponse.json({ message: "Rapor hesaplanamadı. Lütfen biraz sonra yeniden deneyin." }, { status: 503 });
  }
});
