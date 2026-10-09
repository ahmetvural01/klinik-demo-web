import { SMS_PLACEHOLDERS, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

// Otomatik mesajların ekrandaki TEK kataloğu: hangi olay, ne zaman gider,
// hangi bilgiler doldurulabilir. Sıra iş sırasıdır (randevu → ödeme →
// kutlama); veritabanı sırası (oluşturulma zamanı) kullanılmaz.
//
// "placeholders" listesi, mesajı gönderen sunucu kodunun gerçekten doldurduğu
// değişkenlerle birebir aynıdır (appointments/route.ts BILGI,
// appointment-reminders.ts HATIRLATMA, patient-payment-reminders.ts ODEME_*,
// birthday-reminders.ts DOGUM_GUNU, api/sms/send ve api/sms/bulk elle
// gönderim). Listede olmayan bir bilgi metne eklenirse hastaya boş gider.

export type MessageGroup = "randevu" | "odeme" | "dogum-gunu";

/**
 * Gönderim durumu:
 * - "appointment-flag": randevu formundaki ilgili kutu işaretliyse gider
 * - "payment" / "birthday" / "appointment-change" / "appointment-cancel":
 *   Otomatik Mesajlar'daki anahtar açıksa gider
 * - "not-sent": metin hazır ama sistem bu olayda şu an mesaj GÖNDERMİYOR
 */
export type SendRule = "appointment-flag" | "appointment-change" | "appointment-cancel" | "payment" | "birthday" | "not-sent";

export type EventMessage = {
  code: string;
  group: MessageGroup;
  title: string;
  /** Ne zaman gittiğini (ya da gitmediğini) dürüstçe anlatan tek cümle. */
  when: string;
  rule: SendRule;
  placeholders: string[];
};

const APPOINTMENT_TOKENS = ["patientName", "institutionName", "institutionPhone", "doctorName", "dateTime"];
const BASE_TOKENS = ["patientName", "institutionName", "institutionPhone"];

export const EVENT_MESSAGES: EventMessage[] = [
  {
    code: "BILGI",
    group: "randevu",
    title: "Randevu bilgilendirme",
    when: "Randevu kaydedilince gider — randevu formunda “Bilgilendirme” işaretliyse.",
    rule: "appointment-flag",
    placeholders: APPOINTMENT_TOKENS,
  },
  {
    code: "HATIRLATMA",
    group: "randevu",
    title: "Randevu hatırlatma",
    when: "Randevudan önce gider — randevu formunda “Hatırlatma” işaretliyse. Yeni randevularda bu kutu işaretsiz gelir.",
    rule: "appointment-flag",
    placeholders: APPOINTMENT_TOKENS,
  },
  {
    code: "RANDEVU_DEGISIKLIK",
    group: "randevu",
    title: "Randevu değişikliği",
    when: "Gelecekteki bir randevunun tarihi, saati veya doktoru değişince gider (randevuda “Bilgilendirme” işaretliyse).",
    rule: "appointment-change",
    placeholders: APPOINTMENT_TOKENS,
  },
  {
    code: "RANDEVU_IPTAL",
    group: "randevu",
    title: "Randevu iptali",
    when: "Gelecekteki bir randevu iptal edilince gider (randevuda “Bilgilendirme” işaretliyse).",
    rule: "appointment-cancel",
    placeholders: APPOINTMENT_TOKENS,
  },
  {
    code: "ODEME_YAKLASIYOR",
    group: "odeme",
    title: "Vadesi yaklaşan ödeme",
    when: "Seçtiğiniz günlerde, vadeden önce gider.",
    rule: "payment",
    placeholders: [...BASE_TOKENS, "amount", "dueDate", "daysLeft"],
  },
  {
    code: "ODEME_VADE_GUNU",
    group: "odeme",
    title: "Vade günü",
    when: "Ödemenin vade gününde gider.",
    rule: "payment",
    placeholders: [...BASE_TOKENS, "amount", "dueDate"],
  },
  {
    code: "ODEME_GECIKTI",
    group: "odeme",
    title: "Geciken ödeme",
    when: "Vade geçince, seçtiğiniz aralıkla tekrar gider.",
    rule: "payment",
    placeholders: [...BASE_TOKENS, "amount", "dueDate", "daysLate"],
  },
  {
    code: "DOGUM_GUNU",
    group: "dogum-gunu",
    title: "Doğum günü",
    when: "Hastanın doğum gününde, yılda bir kez gider.",
    rule: "birthday",
    placeholders: BASE_TOKENS,
  },
];

export const EVENT_CODES = new Set(EVENT_MESSAGES.map((item) => item.code));

/** Elle gönderilen ve kayıtlı metinlerde doldurulabilen bilgiler (api/sms/send, api/sms/bulk). */
export const MANUAL_PLACEHOLDER_TOKENS = BASE_TOKENS;
/** Hazır özel gün metinleri ayrıca kutlama gününün adını doldurur. */
export const CELEBRATION_PLACEHOLDER_TOKENS = [...BASE_TOKENS, "title"];

export function placeholdersFor(tokens: string[]): SmsPlaceholder[] {
  return tokens
    .map((token) => SMS_PLACEHOLDERS.find((item) => item.token === token))
    .filter((item): item is SmsPlaceholder => Boolean(item));
}

/**
 * Metinde, bu mesajda doldurulamayan bir bilgi etiketi var mı? Hem okunaklı
 * ("[Tutar (TL)]") hem ham ("{{amount}}") biçime bakar. Bulunanların
 * okunaklı adlarını döner.
 */
export function unsupportedPlaceholders(readableText: string, allowedTokens: string[]) {
  const allowed = new Set(allowedTokens);
  const found: string[] = [];
  for (const placeholder of SMS_PLACEHOLDERS) {
    if (allowed.has(placeholder.token)) continue;
    if (readableText.includes(`[${placeholder.label}]`) || readableText.includes(`{{${placeholder.token}}}`)) {
      found.push(`[${placeholder.label}]`);
    }
  }
  return found;
}

export function unsupportedPlaceholderError(readableText: string, allowedTokens: string[]) {
  const found = unsupportedPlaceholders(readableText, allowedTokens);
  if (found.length === 0) return undefined;
  return `${found.join(", ")} bu mesajda doldurulamaz; hastaya boş gider. Metinden kaldırın.`;
}

/** Kliniğin kendi kayıtlı metinleri için çakışmasız kod (sistem kodlarıyla karışmaz). */
export function customTextCode(title: string, existingCodes: Set<string>) {
  const base = `OZEL_${title
    .toLocaleUpperCase("tr-TR")
    .replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/İ/g, "I").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "METIN"}`;
  if (!existingCodes.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}
