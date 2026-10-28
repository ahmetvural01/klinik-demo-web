// Muhasebe, Hakediş ve Raporlar ekranlarının ORTAK sözlüğü ve biçimlendirme
// yardımcıları. Önceden her ekran (muhasebe sayfası, hakediş paneli, rapor)
// ödeme yöntemi etiketlerini, tarih/para biçimini ve durum adlarını ayrı ayrı
// yazıyordu; ör. hakediş dökümü "HAVALE" anahtarını aradığı için Havale/EFT
// ödemeleri ekranda ham "HAVALE_EFT" kodu olarak görünüyordu.
import { formatCurrency } from "@/lib/format";
import { stripSystemTags } from "@/lib/format-text";
import { turkeyDateKey } from "@/lib/tz";
import { parseTurkishMoney } from "@/lib/money-input";
import {
  DOCTOR_PAYOUT_METHODS as SHARED_DOCTOR_PAYOUT_METHODS,
  PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
  requiresPos as sharedRequiresPos,
} from "@/lib/payment-methods";
import type { BadgeTone } from "@/components/ui/Badge";

// Ödeme yöntemi sözlüğü tek kaynaktan (src/lib/payment-methods.ts); buradaki adlar
// eski içe aktarmalar (Raporlar vb.) bozulmasın diye korunur.
export const METHOD_LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS };

/** Doktor hakedişi ödemeleri yalnız nakit veya havale/EFT ile yapılabilir (sunucu da aynı kuralı uygular). */
export const DOCTOR_PAYOUT_METHODS = SHARED_DOCTOR_PAYOUT_METHODS;

export const requiresPos = (method: string) => sharedRequiresPos(method);

export const methodLabel = (method?: string | null) => paymentMethodLabel(method);

export const AY_ADLARI = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
export const monthName = (year: number, month: number) => `${AY_ADLARI[month - 1] || month} ${year}`;

export const PERIODS: Record<string, string> = {
  HAFTALIK: "Haftalık",
  IKIHALFTALIK: "2 haftada bir",
  AYLIK: "Aylık",
  IKIAYLIK: "2 ayda bir",
  UCAYLIK: "3 ayda bir",
  ALTIAYLIK: "6 ayda bir",
  YILLIK: "Yıllık",
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  AKTIF: "Ödeme bekliyor",
  DEVAM_EDIYOR: "Ödeniyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};
export const PLAN_STATUS_TONE: Record<string, BadgeTone> = {
  AKTIF: "info",
  DEVAM_EDIYOR: "warning",
  TAMAMLANDI: "success",
  IPTAL: "neutral",
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  ODENDI: "Ödendi",
  GECIKTI: "Gecikti",
  IPTAL: "İptal edildi",
};
export const INSTALLMENT_STATUS_TONE: Record<string, BadgeTone> = {
  BEKLIYOR: "neutral",
  ODENDI: "success",
  GECIKTI: "critical",
  IPTAL: "neutral",
};

/** Para: 1.234,56 ₺ (bkz. @/lib/format). Sayıya çevrilemeyen değer 0 sayılır. */
export const money = (value: number | string | null | undefined) => formatCurrency(Number(value) || 0);

/** Kısa tarih: 09.10.2026 (Türkiye saatine göre). */
export function shortDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}

export const todayKey = () => turkeyDateKey();

/**
 * Muhasebe araç çubuklarına verilir: ortak Toolbar'daki arama kabı (ilk çocuk)
 * masaüstünde en az bu genişlikte kalır. Kabın tabanı 0 ve min-w-0 olduğu için
 * süzgeçler sığmadığında satır kırılmıyor, arama kutusu seçicilerin altında
 * eziliyordu (özel tarih aralığı, 1280 px'te beş durum düğmesi).
 */
export const FINANCE_TOOLBAR_CLASS = "sm:[&>div:first-child]:min-w-[240px]";

/**
 * Not satırında doktor adı: ad zaten unvanla başlıyorsa ("Dr. Mert Aydın")
 * olduğu gibi, değilse "Dr. " ekiyle. Önceden her zaman ek konduğu için
 * listede "Dr. Dr. Mert Aydın" görünüyordu.
 */
export function doctorLabel(name?: string | null) {
  const text = (name || "").trim();
  if (!text) return "";
  // "Dr. Ad", "Dr Ad" ve boşluksuz "Dr.Ad" unvanlı sayılır; "Drake" gibi adlar sayılmaz.
  return /^(dr|dt|uzm|prof|doç|doc|op)(\.\s*|\s+)/i.test(text) ? text : `Dr. ${text}`;
}

/**
 * Listede her satırda aynı değer mi (sadelik K5): hepsi dolu ve aynıysa o
 * değer, değilse null. Ör. tek doktorlu klinikte her tahsilatın altında
 * "Dr. Ayşe Kaya" tekrar etmez; ad özette bir kez yazılır. Boş değerli bir
 * satır varsa null döner (o satır da aynı kişiye aitmiş gibi görünmesin).
 */
export function sharedValue(values: readonly (string | null | undefined)[]): string | null {
  const first = (values[0] || "").trim();
  if (!first) return null;
  return values.every((value) => (value || "").trim() === first) ? first : null;
}

/** Açıklamadaki sistem etiketlerini ([SISTEM:...], [GELIR_TURU:...]) kullanıcıdan gizler. */
export const cleanNote = (text?: string | null) => stripSystemTags(text).replace(/\s*\[GELIR_TURU:[^\]]+\]/g, "").trim();

/** Çift tıklama / ağ tekrarı aynı kaydı iki kez oluşturmasın diye her form açılışında yeni işlem anahtarı. */
export function newRequestKey(prefix: string) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Tutar alanı (eski ad; yeni formlar MoneyInput + `@/lib/money-input` kullanır).
 * Ortak ayrıştırıcıya bağlıdır: "1.500" = 1500 ("1,50" değil), "1.250,50" = 1250,5.
 * Önceden "1.500" sessizce 1,50 TL okunuyordu. Geçersizse NaN döner.
 */
export function parseAmount(raw: string): number {
  const value = parseTurkishMoney(raw);
  return value === null ? Number.NaN : Number(value);
}

/** Sistem tarafından başka bir kayıttan (ör. firma ödemesi) oluşturulmuş gider mi? */
export function isLinkedExpense(expense: { sourceType?: string | null; description?: string | null }) {
  return Boolean(expense.sourceType) || /\[SISTEM:FIRMA_ISLEM:/.test(expense.description || "");
}

export type FinanceDoctor = { id: string; fullName: string; role: string; isActive?: boolean | null; profile?: { hideAsDoctor?: boolean | null } | null };
