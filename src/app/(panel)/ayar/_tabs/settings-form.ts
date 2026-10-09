import {
  FALLBACK_DAILY_SCHEDULES,
  normalizeDailySchedules,
  parseTimeToMinutes,
  validateWorkingHoursSettings,
  type DaySchedule,
} from "@/lib/working-hours-core";

// Ayarlar > Klinik bilgileri ve Çalışma saatleri aynı kayıttan (Setting)
// okunur ve tek düğmeyle kaydedilir. Form yalnız bu iki sekmenin düzenlediği
// alanları gönderir; SMS/WhatsApp gibi başka ekranların ayarlarına dokunmaz.
export type ScheduleRow = Required<DaySchedule>;

export type ClinicSettingsForm = {
  institutionName: string;
  institutionAddress: string;
  institutionPhone: string;
  institutionWebsite: string;
  logoUrl: string;
  /** Kutuda yazıldığı gibi tutulur; kaydederken sayıya çevrilir. */
  appointmentDuration: string;
  lunchStart: string;
  lunchEnd: string;
  dailySchedules: ScheduleRow[];
};

export const EMPTY_SETTINGS_FORM: ClinicSettingsForm = {
  institutionName: "",
  institutionAddress: "",
  institutionPhone: "",
  institutionWebsite: "",
  logoUrl: "",
  appointmentDuration: "15",
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
  const duration = Number(data.appointmentDuration);
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
    logoUrl: text("logoUrl"),
    appointmentDuration: Number.isFinite(duration) && duration > 0 ? String(duration) : "15",
    lunchStart: "",
    lunchEnd: "",
    // Gün satırları her zaman Pazartesi→Pazar sırasıyla ve yedi gün olarak gösterilir.
    dailySchedules: (schedules.length > 0
      ? normalizeDailySchedules(schedules, globalLunchStart, globalLunchEnd)
      : FALLBACK_DAILY_SCHEDULES.map((day) => ({ ...day, lunchStart: day.lunchStart || globalLunchStart, lunchEnd: day.lunchEnd || globalLunchEnd }))
    ).map(toRow),
  };
}

export function durationError(value: string): string | null {
  const duration = Number(value);
  if (!value.trim() || !Number.isInteger(duration) || duration < 5 || duration > 240) {
    return "Randevu süresi 5 ile 240 dakika arasında bir tam sayı olmalıdır.";
  }
  return null;
}

/** Bir günün satırındaki hatayı ekranda o satırın altında göstermek için. */
export function dayError(row: ScheduleRow): string | null {
  if (row.isHoliday) return null;
  const open = parseTimeToMinutes(row.open);
  const close = parseTimeToMinutes(row.close);
  if (open === null || close === null) return "Açılış ve kapanış saatini girin.";
  if (open >= close) return "Kapanış saati açılıştan sonra olmalı.";
  const lunchStart = parseTimeToMinutes(row.lunchStart);
  const lunchEnd = parseTimeToMinutes(row.lunchEnd);
  if ((lunchStart === null) !== (lunchEnd === null)) return "Öğle arası için iki saati de girin ya da ikisini de boş bırakın.";
  if (lunchStart !== null && lunchEnd !== null) {
    if (lunchStart >= lunchEnd) return "Öğle arası bitişi başlangıçtan sonra olmalı.";
    if (lunchStart < open || lunchEnd > close) return "Öğle arası çalışma saatlerinin içinde olmalı.";
  }
  return null;
}

/** Kaydetmeden önce sunucuyla aynı kuralla denetler; ilk hatayı döndürür. */
export function settingsFormError(form: ClinicSettingsForm): string | null {
  const duration = durationError(form.appointmentDuration);
  if (duration) return duration;
  return validateWorkingHoursSettings({
    dailySchedules: form.dailySchedules,
    lunchStart: form.lunchStart,
    lunchEnd: form.lunchEnd,
  });
}

export function settingsPayload(form: ClinicSettingsForm) {
  return {
    institutionName: form.institutionName.trim(),
    institutionAddress: form.institutionAddress.trim(),
    institutionPhone: form.institutionPhone.trim(),
    institutionWebsite: form.institutionWebsite.trim(),
    logoUrl: form.logoUrl.trim(),
    appointmentDuration: Number(form.appointmentDuration),
    lunchStart: form.lunchStart,
    lunchEnd: form.lunchEnd,
    dailySchedules: JSON.stringify(form.dailySchedules),
  };
}
