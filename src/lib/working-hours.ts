import { prisma } from "@/lib/prisma";

export type DaySchedule = {
  day: string;
  isHoliday: boolean;
  open: string;
  close: string;
  lunchStart?: string;
  lunchEnd?: string;
};

// dailySchedules dizisindeki sıra Pazartesi'den başlar (bkz. ayar/page.tsx
// DAYS sabiti); JS'in Date.getDay() ise 0=Pazar ile başlar. Bu eşleme
// olmadan gün kontrolü yanlış güne bakar.
const SCHEDULE_IDX_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0] as const;
const SCHEDULE_DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;

// Kurum Ayarlar > Çalışma Saatleri ekranını hiç ziyaret etmemişse
// (dailySchedules veritabanında boş "[]") bu güvenli varsayılana düşülür —
// ayar/page.tsx'teki DEFAULT_SCHEDULES ile birebir aynı olmalı, aksi halde
// bu kontrol sessizce devre dışı kalır.
const FALLBACK_DAILY_SCHEDULES: DaySchedule[] = SCHEDULE_DAY_NAMES.map((day) => ({
  day,
  isHoliday: day === "Pazar",
  open: "08:30",
  close: day === "Cumartesi" ? "15:00" : "18:00",
}));

function parseTimeToMinutes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

function buildScheduleByJsDay(dailySchedules: DaySchedule[]): Map<number, DaySchedule> {
  const map = new Map<number, DaySchedule>();
  dailySchedules.forEach((ds, i) => {
    if (i < SCHEDULE_IDX_TO_JS_DAY.length) map.set(SCHEDULE_IDX_TO_JS_DAY[i], ds);
  });
  return map;
}

export async function getDailySchedules(institutionId: string | null | undefined): Promise<DaySchedule[]> {
  if (!institutionId) return FALLBACK_DAILY_SCHEDULES;
  try {
    const setting = await prisma.setting.findUnique({ where: { institutionId }, select: { dailySchedules: true } });
    const raw = setting?.dailySchedules;
    if (!raw) return FALLBACK_DAILY_SCHEDULES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as DaySchedule[]) : FALLBACK_DAILY_SCHEDULES;
  } catch {
    return FALLBACK_DAILY_SCHEDULES;
  }
}

/**
 * Bir randevu başlangıç saatinin kurumun çalışma saatleri içinde olup
 * olmadığını kontrol eder. Tatil günüyse veya mesai saati dışındaysa bir
 * hata mesajı döner, uygunsa null döner.
 */
export function checkWithinWorkingHours(startAt: Date, dailySchedules: DaySchedule[]): string | null {
  const scheduleByJsDay = buildScheduleByJsDay(dailySchedules);
  const daySchedule = scheduleByJsDay.get(startAt.getDay());
  if (!daySchedule) return null;

  if (daySchedule.isHoliday) {
    return "Seçilen gün, Ayarlar > Çalışma Saatleri sekmesinde tatil olarak işaretli.";
  }

  const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
  const openMinutes = parseTimeToMinutes(daySchedule.open, 8 * 60 + 30);
  const closeMinutes = parseTimeToMinutes(daySchedule.close, 18 * 60);
  if (startMinutes < openMinutes || startMinutes >= closeMinutes) {
    return `Seçilen saat, o günün çalışma saatleri (${daySchedule.open}–${daySchedule.close}) dışında.`;
  }

  return null;
}
