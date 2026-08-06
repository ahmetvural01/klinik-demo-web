export const INSTALLMENT_PERIODS = new Set([
  "HAFTALIK",
  "IKIHALFTALIK",
  "AYLIK",
  "IKIAYLIK",
  "UCAYLIK",
  "ALTIAYLIK",
  "YILLIK",
]);

/** Adds a real calendar installment period and clamps month-end dates. */
export function addInstallmentPeriod(start: Date, period: string, step: number): Date {
  if (period === "HAFTALIK" || period === "IKIHALFTALIK") {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + (period === "HAFTALIK" ? 7 : 14) * step);
    return date;
  }

  const monthStep = period === "IKIAYLIK"
    ? 2
    : period === "UCAYLIK"
      ? 3
      : period === "ALTIAYLIK"
        ? 6
        : period === "YILLIK"
          ? 12
          : 1;
  const targetMonthIndex = start.getUTCMonth() + monthStep * step;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(start.getUTCDate(), lastDay)));
}
