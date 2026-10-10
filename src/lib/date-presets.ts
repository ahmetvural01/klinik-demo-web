import { isValidDateKey, turkeyDateKey } from "@/lib/tz";

/**
 * Dönem / tarih aralığı seçiminin TEK kaynağı. Önceden Raporlar, İşlem
 * Kayıtları, Muhasebe › Defter, İletişim › Gönderim geçmişi ve süperadmin
 * raporları aynı işi beş ayrı biçimde yazıyordu: farklı seçenek adları,
 * "Bu hafta"nın iki ayrı hesabı, ham ISO tarihli filtre etiketi. Burada
 * hepsi Türkiye takvimine göre ("bugün" sunucu/tarayıcı saat diliminden
 * bağımsız, bkz. lib/tz.ts) ve aynı adlarla hesaplanır.
 *
 * Tarihler "YYYY-MM-DD" biçimindedir ve iki uç da DAHİLDİR
 * ({ from: "2026-10-01", to: "2026-10-10" } = 1 Ekim 00:00 – 10 Ekim 23:59).
 * Sunucuda UTC sınırına çevirmek için `turkeyDayRangeUtc(from).start` /
 * `turkeyDayRangeUtc(to).end` kullanın.
 */

export type DatePresetKey =
  | "bugun"
  | "dun"
  | "hafta"
  | "ay"
  | "gecen-ay"
  | "3ay"
  | "yil"
  | "7"
  | "30"
  | "90"
  | "tum"
  | "ozel";

/** Gün aralığı; iki uç dahil, "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

/** Seçici değeri: hazır dönem ya da ("ozel" iken) elle girilen iki tarih. */
export type DateRangeValue = { preset: DatePresetKey; from?: string; to?: string };

export const DATE_PRESET_KEYS: readonly DatePresetKey[] = ["bugun", "dun", "hafta", "ay", "gecen-ay", "3ay", "yil", "7", "30", "90", "tum", "ozel"];

export const DATE_PRESET_LABELS: Record<DatePresetKey, string> = {
  bugun: "Bugün",
  dun: "Dün",
  hafta: "Bu hafta",
  ay: "Bu ay",
  "gecen-ay": "Geçen ay",
  "3ay": "Son 3 ay",
  yil: "Bu yıl",
  "7": "Son 7 gün",
  "30": "Son 30 gün",
  "90": "Son 90 gün",
  tum: "Tüm zamanlar",
  ozel: "Tarih aralığı seç",
};

/**
 * Ekranların kullanacağı hazır setler — her ekran kendi listesini uydurmasın.
 * - takvim: finans ve rapor ekranları (ay/hafta gibi takvim dönemleri).
 * - gecmis: kayıt/geçmiş listeleri (bugünden geriye kayan pencere).
 * Gerekirse set kısaltılabilir ama aynı ad farklı anlamda kullanılmaz.
 */
export const DATE_PRESET_SETS = {
  takvim: ["bugun", "dun", "hafta", "ay", "gecen-ay", "yil", "ozel"],
  gecmis: ["bugun", "7", "30", "90", "ozel"],
} as const satisfies Record<string, readonly DatePresetKey[]>;

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function isDatePresetKey(value: string | null | undefined): value is DatePresetKey {
  return Boolean(value) && (DATE_PRESET_KEYS as readonly string[]).includes(value as string);
}

/** Türkiye takviminde bugün ("YYYY-MM-DD"). */
export function todayKey(now: Date = new Date()): string {
  return turkeyDateKey(now);
}

/** Takvim gününe gün ekler/çıkarır. Öğlen UTC üzerinden hesaplanır; saat dilimi kaydırmaz. */
export function addDaysToKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStartKey(year: number, month: number): string {
  // month 1-12 dışına taşabilir (ör. 0 → geçen yılın Aralık'ı).
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  return date.toISOString().slice(0, 10);
}

/**
 * Hazır dönemin gün aralığı (Türkiye takvimi). "tum" için null (tarih
 * filtresi yok); "ozel" için yalnız geçerli ve sıralı bir aralık döner,
 * eksik/ters aralıkta null — istek atmadan önce `validateRange` hatasını gösterin.
 * - hafta: pazartesiden bugüne · ay: ayın 1'inden bugüne · gecen-ay: geçen ayın tamamı
 * - 3ay: iki ay önceki ayın 1'inden bugüne (ör. 10 Eki → 1 Ağu–10 Eki); "90" ile karışmaz
 * - 7/30/90: bugün dahil son N gün
 */
