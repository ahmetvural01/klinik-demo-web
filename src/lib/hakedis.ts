import { prisma } from "@/lib/prisma";
import { stripSystemTags } from "@/lib/format-text";
import { turkeyMonthRangeUtc, turkeyDateKey } from "@/lib/tz";
import type { Prisma } from "@prisma/client";

export type DoctorRates = { kkYuzde: number; genelYuzde: number; maasYuzde: number };

// Rapor sayfasındaki (src/app/api/reports/route.ts) hakediş formülüyle birebir
// aynı mantık — iki yerde farklı sonuç çıkmasın diye buradan paylaşılıyor.
const TREATMENT_ONLY_WHERE = {
  NOT: [
    { status: { contains: "diagnoz", mode: "insensitive" as const } },
    { status: { contains: "ön teşhis", mode: "insensitive" as const } },
    { status: { contains: "on teshis", mode: "insensitive" as const } },
  ],
};

export function effectiveDoctorWhere(institutionId?: string | null): Prisma.UserWhereInput {
  return {
    isActive: true,
    ...(institutionId ? { institutionId } : {}),
    OR: [
      { role: "DOKTOR" },
      { role: "YONETICI", profile: { is: { hideAsDoctor: false } } },
    ],
  };
}

/**
 * Hakediş süreçlerine (ödeme, aylık döküm, detay) dahil olabilecek kullanıcıyı
 * bulur: DOKTOR rolü her zaman uygundur; YONETICI ise yalnızca ayarlardan
 * "randevu/hakediş ekranlarında doktor olarak görünsün" işaretlenmişse
 * (profile.hideAsDoctor === false) uygun sayılır.
 */
export async function findEligibleDoctor(params: { doctorId: string; institutionId: string | null }) {
  const { doctorId, institutionId } = params;
  const user = await prisma.user.findFirst({
    where: {
      id: doctorId,
      ...(institutionId ? { institutionId } : {}),
    },
    select: {
      id: true, fullName: true, role: true,
      kkYuzde: true, genelYuzde: true, maasYuzde: true,
      profile: { select: { hideAsDoctor: true } },
    },
  });
  if (!user) return null;
  const eligible = user.role === "DOKTOR" || (user.role === "YONETICI" && !user.profile?.hideAsDoctor);
  return eligible ? user : null;
}

