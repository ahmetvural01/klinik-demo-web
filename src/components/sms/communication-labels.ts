import type { BadgeTone } from "@/components/ui/Badge";

// İletişim modülünde ekranda görünen TÜM durum/tür/kanal adları tek yerde.
// Kod adları (SUPPRESSED, APPOINTMENT_REMINDER, WHATSAPP...) kullanıcıya
// gösterilmez; her ekran bu haritaları kullanır.

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

export const DISPATCH_STATUS: Record<DispatchStatus, { label: string; tone: BadgeTone }> = {
  SENT: { label: "Gönderildi", tone: "success" },
  DELIVERED: { label: "Teslim edildi", tone: "success" },
  READ: { label: "Okundu", tone: "success" },
  SUPPRESSED: { label: "Gönderilmedi", tone: "warning" },
  FAILED: { label: "Gönderilemedi", tone: "critical" },
  QUEUED: { label: "Sonuç bekleniyor", tone: "info" },
};

/** Gönderim Geçmişi durum süzgeci: adres çubuğundaki ?durum= değeri → API değeri. */
export const STATUS_FILTER_OPTIONS = [
  { value: "gonderildi", api: "sent", label: "Gönderildi" },
  { value: "gonderilmedi", api: "not-sent", label: "Gönderilmedi (izin, kredi vb.)" },
  { value: "basarisiz", api: "failed", label: "Gönderilemedi (hata)" },
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
  if (text.includes("whatsapp iletişim izni")) return "Hastanın WhatsApp izni yok";
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

/** WhatsApp sağlayıcı hatalarını personelin anlayacağı dile çevirir. */
export function friendlyWhatsappError(error: string | null | undefined): string | null {
  if (!error) return null;
  const text = error.toLocaleLowerCase("tr-TR");
  if (text.includes("adresi tanımlı değil") || text.includes("no_active_provider") || text.includes("platform_not_ready") || text.includes("sağlayıcı")) {
    return "WhatsApp bağlantısı kurulmamış olduğu için mesaj gönderilemedi.";
  }
  if (text.includes("24 saat")) return "24 saatlik yanıt süresi dolduğu için serbest mesaj gönderilemedi.";
  if (text.includes("izin")) return "Hastanın WhatsApp izni olmadığı için mesaj gönderilemedi.";
  return error;
}

export type ConsentStatus = "ENABLED" | "PENDING" | "DISABLED" | "EXPIRED" | "SEND_FAILED" | "NONE";

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

/** "905552220012" → "+90 555 222 00 12" (WhatsApp numaraları ülke koduyla gelir). */
export function formatWhatsappNumber(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("90")) {
    return `+90 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+90 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return digits ? `+${digits}` : "—";
}

const SHORT_DATE = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** Liste zamanı: bugünse saat, dünse "Dün", bu yılsa "29 Tem", değilse "29 Tem 2025". */
export function relativeStamp(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return TIME.format(date);
  if (date.toDateString() === yesterday.toDateString()) return "Dün";
  return date.getFullYear() === now.getFullYear() ? SHORT_DATE.format(date) : SHORT_DATE_YEAR.format(date);
}

/** "12 Eki 14:30" — gönderim geçmişi satırı için. */
export function dateTimeStamp(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const day = date.getFullYear() === now.getFullYear() ? SHORT_DATE.format(date) : SHORT_DATE_YEAR.format(date);
  return `${day} ${TIME.format(date)}`;
}

/** "24 Kasım 2026 Salı" — özel günün sıradaki tarihi. */
export function longDateWithWeekday(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, 12);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(date);
}

export function formatCount(value: number) {
  return value.toLocaleString("tr-TR");
}
