import type { BadgeTone } from "@/components/ui/Badge";
import { formatDayMonth } from "@/components/ui/Money";

// İletişim modülünde ekranda görünen TÜM durum/tür/kanal adları tek yerde.
// Kod adları (SUPPRESSED, APPOINTMENT_REMINDER, WHATSAPP...) kullanıcıya
// gösterilmez; her ekran bu haritaları kullanır.

/**
 * "Kredi iste": destek formu konu ve metin dolu açılır (önceden boş forma
 * gidiyordu; yönetici isteği baştan yazıyordu — A7).
 */
export const SMS_CREDIT_REQUEST_HREF = `/destek?yeni=1&konu=SMS&metin=${encodeURIComponent("SMS kredisi yüklenmesini rica ediyoruz.")}`;

export type Channel = "SMS" | "WHATSAPP";
export type ChannelPreference = "AUTO" | "SMS" | "WHATSAPP";

export const CHANNEL_LABELS: Record<ChannelPreference, string> = {
  AUTO: "Uygun kanal",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};

export function channelLabel(channel: string | null | undefined) {
  if (channel === "SMS" || channel === "WHATSAPP" || channel === "AUTO") return CHANNEL_LABELS[channel];
  return "—";
}

const EVENT_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: "Randevu bilgilendirme",
  APPOINTMENT_INFO: "Randevu bilgilendirme",
  APPOINTMENT_CHANGED: "Randevu değişikliği",
  APPOINTMENT_CANCELLED: "Randevu iptali",
  APPOINTMENT_REMINDER: "Randevu hatırlatma",
  TREATMENT_SURVEY: "Değerlendirme isteği",
  PAYMENT_REMINDER: "Ödeme hatırlatma",
  BIRTHDAY_GREETING: "Doğum günü",
  HOLIDAY_GREETING: "Özel gün",
  SMS_CONSENT_REQUEST: "SMS izni isteği",
  MANUAL_SMS: "Tek hastaya mesaj",
  MANUAL_WHATSAPP: "WhatsApp yanıtı",
  BULK_SMS: "Toplu mesaj",
};

export function eventLabel(eventType: string) {
  return EVENT_LABELS[eventType] || "Mesaj";
}

/** Gönderim Geçmişi'ndeki "Tür" süzgeci (api/sms/dispatches EVENT_GROUPS ile aynı anahtarlar). */
export const EVENT_FILTER_OPTIONS = [
  { value: "randevu", label: "Randevu mesajları" },
  { value: "odeme", label: "Ödeme hatırlatmaları" },
  { value: "kutlama", label: "Doğum günü ve özel günler" },
  { value: "izin", label: "SMS izni istekleri" },
  { value: "elle", label: "Elle gönderilenler" },
] as const;

export type DispatchStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SUPPRESSED";

// "Gönderilmedi" (izin/kredi yüzünden hiç denenmedi) ile "Gönderilemedi"
// (sağlayıcı hatası) neredeyse aynı sözcüktü; kullanıcı ayırt edemiyordu.
// Neden her zaman rozetin altında kısa cümleyle yazılır.
export const DISPATCH_STATUS: Record<DispatchStatus, { label: string; tone: BadgeTone }> = {
  SENT: { label: "Gönderildi", tone: "success" },
  DELIVERED: { label: "Teslim edildi", tone: "success" },
  READ: { label: "Okundu", tone: "success" },
  SUPPRESSED: { label: "Gitmedi", tone: "warning" },
  FAILED: { label: "Hata", tone: "critical" },
  QUEUED: { label: "Sonuç bekleniyor", tone: "info" },
};

/** Gönderim Geçmişi durum süzgeci: adres çubuğundaki ?durum= değeri → API değeri. */
export const STATUS_FILTER_OPTIONS = [
  { value: "gonderildi", api: "sent", label: "Gönderildi" },
  { value: "gonderilmedi", api: "not-sent", label: "Gitmedi" },
  { value: "basarisiz", api: "failed", label: "Hata" },
  { value: "bekliyor", api: "pending", label: "Sonuç bekleniyor" },
] as const;

/**
 * Sağlayıcı/dispatch gerekçesini kısa, sade Türkçeye çevirir. Tam metin
 * ayrıntı penceresinde ayrıca gösterilir.
 */
export function shortReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const text = reason.toLocaleLowerCase("tr-TR");
  if (text.includes("kesinleşmedi")) return "Sonuç belirsiz — tekrar göndermeyin";
  if (text.includes("sms iletişim izni")) return "Hastanın SMS izni yok";
  if (text.includes("whatsapp iletişim izni") || text.includes("whatsapp'tan mesaj almak istemiyor")) return "Hasta WhatsApp istemiyor";
  if (text.includes("bakiyesi yetersiz") || text.includes("kredi")) return "SMS kredisi bitti";
  if (text.includes("gönderimini kapatmış")) return "SMS gönderimi kapalı";
  if (text.includes("telefon")) return "Telefon numarası geçersiz";
  if (text.includes("whatsapp modülü")) return "WhatsApp bu klinikte açık değil";
  if (text.includes("bu bildirim türü için whatsapp")) return "Bu mesaj türünde WhatsApp kapalı";
  if (text.includes("sağlayıcı") || text.includes("no_active_provider") || text.includes("platform_not_ready") || text.includes("adresi tanımlı değil")) {
    return text.includes("whatsapp") ? "WhatsApp bağlantısı kurulmamış" : "SMS sağlayıcısı yanıt vermedi";
  }
  return reason.length > 60 ? `${reason.slice(0, 57)}…` : reason;
}

export type ConsentStatus = "ENABLED" | "PENDING" | "DISABLED" | "EXPIRED" | "SEND_FAILED" | "NONE";

/** SMS izni için TEK sözlük (api/sms/send ve api/sms/recipients türetilmiş durumu döndürür). */
export const SMS_CONSENT: Record<ConsentStatus, { label: string; tone: BadgeTone }> = {
  ENABLED: { label: "SMS izni var", tone: "success" },
  PENDING: { label: "Onay bekliyor", tone: "warning" },
  DISABLED: { label: "SMS'i reddetti", tone: "neutral" },
  EXPIRED: { label: "Onay süresi doldu", tone: "warning" },
  SEND_FAILED: { label: "İzin SMS'i gitmedi", tone: "critical" },
  NONE: { label: "İzin istenmedi", tone: "neutral" },
};

export function smsConsentOf(status: string | null | undefined) {
  return SMS_CONSENT[(status && status in SMS_CONSENT ? status : "NONE") as ConsentStatus];
}

// Tarih biçimi sistem genelinde tek: "28.10.2026" (bu yıl içinde kısa "28.10").
const SHORT_DATE = { format: (date: Date) => formatDayMonth(date) };
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const YEAR = new Intl.DateTimeFormat("tr-TR", { year: "numeric", timeZone: "Europe/Istanbul" });

/** "12.10 14:30" — gönderim geçmişi satırı (bu yıldan değilse yıl da yazılır). */
export function dateTimeStamp(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = YEAR.format(date) === YEAR.format(new Date()) ? SHORT_DATE.format(date) : SHORT_DATE_YEAR.format(date);
  return `${day} ${TIME.format(date)}`;
}

function calendarDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

/** "24 Kasım 2026 Salı" — özel günün sıradaki tarihi. */
export function longDateWithWeekday(isoDate: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(calendarDate(isoDate));
}

/** "29 Ekim" — kısa özetlerde sıradaki özel gün. */
export function dayAndMonth(isoDate: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(calendarDate(isoDate));
}

export function formatCount(value: number) {
  return value.toLocaleString("tr-TR");
}
