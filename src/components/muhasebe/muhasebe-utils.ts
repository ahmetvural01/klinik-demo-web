// Muhasebe, Hakediş ve Raporlar ekranlarının ORTAK sözlüğü ve biçimlendirme
// yardımcıları. Önceden her ekran (muhasebe sayfası, hakediş paneli, rapor)
// ödeme yöntemi etiketlerini, tarih/para biçimini ve durum adlarını ayrı ayrı
// yazıyordu; ör. hakediş dökümü "HAVALE" anahtarını aradığı için Havale/EFT
// ödemeleri ekranda ham "HAVALE_EFT" kodu olarak görünüyordu.
import { formatCurrency } from "@/lib/format";
import { stripSystemTags } from "@/lib/format-text";
import { turkeyDateKey } from "@/lib/tz";
import type { BadgeTone } from "@/components/ui/Badge";

export const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi Kartı",
  HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order",
  DIGER: "Diğer",
};

/** Doktor hakedişi ödemeleri yalnız nakit veya havale/EFT ile yapılabilir (sunucu da aynı kuralı uygular). */
export const DOCTOR_PAYOUT_METHODS = ["NAKIT", "HAVALE_EFT"] as const;

const POS_REQUIRED_METHODS = new Set(["KREDI_KARTI", "MAIL_ORDER"]);
export const requiresPos = (method: string) => POS_REQUIRED_METHODS.has(method);

export const methodLabel = (method?: string | null) => (method ? METHOD_LABELS[method] || method : "");

export const KDV_OPTIONS = [
  { value: "0", label: "KDV yok (%0)" },
  { value: "10", label: "%10" },
  { value: "20", label: "%20" },
];

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

/** Açıklamadaki sistem etiketlerini ([SISTEM:...], [GELIR_TURU:...]) kullanıcıdan gizler. */
export const cleanNote = (text?: string | null) => stripSystemTags(text).replace(/\s*\[GELIR_TURU:[^\]]+\]/g, "").trim();

/** Çift tıklama / ağ tekrarı aynı kaydı iki kez oluşturmasın diye her form açılışında yeni işlem anahtarı. */
export function newRequestKey(prefix: string) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Tutar alanı: virgüllü yazımı ("1.250,50") da kabul eder. Geçersizse NaN döner. */
export function parseAmount(raw: string): number {
  const text = raw.trim();
  if (!text) return Number.NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.NaN;
}

/** Sistem tarafından başka bir kayıttan (ör. firma ödemesi) oluşturulmuş gider mi? */
export function isLinkedExpense(expense: { sourceType?: string | null; description?: string | null }) {
  return Boolean(expense.sourceType) || /\[SISTEM:FIRMA_ISLEM:/.test(expense.description || "");
}

export type FinanceDoctor = { id: string; fullName: string; role: string; isActive?: boolean | null; profile?: { hideAsDoctor?: boolean | null } | null };
