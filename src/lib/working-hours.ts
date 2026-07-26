import { prisma } from "@/lib/prisma";
import {
  FALLBACK_DAILY_SCHEDULES,
  normalizeDailySchedules,
  type DaySchedule,
} from "@/lib/working-hours-core";

export {
  checkLocalWorkingHoursInterval,
  checkWorkingHoursInterval,
  type DaySchedule,
} from "@/lib/working-hours-core";

export async function getDailySchedules(institutionId: string | null | undefined): Promise<DaySchedule[]> {
  if (!institutionId) return FALLBACK_DAILY_SCHEDULES;
  try {
    const setting = await prisma.setting.findUnique({
      where: { institutionId },
      select: { dailySchedules: true, lunchStart: true, lunchEnd: true },
    });
    const raw = setting?.dailySchedules;
    if (!raw) return normalizeDailySchedules(FALLBACK_DAILY_SCHEDULES, setting?.lunchStart, setting?.lunchEnd);
    return normalizeDailySchedules(JSON.parse(raw), setting?.lunchStart, setting?.lunchEnd);
  } catch {
    return FALLBACK_DAILY_SCHEDULES;
  }
}
