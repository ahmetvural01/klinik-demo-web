import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CHARGEABLE_EXAMINATION_WHERE } from "@/lib/examination-status";
import { turkeyTodayStartUtc } from "@/lib/tz";

// Hastanın kalan borcunun (bakiye) TEK sunucu kaynağı.
//
// Kural — hasta dosyasının istemci hesabıyla aynı (bkz.
// src/app/(panel)/hasta-detay/_components/patient-file-shared.ts computeBalance
// ve src/lib/examination-status.ts):
//   bakiye = indirimli tedavi toplamı − aktif tahsilatlar
//   • Tedavi toplamına yalnız ücrete yansıyan kayıtlar girer: yapılan ve devam
//     eden tedaviler. Ön teşhis/diagnoz, planlanan (PLANLANDI) ve iptal edilen
//     (IPTAL — silinen kayıt) tedaviler borç DEĞİLDİR.
//   • Hastanın indirim oranı tedavi toplamına uygulanır, sonuç kuruşa yuvarlanır.
//   • Yalnız aktif (iptal edilmemiş) tahsilatlar düşülür; taksit tahsilatları da
//     birer tahsilat kaydı olduğu için dahildir.
//   • Hastanın tedavi ve tahsilat kayıtları hastanın kayıtlı olduğu şubededir
//     (veritabanı ilişkisi bunu zorunlu tutar); hesap aktif şube içinde yapılır.
//
// Hasta listesi bakiye sütunu, Muhasebe > Alacaklar (tahsilat formu ipucu ve
// taksit planı sınırı dahil), Raporlar ve GET /api/patients/[id]/balance bu
// modülü kullanır. Önceden bu üç sunucu yeri iptal edilen ve planlanan
// tedavileri borca sayıyordu, hasta dosyası saymıyordu: aynı hasta için
// ekranlar farklı borç gösteriyordu.
//
// Hekim hakedişi bu modülü KULLANMAZ — src/lib/hakedis.ts kendi kuralıyla
// kalır (ürün kararı).
//
// Para hesabı Prisma.Decimal ile yapılır; JSON yanıtına yalnız en sonda,
// kuruşa yuvarlanmış sayı olarak çevrilir (moneyToNumber).

type MoneyInput = Prisma.Decimal | number | string | null | undefined;

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/**
 * Borçlu ya da fazla ödemeli sayılma eşiği (TL). Kuruş artıkları ve yarım
 * kuruşluk indirim farkları hastayı "borçlu" listesine sokmasın diye Muhasebe >
 * Alacaklar başından beri 0,5 TL eşiğini kullanıyor; Raporlar da aynısını
 * kullanır ki rapordaki sayı Alacaklar listesiyle örtüşsün.
 */
export const BALANCE_THRESHOLD = 0.5;

/**
 * Çok uzun hasta kimliği listesinde (ör. bir yıllık rapordaki binlerce hasta)
 * `IN (...)` sorgusu yerine kapsamın tamamı gruplanıp istenenler bellekte
 * seçilir — veritabanı parametre sınırına takılmasın.
 */
const LARGE_ID_LIST = 5000;

function toDecimal(value: MoneyInput): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  try {
    const decimal = new Prisma.Decimal(value);
    return decimal.isFinite() ? decimal : ZERO;
  } catch {
    return ZERO;
  }
}

