import {
  FALLBACK_DAILY_SCHEDULES,
  normalizeDailySchedules,
  parseTimeToMinutes,
  validateWorkingHoursSettings,
  type DaySchedule,
} from "@/lib/working-hours-core";
import {
  REVIEW_LINK_MESSAGE,
  normalizeClinicAddress,
  normalizeClinicName,
  normalizeClinicPhone,
  normalizeWebAddress,
} from "@/app/api/settings/clinic-contact";

// Ayarlar > Klinik sekmesi: klinik bilgileri, hasta bağlantıları ve çalışma
// saatleri aynı kayıttan (Setting) okunur ve TEK düğmeyle kaydedilir. Form
// yalnız bu sekmenin düzenlediği alanları gönderir; SMS/WhatsApp gibi başka
// ekranların ayarlarına ve randevu aralığına (Randevu sekmesi) dokunmaz.
export type ScheduleRow = Required<DaySchedule>;

export type ClinicSettingsForm = {
  institutionName: string;
  institutionAddress: string;
  institutionPhone: string;
  institutionWebsite: string;
  /** Değerlendirme (anket) mesajındaki bağlantı — ör. Google yorum sayfası. */
  reviewLink: string;
  logoUrl: string;
  lunchStart: string;
  lunchEnd: string;
  dailySchedules: ScheduleRow[];
};

export type ContactField = "institutionName" | "institutionPhone" | "institutionAddress" | "institutionWebsite" | "reviewLink";

export const EMPTY_SETTINGS_FORM: ClinicSettingsForm = {
  institutionName: "",
  institutionAddress: "",
  institutionPhone: "",
  institutionWebsite: "",
  reviewLink: "",
  logoUrl: "",
  lunchStart: "",
  lunchEnd: "",
  dailySchedules: FALLBACK_DAILY_SCHEDULES.map(toRow),
};

function toRow(day: DaySchedule): ScheduleRow {
  return {
    day: day.day,
    isHoliday: Boolean(day.isHoliday),
    open: day.open || "",
    close: day.close || "",
    lunchStart: day.lunchStart || "",
    lunchEnd: day.lunchEnd || "",
  };
}

