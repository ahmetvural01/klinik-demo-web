// Uygulama yalnızca Türkiye'de kullanılıyor: UTC+3, sabit (yaz saati uygulaması yok).
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Türkiye'de "bugünün" başladığı anı UTC Date olarak döner.
 * Tarih-only alanlar (ör. vadeDate) `new Date("2026-07-10")` ile UTC 00:00 olarak
 * saklanır; bunu doğrudan `now`la kıyaslamak, Türkiye saatiyle günün ilk 3 saatinde
 * (00:00–03:00) veya vade gününün tamamında yanlış "gecikti/bugün değil" sonucu üretir.
 */
export function turkeyTodayStartUtc(): Date {
  const nowTurkey = new Date(Date.now() + TURKEY_OFFSET_MS);
  return new Date(Date.UTC(nowTurkey.getUTCFullYear(), nowTurkey.getUTCMonth(), nowTurkey.getUTCDate()) - TURKEY_OFFSET_MS);
}

/** Verilen anın Türkiye takviminde hangi güne denk geldiğini "YYYY-MM-DD" olarak döner. */
export function turkeyDateKey(date: Date = new Date()): string {
  const t = new Date(date.getTime() + TURKEY_OFFSET_MS);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "YYYY-MM-DD" bir Türkiye takvim gününün [00:00, 23:59:59.999] Türkiye yerel saat
 * aralığını UTC Date olarak döner. `new Date(dateStr + "T00:00:00.000Z")` kullanmak
 * bu aralığı 3 saat kaydırır (00:00-03:00 Türkiye saatindeki randevular yanlış güne düşer).
 */
export function turkeyDayRangeUtc(dateStr: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - TURKEY_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/** Verilen anın Türkiye saatinde "HH:mm" karşılığını döner (DoctorBlock.startTime/endTime ile aynı biçim). */
export function turkeyTimeKey(date: Date): string {
  const t = new Date(date.getTime() + TURKEY_OFFSET_MS);
  const h = String(t.getUTCHours()).padStart(2, "0");
  const m = String(t.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Türkiye yerel tarih/saat alanlarını UTC Date nesnesine dönüştürür. */
export function turkeyLocalDateTimeToUtc(dateKey: string, timeKey: string): Date {
  const localAsUtc = new Date(`${dateKey}T${timeKey}:00.000Z`);
  return new Date(localAsUtc.getTime() - TURKEY_OFFSET_MS);
}

/**
 * Bir Türkiye takvim ayının [1. gün 00:00, son gün 23:59:59.999] Türkiye
 * yerel saat aralığını UTC Date olarak döner. Hakediş hesaplamaları (bkz.
 * src/lib/hakedis.ts) önceden bunun yerine `Date.UTC(year, month-1, 1)` gibi
 * doğrudan UTC ay sınırları kullanıyordu — Türkiye saatiyle 00:00-02:59
 * arasındaki bir işlem (ör. ayın ilk günü gece yarısından hemen sonra
 * girilen bir ödeme) yanlış aya (bir önceki aya) sayılıyordu.
 */
export function turkeyMonthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const endKey = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  return { start: turkeyDayRangeUtc(startKey).start, end: turkeyDayRangeUtc(endKey).end };
}

/**
 * Bir anın Türkiye takviminde "N gün önce"sinin gün başlangıcını (Türkiye
 * yerel 00:00, UTC Date olarak) döner. Randevu hatırlatmaları için kullanılır
 * — `date.setDate(date.getDate() - 1)` gibi yerel/sunucu saat dilimine bağlı
 * Date metotları, sunucu UTC'de çalışırken 00:00-02:59 Türkiye saatindeki
 * randevularda bir gün kayması yaratıyordu (bkz. denetim raporu).
 */
export function turkeyDayBeforeStartUtc(date: Date, daysBefore = 1): Date {
  const dateKey = turkeyDateKey(date);
  const shifted = new Date(`${dateKey}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() - daysBefore);
  const prevDateKey = shifted.toISOString().slice(0, 10);
  return turkeyDayRangeUtc(prevDateKey).start;
}
