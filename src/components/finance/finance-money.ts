// Finans formlarının kuruş hassasiyetli küçük hesapları. Tutarlar formda
// normalize METİN olarak taşınır ("1250.50", bkz. lib/money-input); toplama,
// çıkarma ve taksitlere bölme burada tam sayı kuruşla yapılır — JS number ile
// para hesabı yapılmaz (0,1 + 0,2 artıkları "0,01 TL borç" bırakmasın).
import { formatCurrency } from "@/lib/format";
import { stripSystemTags } from "@/lib/format-text";
import { toMoneyValue } from "@/lib/money-input";
import { turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";

type MoneyLike = string | number | null | undefined;

/** Normalize tutar → kuruş (BigInt). Çözülemeyen değer null. */
export function toCents(value: MoneyLike): bigint | null {
  const normalized = toMoneyValue(typeof value === "string" ? value.trim() || null : value);
  if (normalized === null) return null;
  return BigInt(normalized.replace(".", ""));
}

/** Kuruş → normalize tutar metni ("1250.50"). */
export function centsToMoney(cents: bigint): string {
  const negative = cents < BigInt(0);
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** a − b (normalize metin). Biri çözülemiyorsa null. */
export function subtractMoney(a: MoneyLike, b: MoneyLike): string | null {
  const left = toCents(a);
  const right = toCents(b);
  if (left === null || right === null) return null;
  return centsToMoney(left - right);
}

/** Tutarların toplamı (çözülemeyenler 0 sayılır). */
export function sumMoney(values: readonly MoneyLike[]): string {
  return centsToMoney(values.reduce<bigint>((sum, value) => sum + (toCents(value) ?? BigInt(0)), BigInt(0)));
}

/**
 * Tutarı `count` eşit taksite böler: her taksit kuruşa yarım-yukarı yuvarlanır,
 * küsurat son taksite eklenir (sunucunun eşit bölme kuralıyla aynı sonuç:
 * 625 / 3 → 208,33 · 208,33 · 208,34).
 */
export function splitMoney(total: MoneyLike, count: number): string[] {
  const cents = toCents(total);
  if (cents === null || !Number.isInteger(count) || count < 1) return [];
  const n = BigInt(count);
  const per = (cents * BigInt(2) + n) / (n * BigInt(2));
  const last = cents - per * (n - BigInt(1));
  return Array.from({ length: count }, (_, index) => centsToMoney(index === count - 1 ? last : per));
}

/** API gövdesi için sayı (sunucu z.coerce.number / Number() ile okur; gövde biçimi değişmesin). */
export function moneyToNumber(value: MoneyLike): number {
  const normalized = toMoneyValue(typeof value === "string" ? value.trim() || null : value);
  return normalized === null ? Number.NaN : Number(normalized);
}

/** Ekranda tutar: "₺1.250,00". Değer yoksa "—". */
export function formatMoney(value: MoneyLike): string {
  const normalized = toMoneyValue(typeof value === "string" ? value.trim() || null : value);
  return normalized === null ? "—" : formatCurrency(Number(normalized));
}

/** Pozitif mi (kuruş > 0)? */
export function isPositiveMoney(value: MoneyLike): boolean {
  const cents = toCents(value);
  return cents !== null && cents > BigInt(0);
}

/** Bugünün Türkiye tarihi ("YYYY-MM-DD"). */
export const todayDateKey = () => turkeyDateKey();

/** Çift tıklama / ağ tekrarı aynı kaydı iki kez oluşturmasın: her form açılışında yeni işlem anahtarı. */
export function newRequestKey(prefix: string) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Kayıt isteği başarısız olduğunda gösterilecek metin. Sistem yoğunken (429) ya
 * da sunucu hatasında (5xx) "bilgileri kontrol edin" demek yanıltıcıydı:
 * bilgiler doğru, yalnız tekrar denemek gerekir (işlem anahtarı korunur).
 */
export function failureMessage(response: Response, body: unknown, fallback: string): string {
  if (response.status === 429) return "Sistem şu an yoğun. Birkaç saniye sonra tekrar Kaydet'e basın; bilgileriniz korundu, kayıt iki kez oluşmaz.";
  if (response.status >= 500) {
    const message = serverMessage(body, "");
    return message && !/kaydedilemedi|sunucu hatası|yüklenemedi|oluşturulamadı/i.test(message)
      ? message
      : "Sunucu şu an yanıt vermiyor. Bilgileriniz korundu; biraz sonra tekrar Kaydet'e basın, kayıt iki kez oluşmaz.";
  }
  return serverMessage(body, fallback);
}

/** Sunucu hata gövdesinden kullanıcıya gösterilecek mesaj. */
export function serverMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return fallback;
}

export const CONNECTION_LOST = "Bağlantı kurulamadı. Girdiğiniz bilgiler korundu; tekrar Kaydet'e basabilirsiniz, kayıt iki kez oluşmaz.";

// Açıklamadaki sistem etiketleri ([SISTEM:…], [GELIR_TURU:…]) kullanıcıya
// gösterilmez; kullanıcı açıklamayı değiştirince de kaybolmasınlar diye
// yeni metnin sonuna geri eklenir.
const SYSTEM_TAG = /\[(?:SISTEM:[A-Z_]+:[^\]]+|GELIR_TURU:[^\]]+)\]/g;

/** Kayıttaki açıklamanın kullanıcıya gösterilen kısmı. */
export function visibleNote(text?: string | null): string {
  return stripSystemTags(text).replace(/\s*\[GELIR_TURU:[^\]]+\]/g, "").trim();
}

/** Düzeltilen açıklama + kayıttaki sistem etiketleri (boşsa null). */
export function noteWithSystemTags(original: string | null | undefined, edited: string): string | null {
  const tags = (original || "").match(SYSTEM_TAG) || [];
  const text = [edited.trim(), ...tags].filter(Boolean).join(" ");
  return text || null;
}

/**
 * Tahsilat/gider tarihi: bugün → şimdiki an (sunucu damgalar; gelecek saat
 * olmasın diye öğlen 12:00 kullanılmaz), geçmiş gün → o günün öğleni.
 * `undefined` dönerse alan gönderilmez (sunucu "şimdi" yazar).
 */
export function paymentDateIso(dateKey: string, { forceNow = false } = {}): string | undefined {
  if (!dateKey) return undefined;
  if (dateKey === turkeyDateKey()) return forceNow ? new Date().toISOString() : undefined;
  return turkeyLocalDateTimeToUtc(dateKey, "12:00").toISOString();
}