function parseSchedules(raw: unknown): DaySchedule[] {
  if (Array.isArray(raw)) return raw as DaySchedule[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function settingsFormFromApi(data: Record<string, unknown>): ClinicSettingsForm {
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const schedules = parseSchedules(data.dailySchedules);
  // Öğle arası tek yerde, gün satırlarında düzenlenir. Eski "genel öğle
  // arası" değeri, kendi öğle arası yazılmamış günlere aynen kopyalanır ve
  // genel değer boşaltılır — randevu kuralı açısından sonuç aynıdır
  // (normalizeDailySchedules de boş günü genel değerle doldurur), ama
  // kullanıcı artık iki ayrı yerde öğle arası görmez. Kaydedilince genel
  // değer veritabanından da temizlenir.
  const globalLunchStart = text("lunchStart");
  const globalLunchEnd = text("lunchEnd");
  return {
    institutionName: text("institutionName"),
    institutionAddress: text("institutionAddress"),
    institutionPhone: text("institutionPhone"),
    institutionWebsite: text("institutionWebsite"),
    reviewLink: text("reviewLink"),
    logoUrl: text("logoUrl"),
    lunchStart: "",
    lunchEnd: "",
    // Gün satırları her zaman Pazartesi→Pazar sırasıyla ve yedi gün olarak gösterilir.
    dailySchedules: (schedules.length > 0
      ? normalizeDailySchedules(schedules, globalLunchStart, globalLunchEnd)
      : FALLBACK_DAILY_SCHEDULES.map((day) => ({ ...day, lunchStart: day.lunchStart || globalLunchStart, lunchEnd: day.lunchEnd || globalLunchEnd }))
    ).map(toRow),
  };
}

/**
 * Bir günün satırındaki hata, hangi saat aralığına ait olduğuyla birlikte:
 * "work" = çalışma saati, "lunch" = öğle arası. Satır altında tek metin
 * görünür ve yalnız ilgili alan kırmızı olur (önceden 4 alanın hepsi
 * kırmızıya dönüyordu — canlı H-13).
 */
export function dayErrors(row: ScheduleRow): { work?: string; lunch?: string } {
  if (row.isHoliday) return {};
  const open = parseTimeToMinutes(row.open);
  const close = parseTimeToMinutes(row.close);
  if (open === null || close === null) return { work: "Açılış ve kapanış saatini girin." };
  if (open >= close) return { work: "Kapanış saati açılıştan sonra olmalı." };
  const lunchStart = parseTimeToMinutes(row.lunchStart);
  const lunchEnd = parseTimeToMinutes(row.lunchEnd);
  if ((lunchStart === null) !== (lunchEnd === null)) return { lunch: "Öğle arası için iki saati de girin ya da ikisini de boş bırakın." };
  if (lunchStart !== null && lunchEnd !== null) {
    if (lunchStart >= lunchEnd) return { lunch: "Öğle arası bitişi başlangıçtan sonra olmalı." };
    if (lunchStart < open || lunchEnd > close) return { lunch: "Öğle arası çalışma saatlerinin içinde olmalı." };
  }
  return {};
}

const CONTACT_RULES: Array<[ContactField, (value: string) => ReturnType<typeof normalizeClinicName>]> = [
  ["institutionName", normalizeClinicName],
  ["institutionPhone", normalizeClinicPhone],
  ["institutionWebsite", (value) => normalizeWebAddress(value)],
  ["institutionAddress", normalizeClinicAddress],
  ["reviewLink", (value) => normalizeWebAddress(value, REVIEW_LINK_MESSAGE)],
];

/** Klinik bilgilerinin alan hataları — sunucuyla aynı kural (api/settings/clinic-contact). */
export function contactErrors(form: ClinicSettingsForm): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {};
  for (const [key, check] of CONTACT_RULES) {
    const result = check(form[key]);
    if (!result.ok) errors[key] = result.message;
  }
  return errors;
}

/**
 * Kaydetmeden önce sunucuyla aynı kuralla denetler. İlk hatanın metni ve
 * ekranda gidilecek yer (alan ya da gün satırı) döner; sorun yoksa null.
 */
export function settingsFormError(form: ClinicSettingsForm): { message: string; targetId: string } | null {
  const contact = contactErrors(form);
  for (const [key] of CONTACT_RULES) {
    if (contact[key]) return { message: contact[key] as string, targetId: `ayar-${key}` };
  }
  const dayIndex = form.dailySchedules.findIndex((row) => {
    const errors = dayErrors(row);
    return Boolean(errors.work || errors.lunch);
  });
  if (dayIndex >= 0) {
    const row = form.dailySchedules[dayIndex];
    const errors = dayErrors(row);
    return { message: `${row.day}: ${errors.work || errors.lunch}`, targetId: `ayar-gun-${dayIndex}` };
  }
  const scheduleError = validateWorkingHoursSettings({
    dailySchedules: form.dailySchedules,
    lunchStart: form.lunchStart,
    lunchEnd: form.lunchEnd,
  });
  return scheduleError ? { message: scheduleError, targetId: "calisma-saatleri" } : null;
}

/**
 * İletişim alanlarını sunucunun saklayacağı biçime getirir (telefon
 * "0216 345 67 89", web adresine https://). Kaydedilen ile ekranda kalan
 * değer aynı olsun; aksi halde kayıttan sonra form hemen "değişti" görünürdü.
 */
export function normalizeSettingsForm(form: ClinicSettingsForm): ClinicSettingsForm {
  const next = { ...form };
  for (const [key, check] of CONTACT_RULES) {
    const result = check(form[key]);
    if (result.ok) next[key] = result.value;
  }
  return next;
}

export function settingsPayload(form: ClinicSettingsForm) {
  return {
    institutionName: form.institutionName.trim(),
    institutionAddress: form.institutionAddress.trim(),
    institutionPhone: form.institutionPhone.trim(),
    institutionWebsite: form.institutionWebsite.trim(),
    reviewLink: form.reviewLink.trim(),
    logoUrl: form.logoUrl.trim(),
    lunchStart: form.lunchStart,
    lunchEnd: form.lunchEnd,
    dailySchedules: JSON.stringify(form.dailySchedules),
  };
}

/** Randevu aralığı seçenekleri (dk). Takvim en fazla 120 dk adım kullanır. */
export const APPOINTMENT_INTERVAL_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120] as const;
