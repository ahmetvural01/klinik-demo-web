import { parseReportDateInput } from "@/lib/report-date-range";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { turkeyDayRangeUtc, turkeyDateKey, turkeyTodayStartUtc } from "@/lib/tz";
import { requireActiveBranch } from "@/lib/branch-context";

// Rapor ekranındaki <input type="datetime-local"> zaman dilimi belirtmeden
// ("2026-07-15T09:30") gönderir — bu, kullanıcının Türkiye yerel saatidir.
// Ham `new Date(str)` tarih-saatli dizgelerde bunu SUNUCUNUN yerel saat
// dilimiyle (üretimde genelde UTC) yorumlar, bu da 3 saatlik bir kaymaya
// ve yıl/gün sınırlarında hatalı dahil/hariç tutmaya yol açıyordu (bkz.
// denetim raporu).
// 2026 gelir vergisi dilimleri
function gelirVergisiHesapla(matrah: number): number {
  if (matrah <= 0) return 0;
  let v = 0;
  const d = [
    [190000, 0.15], [400000, 0.20], [1500000, 0.27], [5300000, 0.35], [Infinity, 0.40],
  ] as [number, number][];
  let prev = 0;
  for (const [ust, oran] of d) {
    if (matrah <= ust) { v += (matrah - prev) * oran; break; }
    v += (ust - prev) * oran; prev = ust;
  }
  return v;
}

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

  const treatmentOnlyWhere = {
    NOT: [
      { status: { contains: "diagnoz", mode: "insensitive" as const } },
      { status: { contains: "ön teşhis", mode: "insensitive" as const } },
      { status: { contains: "on teshis", mode: "insensitive" as const } },
    ],
  };

  const institutionDoctors = institutionId
    ? await prisma.user.findMany({
        where: effectiveDoctorWhere(institutionId, branch.branchId),
        select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);
  const institutionPatientScope = doctorIds.length > 0
    ? {
        OR: [
          { institutionId: institutionId as string },
          { examinations: { some: { doctorId: { in: doctorIds } } } },
          { appointments: { some: { doctorId: { in: doctorIds } } } },
        ],
      }
    : undefined;

  // ── Paralel sorgular ──────────────────────────────────────────────────────
  const overdueTodayStart = turkeyTodayStartUtc();
  const [payments, examinations, labOrders, labInvoices, expenses, firmaIslemler, newPatients, taksitler] =
    await Promise.all([
      prisma.payment.findMany({
        where: institutionId
          ? {
              institutionId,
              branchId: branch.branchId,
              status: "ACTIVE",
              createdAt: dateFilter,
              patientId: { not: null },
            }
          : { status: "ACTIVE", createdAt: dateFilter },
      }),
      prisma.examination.findMany({
        where: institutionId
          ? { institutionId, branchId: branch.branchId, diagnosedAt: dateFilter, ...treatmentOnlyWhere, doctorId: { in: doctorIds } }
          : { diagnosedAt: dateFilter, ...treatmentOnlyWhere },
        include: {
          doctor: { select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true } },
        },
      }),
      (prisma as any).labOrder.findMany({
        where: institutionId
          ? { institutionId, branchId: branch.branchId, createdAt: dateFilter, status: { not: "IPTAL" } }
          : { createdAt: dateFilter, status: { not: "IPTAL" } },
        include: { doctor: { select: { id: true, fullName: true } } },
      }),
      // Lab maliyeti, sipariş açılış tarihine (LabOrder.createdAt) göre değil
      // fatura kesim tarihine (LabOrderInvoice.issuedAt) göre hesaplanır —
      // hakedis.ts'teki computeDoctorMonthlyHakedis ile aynı kaynak/tarih
      // kullanılmazsa Rapor ve Hakediş ekranları aynı ay için farklı lab
      // maliyeti/brüt kâr gösterir (bkz. denetim raporu).
      (prisma as any).labOrderInvoice.findMany({
        where: {
          status: "ACTIVE",
          labOrder: institutionId ? { institutionId, branchId: branch.branchId } : { branchId: branch.branchId },
          issuedAt: dateFilter,
        },
        select: { amount: true },
      }),
      (prisma as any).expense.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        include: { expenseCategory: { select: { name: true } } },
      }),
      (prisma as any).firmaIslem.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          islemTipi: { in: ["ALIM", "HIZMET"] },
          ...(institutionId ? { institutionId } : {}),
          branchId: branch.branchId,
        },
        include: { firma: { select: { name: true } } },
      }),
      prisma.patient.count({
        where: institutionId
          ? { createdAt: dateFilter, institutionId, homeBranchId: branch.branchId }
          : doctorIds.length > 0
          ? { createdAt: dateFilter, ...institutionPatientScope }
          : { createdAt: dateFilter },
      }),
      // Vadesi geçmiş BEKLIYOR taksitler yalnızca mark-gecikti sweep'i
      // çalıştıktan sonra DB'de GECIKTI olur — burada da diğer uçlarla (bkz.
      // /api/taksit-plani, /api/taksit-plani/[id], /api/patients/[id]) aynı
      // desende canlı türetilmiş durum sorgulanır (bkz. denetim raporu).
      (prisma as any).taksit.findMany({
        where: {
          OR: [
            { status: "GECIKTI" },
            { status: "BEKLIYOR", vadeDate: { lt: overdueTodayStart } },
          ],
          ...(institutionId ? { plan: { institutionId, branchId: branch.branchId } } : {}),
        },
      }),
    ]);

  // ── Ödeme yöntemi toplamları ──────────────────────────────────────────────
  let totalRevenue = 0, cashTotal = 0, cardTotal = 0, transferTotal = 0, mailOrderTotal = 0, otherTotal = 0;
  for (const p of payments) {
    const amt = Number(p.amount);
    totalRevenue += amt;
    if (p.method === "NAKIT")       cashTotal      += amt;
    else if (p.method === "KREDI_KARTI") cardTotal  += amt;
    else if (p.method === "HAVALE_EFT")  transferTotal += amt;
    else if (p.method === "MAIL_ORDER")  mailOrderTotal += amt;
    else                                 otherTotal += amt;
  }

  // ── Gider özeti ────────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.tutar), 0);
  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.expenseCategory?.name || e.category || "Diğer";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.tutar);
  }

  // ── Lab maliyeti özeti ─────────────────────────────────────────────────────
  const totalLabCost = labInvoices.reduce((s: number, inv: any) => s + Number(inv.amount || 0), 0);

  // ── Firma alımları (tedarikçi) ─────────────────────────────────────────────
  const totalFirmaAlim = firmaIslemler.reduce((s: number, f: any) => s + Number(f.tutar), 0);
  const firmaByName: Record<string, number> = {};
  for (const f of firmaIslemler) {
    const n = f.firma?.name || "Bilinmiyor";
    firmaByName[n] = (firmaByName[n] || 0) + Number(f.tutar);
  }

  // ── Net nakit akışı: tahsilat − fiilen ödenen giderler ────────────────────
  // Önceden "Net Kasa" = gelir − gider − firma ALIMI idi: firmaya yapılan ödeme
  // zaten "Firma Ödemesi" gideri olarak giderlerde olduğu için aynı tedarikçi
  // maliyeti iki kez düşülüyor, ödenmemiş alım faturası da kasadan çıkmış
  // sayılıyordu. Firma alımları (fatura) artık ayrı bilgi satırıdır.
  const netCash = totalRevenue - totalExpenses;
  // Çekmecedeki nakit değişimi: nakit tahsilat − nakit ödenen giderler.
  const cashExpenses = expenses.reduce((s: number, e: any) => s + ((e.yontem || "NAKIT") === "NAKIT" ? Number(e.tutar) : 0), 0);

  // ── KDV Özeti ────────────────────────────────────────────────────────────
  // Çıkan KDV (tahsil edilen): gelirden %10 KDV hesapla
  const REVENUE_VAT_RATE = 0.10;
  const outputVAT = totalRevenue - (totalRevenue / (1 + REVENUE_VAT_RATE));
  // Girdi KDV (ödenen): giderlerin kdvOrani alanından
  let inputVAT = 0;
  for (const e of expenses) {
    // Firma ödemesinden oluşan giderin KDV'si alım faturasında (firma işlemi) zaten
    // sayılır; ödeme satırındaki KDV ikinci kez eklenmez.
    if (e.sourceType === "FIRMA_ISLEM") continue;
    const rate = Number(e.kdvOrani || 0) / 100;
    if (rate > 0) inputVAT += Number(e.tutar) - Number(e.tutar) / (1 + rate);
  }
  for (const f of firmaIslemler) {
    const rate = Number(f.kdvOrani || 0) / 100;
    if (rate > 0) inputVAT += Number(f.tutar) - Number(f.tutar) / (1 + rate);
  }
  const netVAT = outputVAT - inputVAT; // pozitif = ödenecek, negatif = devreden

  // ── Yıllık vergi matrahı (dönem net kâr üzerinden) ────────────────────────
  const netRevenuePeriod  = totalRevenue / (1 + REVENUE_VAT_RATE);
  const netExpensePeriod  = expenses.reduce((s: number, e: any) => {
    const r = Number(e.kdvOrani || 0) / 100;
    return s + (r > 0 ? Number(e.tutar) / (1 + r) : Number(e.tutar));
  }, 0);
  const periodNetProfit = netRevenuePeriod - netExpensePeriod;

  // Yıllık vergi tahmini (aynı yıl verisi üzerinden)
  const [annualPayments, annualExpenses] = await Promise.all([
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
    (prisma as any).expense.findMany({
      where: {
        tarih: { gte: yearStart, lte: yearEnd },
        status: { not: "IPTAL" },
        ...(institutionId ? { institutionId } : {}),
        branchId: branch.branchId,
      },
      select: { tutar: true, kdvOrani: true },
    }),
  ]);
  const annualRevenue = Number(annualPayments._sum.amount || 0) / (1 + REVENUE_VAT_RATE);
  const annualExpense = annualExpenses.reduce((s: number, e: any) => {
    const r = Number(e.kdvOrani || 0) / 100;
    return s + (r > 0 ? Number(e.tutar) / (1 + r) : Number(e.tutar));
  }, 0);
  const annualNetProfit = annualRevenue - annualExpense;
  const gelirVergisi = gelirVergisiHesapla(annualNetProfit);

  const patientTreatmentTotal: Record<string, number> = {};
  const patientPaymentTotal: Record<string, number> = {};
  for (const exam of examinations) {
    if (!exam.patientId) continue;
    patientTreatmentTotal[exam.patientId] = (patientTreatmentTotal[exam.patientId] || 0) + Number(exam.amount || 0);
  }
  for (const payment of payments) {
    if (!payment.patientId) continue;
    patientPaymentTotal[payment.patientId] = (patientPaymentTotal[payment.patientId] || 0) + Number(payment.amount || 0);
  }
  const unpaidTreatmentPatientCount = Object.entries(patientTreatmentTotal)
    .filter(([patientId, total]) => total - (patientPaymentTotal[patientId] || 0) > 0.01)
    .length;

  // Veri tutarlılığı denetimi (stok, lab bağlantıları vb.) Sistem Durumu ekranının işidir;
  // rapor her açıldığında yeniden hesaplanıp rapor sekmesine uyarı rozeti eklemesin.
  const [openLabCount, openFollowUpCount] = await Promise.all([
    (prisma as any).labOrder.count({
      where: {
        status: "DEVAM_EDIYOR",
        ...(institutionId ? { institutionId } : {}),
        branchId: branch.branchId,
      },
    }),
    (prisma as any).patientFollowUp.count({
      where: {
        status: "ACIK",
        ...(institutionId ? { patient: { institutionId, homeBranchId: branch.branchId } } : {}),
      },
    }),
  ]);

  // Not: önceden burada her zaman "Tamam" dönen bir "Kasa ve tahsilat defteri"
  // kontrolü vardı (koşul totalRevenue >= 0); hiç tahsilat yokken bile "Tamam"
  // dediği için kaldırıldı. Kasa özeti dayClose.cash* alanlarında.
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
      label: "Hasta takip aksiyonları",
      status: openFollowUpCount === 0 ? "ok" : openFollowUpCount > 20 ? "critical" : "warning",
      detail: openFollowUpCount === 0 ? "Açık hasta takip aksiyonu yok." : `${openFollowUpCount} açık hasta takip aksiyonu var.`,
      href: "/hasta-takip",
    },
    {
      key: "installments",
      label: "Gecikmiş taksit",
      status: taksitler.length === 0 ? "ok" : "warning",
      detail: taksitler.length === 0 ? "Gecikmiş taksit yok." : `${taksitler.length} gecikmiş taksit var.`,
      href: "/muhasebe?tab=taksit&durum=GECIKTI",
    },
  ];

  // ── İşlem analizi ─────────────────────────────────────────────────────────
  const treatmentCounts: Record<string, number> = {};
  const toothCounts: Record<string, number> = {};
  for (const e of examinations) {
    const t = e.treatmentName || "Bilinmiyor";
    treatmentCounts[t] = (treatmentCounts[t] || 0) + 1;
    for (const tn of (e.toothNo || "").split(",").filter(Boolean)) {
      toothCounts[tn.trim()] = (toothCounts[tn.trim()] || 0) + 1;
    }
  }
  const topExaminations = Object.entries(treatmentCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([treatmentName,count])=>({treatmentName,count}));
  const topTeeth        = Object.entries(toothCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([tooth,count])=>({tooth,count}));
  const labStatusMap: Record<string,number> = {};
  for (const o of labOrders) labStatusMap[o.status] = (labStatusMap[o.status] || 0) + 1;

  return NextResponse.json({
    // Genel
    total: totalRevenue,
    totalRevenue,
    totalExpenses,
    totalLabCost,
    totalFirmaAlim,
    netCash,
    newPatients,
    totalExaminations: examinations.length,
    // Ödeme yöntemleri
    cash:      cashTotal,
    card:      cardTotal,
    transfer:  transferTotal,
    mailOrder: mailOrderTotal,
    other:     otherTotal,
    // Gider
    expenseByCategory: Object.entries(expenseByCategory).sort((a,b)=>b[1]-a[1]).map(([category,amount])=>({category,amount})),
    // Tedarikçi
    firmaByName: Object.entries(firmaByName).sort((a,b)=>b[1]-a[1]).map(([name,amount])=>({name,amount})),
    // KDV
    outputVAT: Math.round(outputVAT * 100) / 100,
    inputVAT:  Math.round(inputVAT  * 100) / 100,
    netVAT:    Math.round(netVAT    * 100) / 100,
    // Vergi
    periodNetProfit: Math.round(periodNetProfit * 100) / 100,
    annualNetProfit: Math.round(annualNetProfit * 100) / 100,
    gelirVergisi:    Math.round(gelirVergisi    * 100) / 100,
    // İşlemler
    topExaminations,
    topTeeth,
    labStatusSummary: labStatusMap,
    totalLabOrders: labOrders.length,
    overdueInstallments: taksitler.length,
    dayClose: {
      income: totalRevenue,
      expense: totalExpenses,
      net: netCash,
      cashIn: cashTotal,
      cashOut: Math.round(cashExpenses * 100) / 100,
      cashNet: Math.round((cashTotal - cashExpenses) * 100) / 100,
      cash: cashTotal,
      card: cardTotal,
      transfer: transferTotal,
      mailOrder: mailOrderTotal,
      other: otherTotal,
      openLabCount,
      openFollowUpCount,
      overdueInstallments: taksitler.length,
      unpaidTreatmentPatientCount,
      checks: dayCloseChecks,
    },
  });
});
