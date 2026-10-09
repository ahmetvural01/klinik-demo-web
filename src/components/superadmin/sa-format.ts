import { formatCurrency } from "@/lib/format";

/**
 * Platform yönetimi ekranlarının TEK biçim kaynağı. Önceden her sayfa kendi
 * para/tarih biçimini yazıyordu (₺ + toLocaleString, 0 ve 2 ondalık, Decimal
 * metne uygulanan biçimlendirme yüzünden "24739" gibi ₺'siz tutarlar).
 * Prisma Decimal alanları API'den metin olarak geldiği için önce sayıya
 * çevrilir, sonra ortak formatCurrency kullanılır.
 */
export function money(value: number | string | null | undefined): string {
  const amount = Number(value);
  return formatCurrency(Number.isFinite(amount) ? amount : 0);
}

export function count(value: number | string | null | undefined): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("tr-TR");
}

/** "09.10.2026" — boş/geçersiz değerde null döner (ekranda EmptyValue gösterilir). */
export function shortDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}

/** "09.10.2026 14:30" */
export function dateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Bugünden hedef tarihe kalan tam gün (geçmişse negatif). */
export function daysUntil(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

/** Bugünün Türkiye takvimindeki tarihi (YYYY-MM-DD) — tarih alanlarının varsayılanı. */
export function todayKey(offsetDays = 0): string {
  const base = new Date(Date.now() + 3 * 60 * 60 * 1000 + offsetDays * 86_400_000);
  return base.toISOString().slice(0, 10);
}

/** Bir SMS paketinde SMS başına fiyat: "0,193 ₺". */
export function unitPrice(price: number | string, smsCount: number): string {
  const p = Number(price);
  if (!Number.isFinite(p) || !smsCount) return "—";
  return `${(p / smsCount).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ₺`;
}

/** TC kimlik numarasını ekranda maskeler: "•••••••1234". */
export function maskIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `${"•".repeat(Math.max(0, value.length - 4))}${tail}`;
}
