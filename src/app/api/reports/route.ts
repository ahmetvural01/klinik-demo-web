import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";

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

  const institutionId = auth.user.institutionId;

  const from = request.nextUrl.searchParams.get("from") || request.nextUrl.searchParams.get("start");
  const to   = request.nextUrl.searchParams.get("to")   || request.nextUrl.searchParams.get("end");

  // Yıl bazlı vergi hesabı için yıl başı/sonu
  const pivotYear = from ? new Date(from).getFullYear() : new Date().getFullYear();
  const yearStart = new Date(`${pivotYear}-01-01T00:00:00Z`);
  const yearEnd   = new Date(`${pivotYear}-12-31T23:59:59Z`);

  // from/to hiç verilmezse tüm geçmiş taranmasın diye içinde bulunulan yıl varsayılır.
  const dateFilter = (from || to) ? {
    gte: from ? new Date(from) : undefined,
    lte: to   ? new Date(to)   : undefined,
  } : { gte: yearStart, lte: yearEnd };

  const treatmentOnlyWhere = {
    NOT: [
      { status: { contains: "diagnoz", mode: "insensitive" as const } },
      { status: { contains: "ön teşhis", mode: "insensitive" as const } },
      { status: { contains: "on teshis", mode: "insensitive" as const } },
    ],
  };

  const institutionDoctors = institutionId
    ? await prisma.user.findMany({
        where: effectiveDoctorWhere(institutionId),
        select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);
  const institutionPatientScope = doctorIds.length > 0
    ? {
        OR: [
          { institutionId },
          { examinations: { some: { doctorId: { in: doctorIds } } } },
          { appointments: { some: { doctorId: { in: doctorIds } } } },
        ],
      }
    : undefined;

  // ── Paralel sorgular ──────────────────────────────────────────────────────
  const [payments, examinations, labOrders, expenses, firmaIslemler, newPatients, taksitler, doctors] =
    await Promise.all([
      prisma.payment.findMany({
        where: institutionId
          ? {
              createdAt: dateFilter,
              patientId: { not: null },
              patient: { institutionId },
            }
          : { createdAt: dateFilter },
      }),
      prisma.examination.findMany({
        where: institutionId
          ? { diagnosedAt: dateFilter, ...treatmentOnlyWhere, doctorId: { in: doctorIds } }
          : { diagnosedAt: dateFilter, ...treatmentOnlyWhere },
        include: {
          doctor: { select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true } },
        },
      }),
      (prisma as any).labOrder.findMany({
        where: institutionId
          ? { createdAt: dateFilter, status: { not: "IPTAL" }, patient: { institutionId } }
          : { createdAt: dateFilter, status: { not: "IPTAL" } },
        include: { doctor: { select: { id: true, fullName: true } } },
      }),
      (prisma as any).expense.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          ...(institutionId ? { institutionId } : {}),
        },
        include: { expenseCategory: { select: { name: true } } },
      }),
      (prisma as any).firmaIslem.findMany({
        where: {
          tarih: dateFilter,
          status: { not: "IPTAL" },
          islemTipi: { in: ["ALIM", "HIZMET"] },
          ...(institutionId ? { firma: { institutionId } } : {}),
        },
        include: { firma: { select: { name: true } } },
      }),
      prisma.patient.count({
        where: institutionId
          ? { createdAt: dateFilter, institutionId }
          : doctorIds.length > 0
          ? { createdAt: dateFilter, ...institutionPatientScope }
          : { createdAt: dateFilter },
      }),
      (prisma as any).taksit.findMany({
        where: institutionId
          ? { status: "GECIKTI", plan: { patient: { institutionId } } }
          : { status: "GECIKTI" },
      }),
      // Doktorlar ve yüzdeleri (hakediş için)
      institutionId
        ? Promise.resolve(institutionDoctors)
        : prisma.user.findMany({
            where: effectiveDoctorWhere(null),
            select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
          }),
    ]);

  // Doktor yüzde map
  const doctorRateMap: Record<string, { kkYuzde: number; genelYuzde: number; maasYuzde: number }> = {};
  for (const d of doctors) {
    doctorRateMap[d.id] = {
      kkYuzde:    Number(d.kkYuzde    ?? 3),
      genelYuzde: Number(d.genelYuzde ?? 15),
      maasYuzde:  Number(d.maasYuzde  ?? 40),
    };
  }

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

  // ── Doktor bazlı ödeme yöntemleri (payments'tan doktorId ile) ─────────────
  // Payment'ta doktorId yok; examinations üzerinden doktor-hasta eşleştiriyoruz.
  // Doktor başına KK/Nakit/Havale/MO ayrımı için: patient→doctor eşleşmesi
  // Strateji: examination → doctorId, payment → patientId. patient başına son doctorId
  const patientLastDoctorId: Record<string, string> = {};
  for (const e of examinations) {
    if (e.patientId && e.doctorId) patientLastDoctorId[e.patientId] = e.doctorId;
  }

  // Doktor map (hakediş hesabı için)
  type DoctorStat = {
    id: string; fullName: string;
    examinationCount: number;
    ciro: number; kk: number; nakit: number; havale: number; mo: number;
    labCost: number; labOrderCount: number;
    patientIds: Set<string>;
  };
  const doctorMap: Record<string, DoctorStat> = {};

  const ensureDoctor = (id: string, name: string) => {
    if (!doctorMap[id]) doctorMap[id] = {
      id, fullName: name,
      examinationCount: 0,
      ciro: 0, kk: 0, nakit: 0, havale: 0, mo: 0,
      labCost: 0, labOrderCount: 0,
      patientIds: new Set(),
    };
  };

  for (const exam of examinations) {
    if (!exam.doctorId) continue;
    const dName = exam.doctor?.fullName || "Bilinmiyor";
    ensureDoctor(exam.doctorId, dName);
    doctorMap[exam.doctorId].examinationCount++;
    doctorMap[exam.doctorId].patientIds.add(exam.patientId);
  }

  // Doktor başına geliri payment'tan al (patient'ın son doktorundan)
  for (const p of payments) {
    if (!p.patientId) continue;
    const docId = patientLastDoctorId[p.patientId];
    if (!docId || !doctorMap[docId]) continue;
    const amt = Number(p.amount);
    doctorMap[docId].ciro += amt;
    if (p.method === "KREDI_KARTI")  doctorMap[docId].kk      += amt;
    else if (p.method === "NAKIT")    doctorMap[docId].nakit   += amt;
    else if (p.method === "HAVALE_EFT") doctorMap[docId].havale += amt;
    else if (p.method === "MAIL_ORDER") doctorMap[docId].mo     += amt;
  }

  for (const lab of labOrders) {
    if (!lab.doctorId) continue;
    ensureDoctor(lab.doctorId, lab.doctor?.fullName || "Bilinmiyor");
    doctorMap[lab.doctorId].labOrderCount++;
    doctorMap[lab.doctorId].labCost += Number(lab.price || 0);
  }

  // ── Hakediş hesabı (VBA formülüne birebir uygun) ─────────────────────────
  const doctorReports = Object.values(doctorMap).map((d) => {
    const rates  = doctorRateMap[d.id] ?? { kkYuzde: 3, genelYuzde: 15, maasYuzde: 40 };
    const kkMasraf     = d.kk   * (rates.kkYuzde    / 100);
    const genelMasraf  = d.ciro * (rates.genelYuzde  / 100);
    const toplamGider  = kkMasraf + d.labCost + genelMasraf;
    const brut         = d.ciro - toplamGider;
    const hakEdis      = brut * (rates.maasYuzde / 100);
    return {
      id:                 d.id,
      fullName:           d.fullName,
      examinationCount:   d.examinationCount,
      // Gelir dağılımı
      ciro:               d.ciro,
      kk:                 d.kk,
      nakit:              d.nakit,
      havale:             d.havale,
      mo:                 d.mo,
      // Masraf kalemleri
      kkMasraf,
      labCost:            d.labCost,
      genelMasraf,
      toplamGider,
      // Hakediş
      brut,
      hakEdis,
      // Yüzdeler
      kkYuzde:            rates.kkYuzde,
      genelYuzde:         rates.genelYuzde,
      maasYuzde:          rates.maasYuzde,
      // Eski alanlar (geriye uyumluluk)
      examinationRevenue: d.ciro,
      labOrderCount:      d.labOrderCount,
      netRevenue:         hakEdis,
      uniquePatients:     d.patientIds.size,
    };
  }).sort((a, b) => b.hakEdis - a.hakEdis);

  // ── Gider özeti ────────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.tutar), 0);
  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.expenseCategory?.name || e.category || "Diğer";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.tutar);
  }

  // ── Lab maliyeti özeti ─────────────────────────────────────────────────────
  const totalLabCost = labOrders.reduce((s: number, o: any) => s + Number(o.price || 0), 0);

  // ── Firma alımları (tedarikçi) ─────────────────────────────────────────────
  const totalFirmaAlim = firmaIslemler.reduce((s: number, f: any) => s + Number(f.tutar), 0);
  const firmaByName: Record<string, number> = {};
  for (const f of firmaIslemler) {
    const n = f.firma?.name || "Bilinmiyor";
    firmaByName[n] = (firmaByName[n] || 0) + Number(f.tutar);
  }

  // ── Net Kasa (VBA: Gelir - Gider - Alım) ──────────────────────────────────
  const netCash = totalRevenue - totalExpenses - totalFirmaAlim;

  // ── KDV Özeti ────────────────────────────────────────────────────────────
  // Çıkan KDV (tahsil edilen): gelirden %10 KDV hesapla
  const REVENUE_VAT_RATE = 0.10;
  const outputVAT = totalRevenue - (totalRevenue / (1 + REVENUE_VAT_RATE));
  // Girdi KDV (ödenen): giderlerin kdvOrani alanından
  let inputVAT = 0;
  for (const e of expenses) {
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
        createdAt: { gte: yearStart, lte: yearEnd },
        ...(institutionId ? { patient: { institutionId } } : {}),
      },
    }),
    (prisma as any).expense.findMany({
      where: {
        tarih: { gte: yearStart, lte: yearEnd },
        status: { not: "IPTAL" },
        ...(institutionId ? { institutionId } : {}),
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
    // Doktor raporu (hakediş dahil)
    doctorReports,
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
  });
});