/** Kuruşa yuvarlar; yarım kuruş yukarı (hasta dosyasındaki roundMoney ile aynı amaç). */
function roundKurus(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** JSON yanıtı için: kuruşa yuvarlanmış sayı. */
export function moneyToNumber(value: MoneyInput): number {
  return roundKurus(toDecimal(value)).toNumber();
}

export function isDebtorBalance(bakiye: MoneyInput) {
  return toDecimal(bakiye).gt(BALANCE_THRESHOLD);
}

export function isCreditBalance(bakiye: MoneyInput) {
  return toDecimal(bakiye).lt(-BALANCE_THRESHOLD);
}

// ── Saf hesap (veritabanısız) ───────────────────────────────────────────────

export type BalanceFigures = {
  /** Ücrete yansıyan (yapılan/devam eden) tedavilerin indirimsiz toplamı. */
  tedaviToplam: Prisma.Decimal;
  /** Hastanın indirim oranı (%). */
  indirimOrani: number;
  /** İndirim tutarı. */
  indirim: Prisma.Decimal;
  /** İndirimli tedavi toplamı — hastanın ödemesi gereken. */
  netTedavi: Prisma.Decimal;
  /** Aktif tahsilatların toplamı. */
  tahsilatToplam: Prisma.Decimal;
  /** Kalan borç; eksi ise hasta fazla ödemiş (avans). */
  bakiye: Prisma.Decimal;
};

/**
 * Toplamlardan bakiyeyi hesaplar. Adımlar hasta dosyasındaki computeBalance ile
 * aynı sırada: tedavi toplamı → indirimli toplam (kuruşa yuvarlanır) → indirim
 * = fark → bakiye = indirimli toplam − tahsilat.
 */
export function calculateBalance(input: {
  tedaviToplam: MoneyInput;
  indirimOrani?: number | null;
  tahsilatToplam: MoneyInput;
}): BalanceFigures {
  const tedaviToplam = roundKurus(toDecimal(input.tedaviToplam));
  const rate = Number(input.indirimOrani);
  const indirimOrani = Number.isFinite(rate) ? rate : 0;
  const netTedavi = roundKurus(tedaviToplam.mul(HUNDRED.minus(indirimOrani)).div(HUNDRED));
  const tahsilatToplam = roundKurus(toDecimal(input.tahsilatToplam));
  return {
    tedaviToplam,
    indirimOrani,
    indirim: tedaviToplam.minus(netTedavi),
    netTedavi,
    tahsilatToplam,
    bakiye: netTedavi.minus(tahsilatToplam),
  };
}

// ── Veritabanı okumaları ─────────────────────────────────────────────────────

/** Testte sahte istemci verilebilsin diye kullanılan model erişimcileri. */
export type BalanceDb = Pick<PrismaClient, "examination" | "payment" | "patient" | "user" | "taksit">;

export type BalanceScope = {
  /** Oturumun kurumu; null ise (yalnız SUPERADMIN) kurum filtresi uygulanmaz. */
  institutionId: string | null;
  /** Aktif şube; verilmezse kurumun bütün şubeleri. */
  branchId?: string | null;
  /** Yalnız bu hastalar; verilmezse kapsamda tedavisi ya da tahsilatı olan herkes. */
  patientIds?: readonly string[];
};

function scopeWhere(scope: BalanceScope) {
  return {
    ...(scope.institutionId ? { institutionId: scope.institutionId } : {}),
    ...(scope.branchId ? { branchId: scope.branchId } : {}),
  };
}

/**
 * İstenen hasta kimlikleri. `all` ise kapsamın tamamı okunur (kimlik verilmedi
 * ya da liste çok uzun); `ids` yine de sonucu süzmek için döner.
 */
function resolveIds(patientIds: readonly string[] | undefined) {
  if (!patientIds) return { ids: null, filter: null } as const;
  const ids = [...new Set(patientIds.filter((id) => typeof id === "string" && id.length > 0))];
  return { ids, filter: ids.length > LARGE_ID_LIST ? null : ids } as const;
}

export type BalanceTotals = {
  tedaviToplam: Prisma.Decimal;
  tahsilatToplam: Prisma.Decimal;
  /** Son aktif tahsilatın tarihi (aynı gruplamadan, ek sorgu yok). */
  lastPaymentAt: Date | null;
};

/**
 * Hasta başına ücrete yansıyan tedavi toplamı ve aktif tahsilat toplamı —
 * veritabanında gruplanır (satırlar belleğe çekilmez).
 */
export async function loadBalanceTotals(scope: BalanceScope, db: BalanceDb = prisma): Promise<Map<string, BalanceTotals>> {
  const { ids, filter } = resolveIds(scope.patientIds);
  const totals = new Map<string, BalanceTotals>();
  if (ids && ids.length === 0) return totals;

  const where = scopeWhere(scope);
  const [charged, paid] = await Promise.all([
    db.examination.groupBy({
      by: ["patientId"],
      where: { ...where, ...(filter ? { patientId: { in: filter } } : {}), ...CHARGEABLE_EXAMINATION_WHERE },
      _sum: { amount: true },
    }),
    db.payment.groupBy({
      by: ["patientId"],
      where: { ...where, status: "ACTIVE", patientId: filter ? { in: filter } : { not: null } },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
  ]);

  const wanted = ids ? new Set(ids) : null;
  const entry = (patientId: string) => {
    let current = totals.get(patientId);
    if (!current) {
      current = { tedaviToplam: ZERO, tahsilatToplam: ZERO, lastPaymentAt: null };
      totals.set(patientId, current);
    }
    return current;
  };
  for (const row of charged) {
    if (wanted && !wanted.has(row.patientId)) continue;
    entry(row.patientId).tedaviToplam = toDecimal(row._sum.amount);
  }
  for (const row of paid) {
    if (!row.patientId || (wanted && !wanted.has(row.patientId))) continue;
    const current = entry(row.patientId);
    current.tahsilatToplam = toDecimal(row._sum.amount);
    current.lastPaymentAt = row._max.createdAt ?? null;
  }
  return totals;
}

export type PatientBalance = BalanceFigures & {
  patientId: string;
  lastPaymentAt: Date | null;
};

/**
 * Hastaların bakiyesi (tek kaynak). `patientIds` verilirse istenen her hasta
 * için (hiç kaydı olmasa da sıfır bakiyeyle) sonuç döner; verilmezse kapsamda
 * tedavisi ya da tahsilatı olan herkes için.
 *
 * `discountRates`: çağıranın zaten okuduğu indirim oranları — bu hastalar için
 * ayrıca hasta tablosu okunmaz. Oranı bilinmeyenler için yalnız indirimi
 * sıfırdan büyük hastalar okunur (çoğu hastanın indirimi yoktur).
 */
export async function computePatientBalances(
  scope: BalanceScope & { discountRates?: ReadonlyMap<string, number | null | undefined> },
  db: BalanceDb = prisma,
): Promise<Map<string, PatientBalance>> {
  const { ids, filter } = resolveIds(scope.patientIds);
  const result = new Map<string, PatientBalance>();
  if (ids && ids.length === 0) return result;

  // Yalnız gerçekten sayı olan oranlar "bilinen" sayılır; eksik oran 0 varsayılmaz, okunur.
  const known = new Map<string, number>();
  for (const [id, rate] of scope.discountRates ?? []) {
    if (typeof rate === "number" && Number.isFinite(rate)) known.set(id, rate);
  }
  const ratesToRead = filter ? filter.filter((id) => !known.has(id)) : null;
  const [totals, discounted] = await Promise.all([
    loadBalanceTotals({ institutionId: scope.institutionId, branchId: scope.branchId, patientIds: ids ?? undefined }, db),
    ratesToRead && ratesToRead.length === 0
      ? Promise.resolve([] as Array<{ id: string; discountRate: number }>)
      : db.patient.findMany({
          where: {
            ...(scope.institutionId ? { institutionId: scope.institutionId } : {}),
            discountRate: { gt: 0 },
            ...(ratesToRead
              ? { id: { in: ratesToRead } }
              : scope.branchId ? { homeBranchId: scope.branchId } : {}),
          },
          select: { id: true, discountRate: true },
        }),
  ]);

  const rates = new Map<string, number>(known);
  for (const row of discounted) {
    if (!known.has(row.id)) rates.set(row.id, row.discountRate);
  }

  for (const patientId of ids ?? totals.keys()) {
    const total = totals.get(patientId);
    result.set(patientId, {
      patientId,
      lastPaymentAt: total?.lastPaymentAt ?? null,
      ...calculateBalance({
        tedaviToplam: total?.tedaviToplam,
        indirimOrani: rates.get(patientId) ?? 0,
        tahsilatToplam: total?.tahsilatToplam,
      }),
    });
  }
  return result;
}

export type TreatmentDoctorSummary = {
  /** Hastayı tedavi eden hekimler; en son tedavi edenden başlayarak. */
  doctors: Array<{ id: string; fullName: string }>;
  /** Son (ücrete yansıyan) tedaviyi yapan hekim — tahsilat formunun hekim önerisi. */
  lastDoctorId: string | null;
  lastTreatmentAt: Date | null;
};

/**
 * Hasta başına tedavi eden hekimler ve son tedavi. Bakiyeyle aynı kural:
 * iptal edilen ya da henüz yapılmamış tedavinin hekimi önerilmez.
 * (patientId, doctorId) ikilisi veritabanında gruplanır; önceden bellek içi
 * `distinct` ile şubenin bütün tedavi satırları iki kez okunuyordu.
 */
export async function loadTreatmentDoctors(scope: BalanceScope, db: BalanceDb = prisma): Promise<Map<string, TreatmentDoctorSummary>> {
  const { ids, filter } = resolveIds(scope.patientIds);
  const result = new Map<string, TreatmentDoctorSummary>();
  if (ids && ids.length === 0) return result;

  const groups = await db.examination.groupBy({
    by: ["patientId", "doctorId"],
    where: { ...scopeWhere(scope), ...(filter ? { patientId: { in: filter } } : {}), ...CHARGEABLE_EXAMINATION_WHERE },
    _max: { diagnosedAt: true },
  });
  const wanted = ids ? new Set(ids) : null;
  const relevant = wanted ? groups.filter((group) => wanted.has(group.patientId)) : groups;

  const doctorIds = [...new Set(relevant.map((group) => group.doctorId).filter(Boolean))];
  const users = doctorIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: doctorIds }, ...(scope.institutionId ? { institutionId: scope.institutionId } : {}) },
        select: { id: true, fullName: true },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.fullName]));

  const byPatient = new Map<string, Array<{ doctorId: string; at: Date | null }>>();
  for (const group of relevant) {
    const list = byPatient.get(group.patientId) || [];
    list.push({ doctorId: group.doctorId, at: group._max.diagnosedAt ?? null });
    byPatient.set(group.patientId, list);
  }
  for (const [patientId, list] of byPatient) {
    list.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.doctorId.localeCompare(b.doctorId));
    result.set(patientId, {
      doctors: list
        .filter((item) => Boolean(names.get(item.doctorId)))
        .map((item) => ({ id: item.doctorId, fullName: names.get(item.doctorId) as string })),
      lastDoctorId: list[0]?.doctorId ?? null,
      lastTreatmentAt: list[0]?.at ?? null,
    });
  }
  return result;
}

