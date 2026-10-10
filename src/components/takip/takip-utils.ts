import { addDaysToDateKey } from "@/components/ui/QuickDatePicker";
import { openDayKeys } from "@/components/randevu/appointment-utils";
import { cachedGet } from "@/lib/client-cache";
import { turkeyDateKey, turkeyLocalDateTimeToUtc, turkeyTimeKey } from "@/lib/tz";
import type { DaySchedule } from "@/lib/working-hours-core";

// Hasta aramaları ve ekip görevleri formlarının ortak tarih/saat ve istek
// yardımcıları. Tarihler Türkiye takvimine göre ("YYYY-MM-DD" + "HH:mm").

/**
 * İşlem anahtarı (Idempotency-Key). `crypto.randomUUID` güvenli olmayan
 * bağlamda (yerel ağda http) yoktur; önceden görev formu orada TypeError
 * fırlatıp kullanıcıya yanıltıcı "Bağlantı kurulamadı" gösteriyordu.
 */
export function newIdempotencyKey(prefix = "task") {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

export type DateTimeParts = { date: string; time: string };

/** Kayıtlı anı Türkiye yerel gün + saat parçalarına ayırır. */
export function splitIsoToParts(iso?: string | null): DateTimeParts {
  if (!iso) return { date: "", time: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return { date: turkeyDateKey(date), time: turkeyTimeKey(date) };
}

/** Gün + saat parçalarını UTC ISO metnine çevirir; gün yoksa null. */
export function partsToIso(parts: DateTimeParts, fallbackTime = "10:00"): string | null {
  if (!parts.date) return null;
  const time = /^\d{2}:\d{2}$/.test(parts.time) ? parts.time : fallbackTime;
  return turkeyLocalDateTimeToUtc(parts.date, time).toISOString();
}

function nextFullHour(now: Date, cap: number) {
  const [hour] = turkeyTimeKey(now).split(":").map(Number);
  return `${String(Math.min(cap, hour + 1)).padStart(2, "0")}:00`;
}

/**
 * Hasta araması için varsayılan saat: ileri günlerde mesai başı (10:00),
 * bugün için bir sonraki tam saat. Önceden varsayılan gece yarısıydı
 * ("Yarın 00:00"; canlı test H3).
 */
export function defaultCallTime(dateKey: string, now: Date = new Date()) {
  if (!dateKey) return "";
  const today = turkeyDateKey(now);
  if (dateKey > today) return "10:00";
  const [hour] = turkeyTimeKey(now).split(":").map(Number);
  if (hour < 9) return "10:00";
  return nextFullHour(now, 21);
}

/**
 * Görev son tarihi için varsayılan saat: gün sonu (18:00). Bugün 17:00'den
 * sonra seçilirse bir sonraki tam saat (geçmiş saat seçilip "Son tarih
 * geçmişte olamaz" hatası alınmasın).
 */
export function defaultDueTime(dateKey: string, now: Date = new Date()) {
  if (!dateKey) return "";
  const today = turkeyDateKey(now);
  if (dateKey > today) return "18:00";
  const [hour] = turkeyTimeKey(now).split(":").map(Number);
  if (hour < 17) return "18:00";
  if (hour >= 23) return "23:59";
  return nextFullHour(now, 23);
}

/**
 * Bugünden `days` gün sonrası, verilen saatte (ISO). Kurumun çalışma takvimi
 * verilirse kapalı gün (ör. Pazar) atlanır ve ilk açık güne kaydırılır;
 * önceden "Ulaşılamadı" sonrası arama Pazar'a düşebiliyordu.
 */
export function isoDaysFromToday(days: number, time: string, now: Date = new Date(), dailySchedules?: DaySchedule[] | null) {
  return turkeyLocalDateTimeToUtc(openDateKeyFromToday(days, dailySchedules, now), time).toISOString();
}

/** Bugünden `days` gün sonraki gün; takvim verilirse ondan sonraki ilk açık gün ("YYYY-MM-DD"). */
export function openDateKeyFromToday(days: number, dailySchedules?: DaySchedule[] | null, now: Date = new Date()) {
  const target = addDaysToDateKey(turkeyDateKey(now), days);
  if (!target || !dailySchedules?.length) return target;
  return openDayKeys(dailySchedules, target, 1)[0] || target;
}

/**
 * Kurumun haftalık çalışma takvimi (randevu ekranıyla aynı önbellekli uç).
 * Okunamazsa (yetki/bağlantı) null: tarih önerileri gün atlamadan kalır.
 */
export function loadClinicSchedules(): Promise<DaySchedule[] | null> {
  return cachedGet<{ dailySchedules?: DaySchedule[] }>("/api/appointments/calendar-settings", 60_000, { throwOnError: true })
    .then((settings) => (Array.isArray(settings?.dailySchedules) && settings.dailySchedules.length > 0 ? settings.dailySchedules : null))
    .catch(() => null);
}

/**
 * Telefonla arama: yazılan rakamlar numaranın içinde aranır. Baştaki "0"
 * yalnız tam numara yazıldıysa (santral öneki) atlanır; önceden "000 00 05"
 * gibi kısmi aramada tüm sıfırlar silinip "5" kalıyor, hiçbir şey bulunmuyordu
 * (canlı test H11).
 */
export function phoneMatches(phone: string | null | undefined, query: string) {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 3 || !phone) return false;
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.includes(digits)) return true;
  return digits.length >= 10 && digits.startsWith("0") && phoneDigits.includes(digits.slice(1));
}
