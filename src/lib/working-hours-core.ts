import { turkeyDateKey, turkeyTimeKey } from "@/lib/tz";

export type DaySchedule = {
  day: string;
  isHoliday: boolean;
  open: string;
  close: string;
  lunchStart?: string;
  lunchEnd?: string;
};

export const SCHEDULE_DAY_NAMES = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

export const SCHEDULE_IDX_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0] as const;

export const FALLBACK_DAILY_SCHEDULES: DaySchedule[] = SCHEDULE_DAY_NAMES.map((day) => ({
  day,
  isHoliday: day === "Pazar",
  open: "08:30",
  close: day === "Cumartesi" ? "15:00" : "18:00",
  lunchStart: "",
  lunchEnd: "",
}));

const DAY_TO_JS_DAY = new Map<string, number>(
  SCHEDULE_DAY_NAMES.map((day, index) => [day.toLocaleLowerCase("tr-TR"), SCHEDULE_IDX_TO_JS_DAY[index]])
);

export function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function validateWorkHoursRange(
  workStart: unknown,
  workEnd: unknown,
  label = "Çalışma saatleri"
): string | null {
  if (typeof workStart !== "string" || typeof workEnd !== "string") {
    return `${label} için başlangıç ve bitiş saati zorunludur.`;
  }
  const start = parseTimeToMinutes(workStart);
  const end = parseTimeToMinutes(workEnd);
  if (start === null || end === null) return `${label} geçerli saat biçiminde olmalıdır.`;
  if (start >= end) return `${label} başlangıcı bitiş saatinden önce olmalıdır.`;
  return null;
}

export function getJsDayFromDateKey(dateKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

export function buildScheduleByJsDay(dailySchedules: DaySchedule[]): Map<number, DaySchedule> {
  const map = new Map<number, DaySchedule>();

  dailySchedules.forEach((schedule, index) => {
    const dayByName = DAY_TO_JS_DAY.get(String(schedule.day || "").toLocaleLowerCase("tr-TR"));
    const jsDay = dayByName ?? SCHEDULE_IDX_TO_JS_DAY[index];
    if (typeof jsDay === "number" && !map.has(jsDay)) map.set(jsDay, schedule);
  });

  return map;
}

export function normalizeDailySchedules(
  value: unknown,
  globalLunchStart = "",
  globalLunchEnd = ""
): DaySchedule[] {
  const parsed = Array.isArray(value) ? value : [];
  const byDay = buildScheduleByJsDay(
    parsed.filter((item): item is DaySchedule => Boolean(item && typeof item === "object"))
  );

  return FALLBACK_DAILY_SCHEDULES.map((fallback, index) => {
    const source = byDay.get(SCHEDULE_IDX_TO_JS_DAY[index]);
    if (!source) {
      return {
        ...fallback,
        lunchStart: globalLunchStart,
        lunchEnd: globalLunchEnd,
      };
    }

    return {
      day: fallback.day,
      isHoliday: Boolean(source.isHoliday),
      open: source.open || fallback.open,
      close: source.close || fallback.close,
      lunchStart: source.lunchStart || globalLunchStart,
      lunchEnd: source.lunchEnd || globalLunchEnd,
    };
  });
}

export function checkLocalWorkingHoursInterval(params: {
  date: string;
  startTime: string;
  endTime: string;
  dailySchedules: DaySchedule[];
  actionLabel?: string;
}): string | null {
  const { date, startTime, endTime, dailySchedules, actionLabel = "İşlem" } = params;
  const jsDay = getJsDayFromDateKey(date);
  if (jsDay === null) return "Geçerli bir tarih seçin.";

  const schedule = buildScheduleByJsDay(dailySchedules).get(jsDay);
  if (!schedule) return "Seçilen gün için çalışma saati tanımlanmamış.";
  if (schedule.isHoliday) {
    return `${schedule.day} günü klinik kapalıdır. ${actionLabel} kapalı bir güne kaydedilemez.`;
  }

  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const open = parseTimeToMinutes(schedule.open);
  const close = parseTimeToMinutes(schedule.close);
  if (start === null || end === null) return "Başlangıç ve bitiş saatlerini doğru girin.";
  if (start >= end) return "Başlangıç saati bitiş saatinden önce olmalıdır.";
  if (open === null || close === null || open >= close) {
    return `${schedule.day} günü için çalışma saatleri geçersiz. Ayarlar > Çalışma Saatleri bölümünü kontrol edin.`;
  }
  if (start < open || end > close) {
    return `${actionLabel}, ${schedule.day} çalışma saatleri (${schedule.open}–${schedule.close}) içinde olmalıdır.`;
  }

  const lunchStart = parseTimeToMinutes(schedule.lunchStart);
  const lunchEnd = parseTimeToMinutes(schedule.lunchEnd);
  if (
    lunchStart !== null &&
    lunchEnd !== null &&
    lunchStart < lunchEnd &&
    start < lunchEnd &&
    end > lunchStart
  ) {
    return `${actionLabel}, öğle arasıyla (${schedule.lunchStart}–${schedule.lunchEnd}) çakışıyor.`;
  }

  return null;
}

export function checkWorkingDay(
  date: string,
  dailySchedules: DaySchedule[],
  actionLabel = "Randevu"
): string | null {
  const jsDay = getJsDayFromDateKey(date);
  if (jsDay === null) return "Geçerli bir tarih seçin.";
  const schedule = buildScheduleByJsDay(dailySchedules).get(jsDay);
  if (!schedule) return "Seçilen gün için çalışma saati tanımlanmamış.";
  if (schedule.isHoliday) {
    return `${schedule.day} günü klinik kapalıdır. ${actionLabel} için açık bir gün seçin.`;
  }
  return null;
}

export function checkWorkingHoursInterval(
  startAt: Date,
  endAt: Date,
  dailySchedules: DaySchedule[],
  actionLabel = "Randevu"
): string | null {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return "Geçerli bir tarih ve saat girin.";
  }

  const startDate = turkeyDateKey(startAt);
  const endDate = turkeyDateKey(endAt);
  if (startDate !== endDate) return `${actionLabel} aynı çalışma günü içinde başlayıp bitmelidir.`;

  return checkLocalWorkingHoursInterval({
    date: startDate,
    startTime: turkeyTimeKey(startAt),
    endTime: turkeyTimeKey(endAt),
    dailySchedules,
    actionLabel,
  });
}

