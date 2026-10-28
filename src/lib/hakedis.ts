import { prisma } from "@/lib/prisma";
import { stripSystemTags } from "@/lib/format-text";
import { turkeyMonthRangeUtc, turkeyDateKey } from "@/lib/tz";
import { EXAM_STATUS_CANCELLED } from "@/lib/examination-status";
import type { Prisma } from "@prisma/client";

export type DoctorRates = { kkYuzde: number; genelYuzde: number; maasYuzde: number };

// Ön teşhis (diagnoz) kayıtları ücrete yansımaz. Hakediş bunun yanında
// planlanan (PLANLANDI) ve iptal edilen (IPTAL) tedavileri de saymaz — hasta
// bakiyesi ve Raporlar'daki hakediş (src/app/api/reports/route.ts) ile aynı
// kural (CHARGEABLE_EXAMINATION_WHERE). Sorgu ön teşhisi dışarıda bırakır; iki
// durum ise ödenmiş dönemlerin eski hesabını koruyabilmek için kodda ayrılır
// (bkz. computeDoctorMonthlyHakedis).
const TREATMENT_ONLY_WHERE = {
  NOT: [
    { status: { contains: "diagnoz", mode: "insensitive" as const } },
    { status: { contains: "ön teşhis", mode: "insensitive" as const } },
    { status: { contains: "on teshis", mode: "insensitive" as const } },
  ],
};
const NOT_CHARGEABLE_STATUSES = new Set<string>(["PLANLANDI", EXAM_STATUS_CANCELLED]);

/**
 * Tedavi (ön teşhis olmayan) kaydı yeni hakediş kuralında sayılır mı? Planlanan
 * ve iptal edilen sayılmaz. Dönem kilidi (api/examinations/[id]) de bu kuralı
 * kullanır: ödenmiş ayda sayılma durumunu değiştiren geçiş hakedişi değiştirir.
 */
export function isChargeableForHakedis(status: string | null | undefined) {
  return !NOT_CHARGEABLE_STATUSES.has(String(status ?? ""));
}

/**
 * "Hekim kimdir" kuralının sunucu karşılığı (istemcide lib/staff-roles
 * `isEffectiveDoctor`): DOKTOR her zaman; YÖNETİCİ, "Doktor olarak gizle"
 * işaretli değilse hekimdir. Profil kaydı olmayan yönetici de hekim sayılır —
 * kurum sahibi hesabı profilsiz açılıyor; önceden seçicilerde görünüp seçilince
 * 403 alıyor, sahip-hekim takvimden kayboluyordu.
 */
export function effectiveDoctorWhere(institutionId?: string | null, branchId?: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    ...(institutionId ? { institutionId } : {}),
    ...(branchId ? { branchMemberships: { some: { branchId, isActive: true } } } : {}),
    OR: [
      { role: "DOKTOR" },
      { role: "YONETICI", OR: [{ profile: { is: null } }, { profile: { is: { hideAsDoctor: false } } }] },
    ],
  };
}

/**
 * Hakediş süreçlerine (ödeme, aylık döküm, detay) dahil olabilecek kullanıcıyı
 * bulur: DOKTOR rolü her zaman uygundur; YONETICI ise "Doktor olarak gizle"
 * işaretli değilse (profil kaydı yoksa da) uygundur — effectiveDoctorWhere ile
 * aynı kural.
 */
