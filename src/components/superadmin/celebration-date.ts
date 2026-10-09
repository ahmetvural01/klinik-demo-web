/**
 * Kutlama günlerinin "sonraki gönderim" tarihini ekranda göstermek için.
 * Gönderim kuralı sunucuda src/lib/celebration-days.ts isCelebrationDate ile
 * aynıdır: FIXED (her yıl aynı gün), NTH_WEEKDAY (ayın n. haftasının günü),
 * DATE_OVERRIDES (yıla göre tarih listesi, ör. dini bayramlar). Önceden liste
 * yalnız ay/gün alanını gösterdiği için Ramazan Bayramı "01.01" görünüyordu.
 */
export type CelebrationRule = "FIXED" | "NTH_WEEKDAY" | "DATE_OVERRIDES";

export type CelebrationSchedule = {
  month: number;
  day: number;
  recurrenceRule: string;
  weekOfMonth: number | null;
  weekday: number | null;
  dateOverrides: string[];
};

export const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/** JS getDay sırasıyla (0 = Pazar). */
export const WEEKDAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const RULE_LABELS: Record<CelebrationRule, string> = {
  FIXED: "Her yıl aynı gün",
  NTH_WEEKDAY: "Ayın belirli haftası",
  DATE_OVERRIDES: "Yıla göre tarih listesi",
};

function todayParts(now: Date) {
  const t = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function key(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nthWeekday(year: number, month: number, week: number, weekday: number): number | null {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (week - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay ? day : null;
}

/** Bugün veya sonrasındaki ilk gönderim günü ("YYYY-MM-DD"); bulunamazsa null. */
export function nextCelebrationDate(schedule: CelebrationSchedule, now: Date = new Date()): string | null {
  const today = todayParts(now);
  const todayKey = key(today.y, today.m, today.d);
  if (schedule.recurrenceRule === "DATE_OVERRIDES") {
    return [...schedule.dateOverrides].sort().find((value) => value >= todayKey) ?? null;
  }
  for (let year = today.y; year <= today.y + 4; year += 1) {
    let day: number | null = schedule.day;
    if (schedule.recurrenceRule === "NTH_WEEKDAY") {
      day = nthWeekday(year, schedule.month, schedule.weekOfMonth ?? 1, schedule.weekday ?? 0);
    } else if (schedule.month === 2 && schedule.day === 29) {
      const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
      if (!leap) day = null;
    }
    if (day == null) continue;
    const candidate = key(year, schedule.month, day);
    if (candidate >= todayKey) return candidate;
  }
  return null;
}

export function formatDateKey(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** "14 Mart", "Mayıs ayının 2. Pazarı", "Yıla göre (5 tarih)". */
export function describeSchedule(schedule: CelebrationSchedule): string {
  if (schedule.recurrenceRule === "NTH_WEEKDAY") {
    return `${MONTH_NAMES[schedule.month - 1]} ayının ${schedule.weekOfMonth ?? 1}. ${WEEKDAY_NAMES[schedule.weekday ?? 0]} günü`;
  }
  if (schedule.recurrenceRule === "DATE_OVERRIDES") {
    return `Yıla göre tarih listesi (${schedule.dateOverrides.length} tarih)`;
  }
  return `Her yıl ${schedule.day} ${MONTH_NAMES[schedule.month - 1]}`;
}

/** "20.03.2026" veya "2026-03-20" satırlarını "YYYY-MM-DD" listesine çevirir; hatalı satırları ayrıca döndürür. */
export function parseDateList(text: string): { dates: string[]; invalid: string[] } {
  const dates: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    let y: number | undefined;
    let m: number | undefined;
    let d: number | undefined;
    const tr = line.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    const iso = line.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (tr) [d, m, y] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
    else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) {
      invalid.push(line);
      continue;
    }
    dates.push(key(y, m, d));
  }
  return { dates: [...new Set(dates)].sort(), invalid };
}

export function toTrDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}