export type OpenInstallmentSummary = {
  /** Açık taksitlerin toplam kalanı (bakiyenin bir parçasıdır, ayrıca borç değildir). */
  kalan: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  overdueCount: number;
  /** En yakın vadeli taksidin planının hekimi — tahsilat taksitten ancak bu hekimle düşer. */
  doctorId: string | null;
  planCount: number;
};

/**
 * Açık (aktif / devam eden) taksit planlarının hasta başına özeti: toplam
 * kalan, en yakın vade ve tutarı, gecikmiş taksit sayısı, planın hekimi.
 * Yalnız ödenmemiş taksitler okunur (geçmiş taksitler değil).
 */
export async function loadOpenInstallmentSummaries(scope: BalanceScope, db: BalanceDb = prisma): Promise<Map<string, OpenInstallmentSummary>> {
  const { ids, filter } = resolveIds(scope.patientIds);
  const result = new Map<string, OpenInstallmentSummary>();
  if (ids && ids.length === 0) return result;

  const rows = await db.taksit.findMany({
    where: {
      ...scopeWhere(scope),
      status: { in: ["BEKLIYOR", "GECIKTI"] },
      kalan: { gt: 0 },
      plan: {
        status: { in: ["AKTIF", "DEVAM_EDIYOR"] },
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        ...(filter ? { patientId: { in: filter } } : {}),
      },
    },
    select: { kalan: true, vadeDate: true, status: true, plan: { select: { id: true, patientId: true, doctorId: true } } },
    orderBy: { vadeDate: "asc" },
  });

  const wanted = ids ? new Set(ids) : null;
  // Vadesi geçmiş BEKLIYOR taksit, gecikme taraması çalışmadan da gecikmiş sayılır.
  const todayStart = turkeyTodayStartUtc();
  const work = new Map<string, { kalan: Prisma.Decimal; nextDueDate: Date | null; nextDueAmount: Prisma.Decimal; overdueCount: number; doctorId: string | null; planIds: Set<string> }>();
  for (const item of rows) {
    const patientId = item.plan.patientId;
    if (wanted && !wanted.has(patientId)) continue;
    let summary = work.get(patientId);
    if (!summary) {
      // Satırlar vadeye göre sıralı: hastanın ilk satırı en yakın vadeli taksittir.
      summary = { kalan: ZERO, nextDueDate: item.vadeDate, nextDueAmount: toDecimal(item.kalan), overdueCount: 0, doctorId: item.plan.doctorId, planIds: new Set<string>() };
      work.set(patientId, summary);
    }
    summary.kalan = summary.kalan.plus(toDecimal(item.kalan));
    summary.planIds.add(item.plan.id);
    if (item.status === "GECIKTI" || item.vadeDate < todayStart) summary.overdueCount += 1;
  }
  for (const [patientId, summary] of work) {
    result.set(patientId, {
      kalan: moneyToNumber(summary.kalan),
      nextDueDate: summary.nextDueDate ? summary.nextDueDate.toISOString() : null,
      nextDueAmount: moneyToNumber(summary.nextDueAmount),
      overdueCount: summary.overdueCount,
      doctorId: summary.doctorId,
      planCount: summary.planIds.size,
    });
  }
  return result;
}
