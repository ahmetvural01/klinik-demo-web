import { isValidDateKey, turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";

export function reportQuickRange(period: "bugun" | "hafta" | "ay" | "yil", now = new Date()) {
  const today = turkeyDateKey(now);
  let first = today;
  if (period === "hafta") {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() || 7) + 1);
    first = day.toISOString().slice(0, 10);
  } else if (period === "ay") first = `${today.slice(0, 7)}-01`;
  else if (period === "yil") first = `${today.slice(0, 4)}-01-01`;
  return { from: `${first}T00:00`, to: `${today}T23:59` };
}

/** Report input values are Turkey local time. The selected last minute is inclusive. */
export function parseReportDateInput(value: string | null, endOfMinute = false): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match || !isValidDateKey(match[1]) || Number(match[2] || 0) > 23 || Number(match[3] || 0) > 59) {
    throw new Error("Geçerli bir rapor tarih aralığı seçiniz.");
  }
  const date = turkeyLocalDateTimeToUtc(match[1], `${match[2] || "00"}:${match[3] || "00"}`);
  return endOfMinute ? new Date(date.getTime() + 59_999) : date;
}
