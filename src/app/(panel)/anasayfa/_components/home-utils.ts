import { turkeyDateKey, turkeyTodayStartUtc } from "@/lib/tz";

// Ana sayfanın tarih yardımcıları. "Bugün" her zaman Türkiye takvimiyle
// hesaplanır ve YALNIZ tarayıcıda (effect içinde) üretilir: sunucu UTC'de
// çalıştığı için render sırasında hesaplanan tarih 00:00–03:00 arasında bir
// gün geride kalıyor, React #418 hidrasyon hatası veriyordu.

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function parseKey(dateKey: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Türkiye takvimine göre bugün, "YYYY-MM-DD". */
export function todayKeyTR(): string {
  return turkeyDateKey();
}

/** "Cumartesi, 10 Ekim 2026" — gün adı takvim gününden (saat diliminden bağımsız). */
export function dayLabelOf(dateKey: string): string {
  const parts = parseKey(dateKey);
  if (!parts) return "";
  const [year, month, day] = parts;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${DAYS[weekday]}, ${day} ${MONTHS[month - 1]} ${year}`;
}

/** "YYYY-MM-DD" + gün → "YYYY-MM-DD" (saat dilimi kaymasız). */
export function shiftDateKey(dateKey: string, days: number): string {
  const parts = parseKey(dateKey);
  if (!parts) return dateKey;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Türkiye'de bir sonraki gece yarısına kalan süre (ms) — sayfa açık kalırsa gün değişince yenilenir. */
export function msUntilNextTurkeyMidnight(): number {
  return Math.max(1_000, turkeyTodayStartUtc().getTime() + 24 * 60 * 60 * 1000 - Date.now());
}

const TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

/** Mesaj zamanı: "14:05" (bugün) · "Dün 14:05" · "9 Eki 14:05". */
export function messageTimeLabel(iso: string, todayKey: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const key = turkeyDateKey(date);
  const time = TIME.format(date);
  if (key === todayKey) return time;
  if (key === shiftDateKey(todayKey, -1)) return `Dün ${time}`;
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]} ${time}`;
}

/** Kısa gün: "9 Eki" (yıl farklıysa "9 Eki 2025"). */
export function shortDayLabel(iso: string, todayKey: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const [year, month, day] = turkeyDateKey(date).split("-").map(Number);
  const currentYear = Number(todayKey.slice(0, 4));
  return `${day} ${MONTHS_SHORT[month - 1]}${year === currentYear ? "" : ` ${year}`}`;
}