export function checkDoctorWorkingHoursInterval(
  startAt: Date,
  endAt: Date,
  workStart: string | null | undefined,
  workEnd: string | null | undefined,
  doctorName = "Seçilen doktor"
): string | null {
  if (!workStart && !workEnd) return null;
  const start = parseTimeToMinutes(turkeyTimeKey(startAt));
  const end = parseTimeToMinutes(turkeyTimeKey(endAt));
  const doctorStart = parseTimeToMinutes(workStart || "08:30");
  const doctorEnd = parseTimeToMinutes(workEnd || "18:00");

  if (start === null || end === null || doctorStart === null || doctorEnd === null || doctorStart >= doctorEnd) {
    return `${doctorName} için personel çalışma saatleri geçersiz. Personel profilini kontrol edin.`;
  }
  if (start < doctorStart || end > doctorEnd) {
    return `${doctorName} yalnızca ${workStart || "08:30"}–${workEnd || "18:00"} saatleri arasında randevu kabul ediyor.`;
  }
  return null;
}

export function checkDoctorLocalHoursInterval(
  startTime: string,
  endTime: string,
  workStart: string | null | undefined,
  workEnd: string | null | undefined,
  doctorName = "Seçilen doktor"
): string | null {
  if (!workStart && !workEnd) return null;
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const doctorStart = parseTimeToMinutes(workStart || "08:30");
  const doctorEnd = parseTimeToMinutes(workEnd || "18:00");
  if (start === null || end === null || doctorStart === null || doctorEnd === null || doctorStart >= doctorEnd) {
    return `${doctorName} için personel çalışma saatleri geçersiz. Personel profilini kontrol edin.`;
  }
  if (start < doctorStart || end > doctorEnd) {
    return `${doctorName} yalnızca ${workStart || "08:30"}–${workEnd || "18:00"} saatleri arasında randevu kabul ediyor.`;
  }
  return null;
}

export function validateWorkingHoursSettings(params: {
  dailySchedules: unknown;
  lunchStart?: unknown;
  lunchEnd?: unknown;
}): string | null {
  if (!Array.isArray(params.dailySchedules) || params.dailySchedules.length !== 7) {
    return "Haftanın yedi günü için çalışma saati tanımlanmalıdır.";
  }

  const globalLunchStart = typeof params.lunchStart === "string" ? params.lunchStart : "";
  const globalLunchEnd = typeof params.lunchEnd === "string" ? params.lunchEnd : "";
  if (Boolean(globalLunchStart) !== Boolean(globalLunchEnd)) {
    return "Genel öğle arası için başlangıç ve bitiş saatleri birlikte girilmelidir.";
  }
  if (
    globalLunchStart &&
    globalLunchEnd &&
    (parseTimeToMinutes(globalLunchStart) === null ||
      parseTimeToMinutes(globalLunchEnd) === null ||
      (parseTimeToMinutes(globalLunchStart) as number) >= (parseTimeToMinutes(globalLunchEnd) as number))
  ) {
    return "Genel öğle arası başlangıcı, bitiş saatinden önce olmalıdır.";
  }

  const schedules = normalizeDailySchedules(params.dailySchedules, globalLunchStart, globalLunchEnd);
  for (const schedule of schedules) {
    if (schedule.isHoliday) continue;
    const open = parseTimeToMinutes(schedule.open);
    const close = parseTimeToMinutes(schedule.close);
    if (open === null || close === null || open >= close) {
      return `${schedule.day} günü açılış saati kapanış saatinden önce olmalıdır.`;
    }

    const lunchStart = parseTimeToMinutes(schedule.lunchStart);
    const lunchEnd = parseTimeToMinutes(schedule.lunchEnd);
    if ((lunchStart === null) !== (lunchEnd === null)) {
      return `${schedule.day} günü öğle arası başlangıç ve bitiş saatleri birlikte girilmelidir.`;
    }
    if (lunchStart !== null && lunchEnd !== null) {
      if (lunchStart >= lunchEnd) return `${schedule.day} günü öğle arası saatleri geçersiz.`;
      if (lunchStart < open || lunchEnd > close) {
        return `${schedule.day} günü öğle arası çalışma saatlerinin içinde olmalıdır.`;
      }
    }
  }

  return null;
}