export function presetRange(key: DatePresetKey, custom?: Partial<DateRange> | null, now: Date = new Date()): DateRange | null {
  const today = turkeyDateKey(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (key) {
    case "bugun":
      return { from: today, to: today };
    case "dun": {
      const yesterday = addDaysToKey(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "hafta": {
      // Haftanın ilk günü pazartesi (lib/report-date-range.ts ile aynı).
      const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay() || 7;
      return { from: addDaysToKey(today, 1 - weekday), to: today };
    }
    case "ay":
      return { from: monthStartKey(year, month), to: today };
    case "gecen-ay": {
      const lastOfPrevious = addDaysToKey(monthStartKey(year, month), -1);
      return { from: `${lastOfPrevious.slice(0, 7)}-01`, to: lastOfPrevious };
    }
    case "3ay":
      return { from: monthStartKey(year, month - 2), to: today };
    case "yil":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "7":
      return { from: addDaysToKey(today, -6), to: today };
    case "30":
      return { from: addDaysToKey(today, -29), to: today };
    case "90":
      return { from: addDaysToKey(today, -89), to: today };
    case "tum":
      return null;
    case "ozel": {
      const from = custom?.from || "";
      const to = custom?.to || "";
      return isValidDateKey(from) && isValidDateKey(to) && from <= to ? { from, to } : null;
    }
    default:
      return null;
  }
}

/** Aralıktaki gün sayısı (iki uç dahil). */
export function rangeDayCount(range: DateRange): number {
  const start = Date.parse(`${range.from}T12:00:00.000Z`);
  const end = Date.parse(`${range.to}T12:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

function dayParts(key: string) {
  return { day: Number(key.slice(8, 10)), month: MONTHS_SHORT[Number(key.slice(5, 7)) - 1] || "", year: key.slice(0, 4) };
}

/** Tek gün: "10 Eki 2026". */
export function formatDayLabel(key: string): string {
  if (!isValidDateKey(key)) return "";
  const { day, month, year } = dayParts(key);
  return `${day} ${month} ${year}`;
}

/**
 * Kısa aralık yazımı — filtre etiketi, alt başlık, dışa aktarım adı için:
 * "10 Eki 2026" · "1–10 Eki 2026" · "28 Eyl – 10 Eki 2026" · "28 Ara 2025 – 3 Oca 2026".
 */
export function formatRangeLabel(range: DateRange | null | undefined): string {
  if (!range || !isValidDateKey(range.from) || !isValidDateKey(range.to)) return "";
  const a = dayParts(range.from);
  const b = dayParts(range.to);
  if (range.from === range.to) return `${a.day} ${a.month} ${a.year}`;
  if (a.year === b.year && a.month === b.month) return `${a.day}–${b.day} ${b.month} ${b.year}`;
  if (a.year === b.year) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
}

/** Seçimin kısa adı (aktif filtre etiketi): "Son 7 gün" ya da özel aralıkta "1–10 Eki 2026". */
export function describeDateRange(value: DateRangeValue): string {
  if (value.preset !== "ozel") return DATE_PRESET_LABELS[value.preset];
  return formatRangeLabel(presetRange("ozel", value)) || "Tarih aralığı";
}

export type RangeLimits = {
  /** En erken başlangıç ("YYYY-MM-DD"). */
  min?: string;
  /** En geç bitiş ("YYYY-MM-DD"). Verilmezse ve `allowFuture` yoksa bugün. */
  max?: string;
  /** Bitiş bugünden sonra olabilsin (ileri tarihli listeler için). */
  allowFuture?: boolean;
  /** En uzun aralık (gün) — sunucunun sınırı varsa. */
  maxDays?: number;
};

/** Elle girilen aralıkta kabul edilen en erken gün (yazım sırasındaki ara yıllar hata sayılır). */
const DATE_FLOOR = "1900-01-01";

/** Sınırlar uygulanmış en geç bitiş günü (yoksa null). */
export function effectiveMaxKey(limits: RangeLimits = {}, now: Date = new Date()): string | null {
  if (limits.max) return limits.max;
  return limits.allowFuture ? null : turkeyDateKey(now);
}

/**
 * Elle girilen aralığın hatası; geçerliyse null. Metinler alanın altında
 * gösterilir (FormField/DateRangeFilter) ve hata varken istek atılmaz.
 */
export function validateRange(range: Partial<DateRange> | null | undefined, limits: RangeLimits = {}, now: Date = new Date()): string | null {
  const from = range?.from || "";
  const to = range?.to || "";
  if (!from || !to) return "Başlangıç ve bitiş tarihini seçin.";
  if (!isValidDateKey(from)) return "Başlangıç tarihi geçerli değil.";
  if (!isValidDateKey(to)) return "Bitiş tarihi geçerli değil.";
  // Tarih kutusunda yıl elle yazılırken her rakamda değer gelir (0002 → 0020 →
  // 0202 → 2026); "0202" geçerli sayılsaydı ~1800 yıllık ağır bir istek atılırdı.
  if (from < DATE_FLOOR) return "Başlangıç tarihi geçerli değil.";
  if (to < DATE_FLOOR) return "Bitiş tarihi geçerli değil.";
  if (from > to) return "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
  const max = effectiveMaxKey(limits, now);
  if (max && to > max) {
    return max === turkeyDateKey(now) ? "Bitiş tarihi bugünden sonra olamaz." : `Bitiş tarihi en geç ${formatDayLabel(max)} olabilir.`;
  }
  if (limits.min && from < limits.min) return `Başlangıç tarihi en erken ${formatDayLabel(limits.min)} olabilir.`;
  if (limits.maxDays && rangeDayCount({ from, to }) > limits.maxDays) return `En fazla ${limits.maxDays} günlük aralık seçilebilir.`;
  return null;
}

/**
 * Seçimden türeyen durum: kullanılacak aralık ve (özel aralıkta) hata.
 * `range` null ise ya "tum" (tarih filtresi yok) ya da hata vardır —
 * önce `error`'a bakın: hata varken istek atmayın.
 */
export function resolveDateRange(value: DateRangeValue, limits: RangeLimits = {}, now: Date = new Date()): { range: DateRange | null; error: string | null } {
  if (value.preset !== "ozel") return { range: presetRange(value.preset, null, now), error: null };
  const error = validateRange(value, limits, now);
  return { range: error ? null : presetRange("ozel", value, now), error };
}

export type DateRangeParamNames = {
  /** Dönem anahtarı (varsayılan "donem"). */
  param?: string;
  /** Özel aralığın başlangıcı (varsayılan "from"). */
  fromParam?: string;
  /** Özel aralığın bitişi (varsayılan "to"). */
  toParam?: string;
};

/**
 * Adres çubuğundan seçimi okur: `?donem=ay` ya da `?donem=ozel&from=…&to=…`.
 * Eski bağlantılar için `donem` yokken `from`+`to` varsa (ve set "ozel"
 * içeriyorsa) özel aralık sayılır. Geçersiz/sette olmayan değer → fallback.
 */
export function readDateRangeParams(
  params: { get(name: string): string | null },
  presets: readonly DatePresetKey[],
  fallback: DatePresetKey,
  names: DateRangeParamNames = {},
): DateRangeValue {
  const { param = "donem", fromParam = "from", toParam = "to" } = names;
  const raw = params.get(param);
  const from = params.get(fromParam) || "";
  const to = params.get(toParam) || "";
  const preset = isDatePresetKey(raw) && presets.includes(raw)
    ? raw
    : !raw && from && to && presets.includes("ozel") ? "ozel" : fallback;
  return preset === "ozel" ? { preset, from, to } : { preset };
}

/**
 * Seçimi adres parametrelerine yazar (yerinde değiştirir). Varsayılan dönem
 * adresten silinir; özel aralık dışındaki seçimde from/to kaldırılır.
 * Başka sayfaya dönemi taşıyan bağlantı kurarken de kullanılır.
 */
export function writeDateRangeParams(
  params: URLSearchParams,
  value: DateRangeValue,
  fallback: DatePresetKey,
  names: DateRangeParamNames = {},
): URLSearchParams {
  const { param = "donem", fromParam = "from", toParam = "to" } = names;
  if (value.preset === fallback && value.preset !== "ozel") params.delete(param);
  else params.set(param, value.preset);
  if (value.preset === "ozel") {
    if (value.from) params.set(fromParam, value.from);
    else params.delete(fromParam);
    if (value.to) params.set(toParam, value.to);
    else params.delete(toParam);
  } else {
    params.delete(fromParam);
    params.delete(toParam);
  }
  return params;
}