// Önceden doğrudan Date.UTC ay sınırları kullanıyordu — Türkiye saatiyle
// 00:00-02:59 arasındaki bir işlem (ör. ayın ilk günü gece yarısından hemen
// sonra girilen bir ödeme/muayene) yanlış aya sayılıyordu; bu, o ay daha
// sonra hakediş ödemesiyle "kapatıldığında" fark edilmeden kilitli bir
// döneme hapsolabiliyordu (bkz. denetim raporu). Artık src/lib/tz.ts'deki
// Türkiye-yerel ay aralığı kullanılıyor.
export function monthRangeUtc(year: number, month: number) {
  return turkeyMonthRangeUtc(year, month);
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Bir ay için geçerli olan doktor komisyon oranını döner. Oranlar personel
 * ekranından değiştirildiğinde `DoctorRateHistory`'e dönem-damgalı bir satır
 * eklenir; burada o ayın SONUNDA geçerli olan en güncel (effectiveFrom <= ay
 * sonu) satır aranır. Hiç geçmiş kaydı yoksa (oran hiç değiştirilmemiş veya
 * bu özellik eklenmeden önceki dönem) `fallback` (User üzerindeki güncel
 * oran) kullanılır — böylece geçmişte zaten ödenmiş bir ayın hakedişi, oran
 * daha sonra değiştirildiğinde sessizce değişmez.
 */
export async function getDoctorRatesForMonth(doctorId: string, year: number, month: number, fallback: DoctorRates): Promise<DoctorRates> {
  const { end } = monthRangeUtc(year, month);
  const historyRow = await prisma.doctorRateHistory.findFirst({
    where: { doctorId, effectiveFrom: { lte: end } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!historyRow) return fallback;
  return {
    kkYuzde: Number(historyRow.kkYuzde),
    genelYuzde: Number(historyRow.genelYuzde),
    maasYuzde: Number(historyRow.maasYuzde),
  };
}

/**
 * Bir doktorun, verilen tarih aralığındaki üretimini ay ay hakediş tutarına çevirir.
 * Formül: kkMasraf = kk * kkYuzde/100; genelMasraf = ciro * genelYuzde/100;
 *         brüt = ciro - (kkMasraf + labCost + genelMasraf); hakediş = brüt * maasYuzde/100.
 * Her ay, kendi döneminde geçerli olan orana göre hesaplanır (bkz. getDoctorRatesForMonth) —
 * `rates` parametresi yalnızca hiç oran geçmişi olmayan aylar için varsayılan/fallback'tir.
 */
export async function computeDoctorMonthlyHakedis(params: {
  doctorId: string;
  rates: DoctorRates;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const { doctorId, rates, rangeStart, rangeEnd } = params;

  const [examinations, labInvoices] = await Promise.all([
    prisma.examination.findMany({
      where: { doctorId, diagnosedAt: { gte: rangeStart, lte: rangeEnd }, ...TREATMENT_ONLY_WHERE },
      select: { patientId: true, amount: true, diagnosedAt: true },
    }),
    (prisma as any).labOrderInvoice.findMany({
      where: { labOrder: { doctorId }, issuedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { amount: true, issuedAt: true },
    }),
  ]);

  const patientIds = [...new Set(examinations.map((e) => e.patientId))];
  const patientPayments = patientIds.length > 0
    ? await prisma.payment.findMany({
        where: {
          patientId: { in: patientIds },
          doctorId,
          status: "ACTIVE",
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { amount: true, method: true, createdAt: true },
      })
    : [];

  const buckets = new Map<string, { year: number; month: number; ciro: number; kk: number; labCost: number }>();
  const ensure = (d: Date) => {
    // getUTCFullYear()/getUTCMonth() yerine Türkiye takvim tarihi kullanılır
    // — aksi halde 00:00-02:59 Türkiye saatindeki bir kayıt bir önceki UTC
    // gününe (dolayısıyla bazen bir önceki aya) sayılırdı.
    const [yearStr, monthStr] = turkeyDateKey(d).split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const key = monthKey(year, month);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { year, month, ciro: 0, kk: 0, labCost: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const e of examinations) ensure(new Date(e.diagnosedAt)).ciro += Number(e.amount);
  for (const inv of labInvoices) ensure(new Date(inv.issuedAt)).labCost += Number(inv.amount || 0);
  for (const p of patientPayments) {
    if (p.method === "KREDI_KARTI") ensure(new Date(p.createdAt)).kk += Number(p.amount);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const results = await Promise.all(
    Array.from(buckets.values()).map(async (b) => {
      const monthRates = await getDoctorRatesForMonth(doctorId, b.year, b.month, rates);
      const kkMasraf = b.kk * (monthRates.kkYuzde / 100);
      const genelMasraf = b.ciro * (monthRates.genelYuzde / 100);
      const toplamGider = kkMasraf + b.labCost + genelMasraf;
      const brut = b.ciro - toplamGider;
      const hakedilen = round2(brut * (monthRates.maasYuzde / 100));
      return {
        year: b.year, month: b.month,
        ciro: round2(b.ciro), hakedilen,
        breakdown: {
          ciro: round2(b.ciro),
          kk: round2(b.kk),
          kkMasraf: round2(kkMasraf),
          genelMasraf: round2(genelMasraf),
          labCost: round2(b.labCost),
          toplamGider: round2(toplamGider),
          brut: round2(brut),
          hakedilen,
          kkYuzde: monthRates.kkYuzde,
          genelYuzde: monthRates.genelYuzde,
          maasYuzde: monthRates.maasYuzde,
        },
      };
    })
  );

  return results.sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

/**
 * Bir doktorun belirli bir ayı için hakediş ödemesi zaten yapılmış mı (en az
 * bir gider/eski ödeme kaydı o döneme etiketlenmiş mi) kontrol eder. "Kapanmış"
 * sayılan bir ayda, o doktorun cirosunu etkileyen kayıtların (hasta ödemesi,
 * doktor ödemesi) tarihini/tutarını sessizce değiştirmek, zaten ödenmiş bir
 * hakedişi geçmişe dönük olarak tutarsız hale getirir — bu yüzden ilgili
 * API'ler bu kontrolü kullanarak değişikliği reddeder (bkz. denetim raporu).
 */
export async function isDoctorPeriodSettled(doctorId: string, institutionId: string | null, year: number, month: number): Promise<boolean> {
  const [expenseCount, legacyPaymentCount] = await Promise.all([
    (prisma as any).expense.count({
      where: {
        doctorId,
        status: "AKTIF",
        periodYear: year,
        periodMonth: month,
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.payment.count({
      where: {
        doctorId,
        patientId: null,
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        createdAt: { gte: monthRangeUtc(year, month).start, lte: monthRangeUtc(year, month).end },
      },
    }),
  ]);
  return expenseCount > 0 || legacyPaymentCount > 0;
}

/**
 * Bir doktora, verilen tarih aralığında fiilen ödenmiş hakediş tutarını ay ay döner.
 * Yeni ödemeler Expense.doctorId+periodYear+periodMonth ile etiketlenir; eski
 * "Hakediş Öde" akışıyla oluşturulmuş Payment.doctorId kayıtları da (geriye dönük
 * uyumluluk için) createdAt'in düştüğü takvim ayına sayılır.
 */
export async function computeDoctorMonthlyOdenen(params: {
  doctorId: string;
  institutionId: string | null;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const { doctorId, institutionId, rangeStart, rangeEnd } = params;

  const [expenseRows, legacyPayments] = await Promise.all([
    (prisma as any).expense.findMany({
      where: {
        doctorId,
        status: "AKTIF",
        tarih: { gte: rangeStart, lte: rangeEnd },
        ...(institutionId ? { institutionId } : {}),
      },
      select: { tutar: true, periodYear: true, periodMonth: true, tarih: true },
    }),
    prisma.payment.findMany({
      where: {
        doctorId,
        patientId: null,
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { amount: true, createdAt: true },
    }),
  ]);

  const buckets = new Map<string, number>();
  const add = (year: number, month: number, amount: number) => {
    const key = monthKey(year, month);
    buckets.set(key, (buckets.get(key) || 0) + amount);
  };

  for (const row of expenseRows) {
    if (row.periodYear != null && row.periodMonth != null) {
      add(row.periodYear, row.periodMonth, Number(row.tutar));
    } else {
      const [yearStr, monthStr] = turkeyDateKey(new Date(row.tarih)).split("-");
      add(Number(yearStr), Number(monthStr), Number(row.tutar));
    }
  }
  for (const p of legacyPayments) {
    const [yearStr, monthStr] = turkeyDateKey(new Date(p.createdAt)).split("-");
    add(Number(yearStr), Number(monthStr), Number(p.amount));
  }

  return buckets;
}

/**
 * Bir doktorun tek bir aya ait hakediş hesabına giren HER satırı (muayeneler,
 * hasta ödemeleri, lab faturaları, kendisine yapılan hakediş ödemeleri) tek tek
 * döner — "Detay" görünümü ve PDF/Excel dışa aktarımı için kullanılır.
 */
export async function getDoctorMonthDetail(params: {
  doctorId: string;
  institutionId: string | null;
  year: number;
  month: number;
}) {
  const { doctorId, institutionId, year, month } = params;
  const { start, end } = monthRangeUtc(year, month);

  const examinations = await prisma.examination.findMany({
    where: { doctorId, diagnosedAt: { gte: start, lte: end }, ...TREATMENT_ONLY_WHERE },
    select: {
      id: true, patientId: true, diagnosedAt: true, treatmentName: true, toothNo: true, amount: true,
      patient: { select: { fullName: true } },
    },
    orderBy: { diagnosedAt: "asc" },
  });

  const patientIds = [...new Set(examinations.map((e) => e.patientId))];
  const patientPayments = patientIds.length > 0
    ? await prisma.payment.findMany({
        where: {
          patientId: { in: patientIds },
          doctorId,
          status: "ACTIVE",
          ...(institutionId ? { institutionId } : {}),
          createdAt: { gte: start, lte: end },
        },
        select: { id: true, createdAt: true, amount: true, method: true, patient: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const [labInvoices, payoutExpenses] = await Promise.all([
    (prisma as any).labOrderInvoice.findMany({
      where: { labOrder: { doctorId }, issuedAt: { gte: start, lte: end } },
      select: { id: true, issuedAt: true, amount: true, item: true, labOrder: { select: { labName: true } } },
      orderBy: { issuedAt: "asc" },
    }),
    (prisma as any).expense.findMany({
      where: {
        doctorId,
        status: "AKTIF",
        // Bu ay içinde kaydedilmiş VEYA bu aya etiketlenmiş ödemeler (ikisi de olabilir).
        OR: [
          { periodYear: year, periodMonth: month },
          { AND: [{ periodYear: null }, { tarih: { gte: start, lte: end } }] },
        ],
        ...(institutionId ? { institutionId } : {}),
      },
      select: { id: true, tarih: true, tutar: true, description: true, yontem: true },
      orderBy: { tarih: "asc" },
    }),
  ]);

  return {
    examinations: examinations.map((e) => ({
      id: e.id,
      tarih: e.diagnosedAt,
      hasta: e.patient?.fullName || "-",
      tedavi: e.treatmentName || "-",
      dis: e.toothNo || null,
      tutar: Number(e.amount),
    })),
    patientPayments: patientPayments.map((p) => ({
      id: p.id,
      tarih: p.createdAt,
      hasta: p.patient?.fullName || "-",
      yontem: p.method,
      tutar: Number(p.amount),
    })),
    labInvoices: labInvoices.map((i: any) => ({
      id: i.id,
      tarih: i.issuedAt,
      lab: i.labOrder?.labName || "-",
      kalem: i.item || "-",
      tutar: Number(i.amount || 0),
    })),
    payoutExpenses: payoutExpenses.map((e: any) => ({
      id: e.id,
      tarih: e.tarih,
      tutar: Number(e.tutar),
      aciklama: stripSystemTags(e.description) || null,
      yontem: e.yontem,
    })),
  };
}