export async function findEligibleDoctor(params: { doctorId: string; institutionId: string | null; branchId: string }) {
  const { doctorId, institutionId, branchId } = params;
  const user = await prisma.user.findFirst({
    where: {
      id: doctorId,
      ...(institutionId ? { institutionId } : {}),
      branchMemberships: { some: { branchId, isActive: true } },
    },
    select: {
      id: true, fullName: true, role: true,
      kkYuzde: true, genelYuzde: true, maasYuzde: true,
      profile: { select: { hideAsDoctor: true } },
      branchMemberships: {
        where: { branchId, isActive: true },
        select: { kkYuzde: true, genelYuzde: true, maasYuzde: true },
        take: 1,
      },
    },
  });
  if (!user) return null;
  const eligible = user.role === "DOKTOR" || (user.role === "YONETICI" && !user.profile?.hideAsDoctor);
  if (!eligible) return null;
  const branchRates = user.branchMemberships[0];
  return {
    ...user,
    kkYuzde: branchRates?.kkYuzde ?? user.kkYuzde,
    genelYuzde: branchRates?.genelYuzde ?? user.genelYuzde,
    maasYuzde: branchRates?.maasYuzde ?? user.maasYuzde,
  };
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
 * Verilen aralıkta hakediş ödemesi yapılmış (kapanmış) ayların anahtarları —
 * isDoctorPeriodSettled ile aynı ölçüt: o aya etiketlenmiş aktif "Doktor
 * Hakedişi" gideri ya da o ay kaydedilmiş eski hakediş ödemesi.
 */
async function settledMonthKeys(params: { doctorId: string; institutionId: string | null; branchId: string; rangeStart: Date; rangeEnd: Date }) {
  const { doctorId, institutionId, branchId, rangeStart, rangeEnd } = params;
  const startKey = turkeyDateKey(rangeStart).slice(0, 7);
  const endKey = turkeyDateKey(rangeEnd).slice(0, 7);
  const [expenseRows, legacyPayments] = await Promise.all([
    prisma.expense.findMany({
      where: {
        doctorId,
        status: "AKTIF",
        ...(institutionId ? { institutionId } : {}),
        branchId,
        periodYear: { gte: Number(startKey.slice(0, 4)), lte: Number(endKey.slice(0, 4)) },
        periodMonth: { not: null },
      },
      select: { periodYear: true, periodMonth: true },
    }),
    prisma.payment.findMany({
      where: {
        doctorId,
        patientId: null,
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        branchId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true },
    }),
  ]);
  const keys = new Set<string>();
  for (const row of expenseRows) {
    if (row.periodYear == null || row.periodMonth == null) continue;
    const key = monthKey(row.periodYear, row.periodMonth);
    if (key >= startKey && key <= endKey) keys.add(key);
  }
  for (const payment of legacyPayments) keys.add(turkeyDateKey(new Date(payment.createdAt)).slice(0, 7));
  return keys;
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
export async function getDoctorRatesForMonth(doctorId: string, institutionId: string, branchId: string, year: number, month: number, fallback: DoctorRates): Promise<DoctorRates> {
  const { end } = monthRangeUtc(year, month);
  const historyRow = await prisma.doctorRateHistory.findFirst({
    where: { doctorId, institutionId, branchId, effectiveFrom: { lte: end } },
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
 *
 * Ciroya planlanan (PLANLANDI) ve iptal edilen (IPTAL) tedaviler girmez. Kural
 * değişmeden önce eski hesapla ödenmiş bir ay, kural değişti diye "fazla ödendi"
 * ya da eksi kalan göstermesin: hakedişi ödenmiş bir ayda ödenen tutar yeni
 * hesabı aşıyorsa eski hesap (planlanan/iptal dahil) kullanılır ve hakediş
 * ödenenle sınırlanır (kalan 0; ikinci ödeme açılmaz). Ödenen yeni hesabı
 * aşmıyorsa (yeni kuralla ödenmiş ya da kısmen ödenmiş ay) yeni hesap geçerlidir.
 * Önceden "ödenmiş ay eski hesapla" kuralı yeni hesapla ödenen ayı da eski
 * hesaba döndürüyor, iptal/planlanan tedavilerin payını yeniden "Ödenecek"
 * gösteriyordu. Ay satırındaki `rule` hangi hesabın seçildiğini söyler
 * (ay ayrıntısı aynı satırları listeler, bkz. getDoctorMonthDetail).
 */
export async function computeDoctorMonthlyHakedis(params: {
  doctorId: string;
  institutionId: string;
  branchId: string;
  rates: DoctorRates;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const { doctorId, institutionId, branchId, rates, rangeStart, rangeEnd } = params;

  const [examinationRows, labInvoices, settledKeys] = await Promise.all([
    prisma.examination.findMany({
      where: { doctorId, institutionId, branchId, diagnosedAt: { gte: rangeStart, lte: rangeEnd }, ...TREATMENT_ONLY_WHERE },
      select: { patientId: true, amount: true, diagnosedAt: true, status: true },
    }),
    (prisma as any).labOrderInvoice.findMany({
      where: { status: "ACTIVE", labOrder: { doctorId, institutionId, branchId }, issuedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { amount: true, issuedAt: true },
    }),
    settledMonthKeys({ doctorId, institutionId, branchId, rangeStart, rangeEnd }),
  ]);
  // getUTCFullYear()/getUTCMonth() yerine Türkiye takvim tarihi kullanılır
  // — aksi halde 00:00-02:59 Türkiye saatindeki bir kayıt bir önceki UTC
  // gününe (dolayısıyla bazen bir önceki aya) sayılırdı.
  const keyOf = (d: Date) => turkeyDateKey(new Date(d)).slice(0, 7);
  const chargeable = examinationRows.filter((e) => isChargeableForHakedis(e.status));
  // Kart komisyonu, AYNI AY tedavi gören hastaların o ayki kartlı tahsilatından
  // kesilir. Hasta kümesi ay ay tutulur: önceden 12 aylık listede bir önceki ay
  // tedavi görüp bu ay kartla ödeyen hasta da sayılıyor, aynı ay ayrıntıda,
  // özette ve ödeme kontrolünde (tek aylık hesap) sayılmıyordu; liste ile
  // ayrıntı farklı hakediş gösterebiliyordu. Artık sonuç sorgu aralığından
  // bağımsız: her ay, yalnız o ay hesaplanmış gibi çıkar.
  const patientsByMonth = (rows: typeof examinationRows) => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = keyOf(row.diagnosedAt);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(row.patientId);
    }
    return map;
  };
  const chargeablePatients = patientsByMonth(chargeable);
  const treatedPatients = patientsByMonth(examinationRows);
  const hasSettled = settledKeys.size > 0;
  // Eski hesap (planlanan/iptal dahil) yalnız ödenmiş aylar için gerekir.
  const legacyRows = hasSettled ? examinationRows.filter((e) => settledKeys.has(keyOf(e.diagnosedAt))) : [];
  const patientIds = [...new Set((hasSettled ? examinationRows : chargeable).map((e) => e.patientId))];

  const [patientPayments, paidByMonth] = await Promise.all([
    patientIds.length > 0
      ? prisma.payment.findMany({
          where: {
            patientId: { in: patientIds },
            doctorId,
            institutionId,
            branchId,
            status: "ACTIVE",
            createdAt: { gte: rangeStart, lte: rangeEnd },
          },
          select: { amount: true, method: true, createdAt: true, patientId: true },
        })
      : Promise.resolve([]),
    // Hakediş ay kapandıktan sonra ödenir: o aya etiketli ödemeler bugüne kadar okunur.
    hasSettled
      ? computeDoctorMonthlyOdenen({ doctorId, institutionId, branchId, rangeStart, rangeEnd: new Date(Math.max(rangeEnd.getTime(), Date.now())) })
      : Promise.resolve(new Map<string, number>()),
  ]);

  type Bucket = { year: number; month: number; ciro: number; kk: number; labCost: number };
  const ensure = (buckets: Map<string, Bucket>, d: Date) => {
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

  const current = new Map<string, Bucket>();
  for (const e of chargeable) ensure(current, new Date(e.diagnosedAt)).ciro += Number(e.amount);
  for (const inv of labInvoices) ensure(current, new Date(inv.issuedAt)).labCost += Number(inv.amount || 0);
  for (const p of patientPayments) {
    if (p.method === "KREDI_KARTI" && p.patientId && chargeablePatients.get(keyOf(p.createdAt))?.has(p.patientId)) ensure(current, new Date(p.createdAt)).kk += Number(p.amount);
  }

  const legacy = new Map<string, Bucket>();
  if (hasSettled) {
    for (const e of legacyRows) ensure(legacy, new Date(e.diagnosedAt)).ciro += Number(e.amount);
    for (const inv of labInvoices) {
      if (settledKeys.has(keyOf(inv.issuedAt))) ensure(legacy, new Date(inv.issuedAt)).labCost += Number(inv.amount || 0);
    }
    for (const p of patientPayments) {
      const key = keyOf(p.createdAt);
      if (p.method === "KREDI_KARTI" && settledKeys.has(key) && p.patientId && treatedPatients.get(key)?.has(p.patientId)) ensure(legacy, new Date(p.createdAt)).kk += Number(p.amount);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const calc = (b: Bucket, monthRates: DoctorRates) => {
    const kkMasraf = b.kk * (monthRates.kkYuzde / 100);
    const genelMasraf = b.ciro * (monthRates.genelYuzde / 100);
    const toplamGider = kkMasraf + b.labCost + genelMasraf;
    const brut = b.ciro - toplamGider;
    const hakedilen = round2(brut * (monthRates.maasYuzde / 100));
    return {
      ciro: round2(b.ciro),
      hakedilen,
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
  };

  const keys = new Set([...current.keys(), ...legacy.keys()]);
  const results = await Promise.all(
    Array.from(keys).map(async (key) => {
      const base = (current.get(key) ?? legacy.get(key)) as Bucket;
      const monthRates = await getDoctorRatesForMonth(doctorId, institutionId, branchId, base.year, base.month, rates);
      const chargeableResult = calc(current.get(key) ?? { year: base.year, month: base.month, ciro: 0, kk: 0, labCost: 0 }, monthRates);
      const legacyBucket = legacy.get(key);
      const paid = paidByMonth.get(key) || 0;
      if (!legacyBucket || paid <= chargeableResult.hakedilen + 0.5) {
        return { year: base.year, month: base.month, ...chargeableResult, rule: "chargeable" as const };
      }
      // Ödenen yeni hesabı aşıyor: ay kural değişmeden önce eski hesapla ödenmiş.
      const legacyResult = calc(legacyBucket, monthRates);
      const chosen = legacyResult.hakedilen >= chargeableResult.hakedilen ? legacyResult : chargeableResult;
      return {
        year: base.year,
        month: base.month,
        ...chosen,
        hakedilen: round2(Math.min(paid, chosen.hakedilen)),
        rule: chosen === legacyResult ? "legacy" as const : "chargeable" as const,
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
export async function isDoctorPeriodSettled(doctorId: string, institutionId: string | null, branchId: string, year: number, month: number): Promise<boolean> {
  const [expenseCount, legacyPaymentCount] = await Promise.all([
    (prisma as any).expense.count({
      where: {
        doctorId,
        status: "AKTIF",
        periodYear: year,
        periodMonth: month,
        ...(institutionId ? { institutionId } : {}),
        branchId,
      },
    }),
    prisma.payment.count({
      where: {
        doctorId,
        patientId: null,
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        branchId,
        createdAt: { gte: monthRangeUtc(year, month).start, lte: monthRangeUtc(year, month).end },
      },
    }),
  ]);
  return expenseCount > 0 || legacyPaymentCount > 0;
}

/**
 * Hakedişi ödenmiş bir ay eski kuralla mı (planlanan ve iptal edilen
 * tedaviler dahil) hesaplanıyor? computeDoctorMonthlyHakedis'in o ay için
 * seçtiği kural (`rule`). Dönem kilidi bunu yalnız eski hesabı etkileyen bir
 * düzeltmede sorar (ör. planlanan tedaviyi "Yapıldı" ile bugüne taşımak): yeni
 * kuralla hesaplanan ödenmiş ayın hakedişini böyle bir düzeltme değiştirmez.
 * Oran yedeği hakediş ekranlarıyla aynıdır (şube oranı, yoksa kişinin oranı).
 */
export async function isDoctorMonthOnLegacyRule(params: { doctorId: string; institutionId: string; branchId: string; year: number; month: number }): Promise<boolean> {
  const { doctorId, institutionId, branchId, year, month } = params;
  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, institutionId },
    select: {
      kkYuzde: true, genelYuzde: true, maasYuzde: true,
      branchMemberships: { where: { branchId }, select: { kkYuzde: true, genelYuzde: true, maasYuzde: true }, take: 1 },
    },
  });
  // Doktor bulunamazsa güvenli taraf: eski hesap sayılır (kilit uygulanır).
  if (!doctor) return true;
  const branchRates = doctor.branchMemberships[0];
  const rates = {
    kkYuzde: Number(branchRates?.kkYuzde ?? doctor.kkYuzde ?? 3),
    genelYuzde: Number(branchRates?.genelYuzde ?? doctor.genelYuzde ?? 15),
    maasYuzde: Number(branchRates?.maasYuzde ?? doctor.maasYuzde ?? 40),
  };
  const { start, end } = monthRangeUtc(year, month);
  const rows = await computeDoctorMonthlyHakedis({ doctorId, institutionId, branchId, rates, rangeStart: start, rangeEnd: end });
  return rows.find((row) => row.year === year && row.month === month)?.rule === "legacy";
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
  branchId: string;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const { doctorId, institutionId, branchId, rangeStart, rangeEnd } = params;

  const [expenseRows, legacyPayments] = await Promise.all([
    (prisma as any).expense.findMany({
      where: {
        doctorId,
        status: "AKTIF",
        tarih: { gte: rangeStart, lte: rangeEnd },
        ...(institutionId ? { institutionId } : {}),
        branchId,
      },
      select: { tutar: true, periodYear: true, periodMonth: true, tarih: true },
    }),
    prisma.payment.findMany({
      where: {
        doctorId,
        patientId: null,
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        branchId,
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
  branchId: string;
  year: number;
  month: number;
  /**
   * Ayın hesabı eski kuralla mı seçildi (computeDoctorMonthlyHakedis satırındaki
   * `rule === "legacy"`: kural değişmeden önce ödenmiş ay)? Öyleyse planlanan ve
   * iptal edilen tedaviler de listelenir. Varsayılan: yalnız hakedişe girenler.
   */
  legacyRule?: boolean;
}) {
  const { doctorId, institutionId, branchId, year, month, legacyRule = false } = params;
  const { start, end } = monthRangeUtc(year, month);

  // Satırlar aylık hesapla (computeDoctorMonthlyHakedis) aynı kuralla seçilir.
  const examinationRows = await prisma.examination.findMany({
    where: { doctorId, ...(institutionId ? { institutionId } : {}), branchId, diagnosedAt: { gte: start, lte: end }, ...TREATMENT_ONLY_WHERE },
    select: {
      id: true, patientId: true, diagnosedAt: true, treatmentName: true, toothNo: true, amount: true, status: true,
      patient: { select: { fullName: true } },
    },
    orderBy: { diagnosedAt: "asc" },
  });
  const examinations = legacyRule ? examinationRows : examinationRows.filter((e) => isChargeableForHakedis(e.status));

  const patientIds = [...new Set(examinations.map((e) => e.patientId))];
  const patientPayments = patientIds.length > 0
    ? await prisma.payment.findMany({
        where: {
          patientId: { in: patientIds },
          doctorId,
          status: "ACTIVE",
          ...(institutionId ? { institutionId } : {}),
          branchId,
          createdAt: { gte: start, lte: end },
        },
        select: { id: true, createdAt: true, amount: true, method: true, patient: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const [labInvoices, payoutExpenses] = await Promise.all([
    (prisma as any).labOrderInvoice.findMany({
      where: { status: "ACTIVE", labOrder: { doctorId, ...(institutionId ? { institutionId } : {}), branchId }, issuedAt: { gte: start, lte: end } },
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
        branchId,
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
