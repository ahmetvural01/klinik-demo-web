import assert from "node:assert/strict";
import {
  checkDoctorWorkingHoursInterval,
  checkLocalWorkingHoursInterval,
  checkWorkingHoursInterval,
  checkWorkingDay,
  FALLBACK_DAILY_SCHEDULES,
  normalizeDailySchedules,
  validateWorkHoursRange,
} from "../src/lib/working-hours-core";
import { turkeyLocalDateTimeToUtc } from "../src/lib/tz";

const schedules = normalizeDailySchedules(
  FALLBACK_DAILY_SCHEDULES.map((schedule) =>
    schedule.day === "Pazartesi"
      ? { ...schedule, lunchStart: "12:30", lunchEnd: "13:30" }
      : schedule
  )
);

assert.match(
  checkLocalWorkingHoursInterval({
    date: "2026-07-26",
    startTime: "10:00",
    endTime: "11:00",
    dailySchedules: schedules,
    actionLabel: "Randevu",
  }) || "",
  /klinik kapalıdır/
);

assert.match(validateWorkHoursRange("18:00", "08:30", "Personel çalışma saatleri") || "", /başlangıcı bitiş/);

assert.match(checkWorkingDay("2026-07-26", schedules, "Randevu talebi") || "", /klinik kapalıdır/);

assert.equal(
  checkLocalWorkingHoursInterval({
    date: "2026-07-27",
    startTime: "09:00",
    endTime: "10:00",
    dailySchedules: schedules,
    actionLabel: "Randevu",
  }),
  null
);

assert.match(
  checkLocalWorkingHoursInterval({
    date: "2026-07-27",
    startTime: "17:30",
    endTime: "18:30",
    dailySchedules: schedules,
    actionLabel: "Randevu",
  }) || "",
  /çalışma saatleri/
);

assert.match(
  checkLocalWorkingHoursInterval({
    date: "2026-07-27",
    startTime: "12:00",
    endTime: "13:00",
    dailySchedules: schedules,
    actionLabel: "Randevu",
  }) || "",
  /öğle arası/
);

const validStart = turkeyLocalDateTimeToUtc("2026-07-27", "09:00");
const validEnd = turkeyLocalDateTimeToUtc("2026-07-27", "10:00");
assert.equal(checkWorkingHoursInterval(validStart, validEnd, schedules), null);

assert.match(
  checkDoctorWorkingHoursInterval(
    turkeyLocalDateTimeToUtc("2026-07-27", "08:30"),
    turkeyLocalDateTimeToUtc("2026-07-27", "09:30"),
    "09:00",
    "17:00",
    "Dr. Test"
  ) || "",
  /yalnızca 09:00–17:00/
);

console.log("Çalışma saati kuralları doğrulandı.");
