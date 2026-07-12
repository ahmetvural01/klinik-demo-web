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
