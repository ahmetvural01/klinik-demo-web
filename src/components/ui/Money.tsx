import { formatCurrency } from "@/lib/format";

type MoneyProps = {
  value: number | string | null | undefined;
  /** "auto": borç/eksi kırmızı; "positive": yeşil; "plain": renksiz. */
  tone?: "auto" | "positive" | "plain";
  className?: string;
};

/**
 * Tutarların her ekranda aynı biçimde yazılması için (₺1.250,00). Önceden aynı
 * tutar bir ekranda kuruşlu, diğerinde kuruşsuz; bazı yerlerde sayarak gelen
 * animasyonla yuvarlanmış görünüyordu. Değer yoksa "—" yazar.
 */
export function Money({ value, tone = "plain", className = "" }: MoneyProps) {
  if (value === null || value === undefined || value === "") {
    return <span className={`text-slate-300 ${className}`} aria-label="Tutar yok">—</span>;
  }
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return <span className={`text-slate-300 ${className}`}>—</span>;
  const color = tone === "positive" ? "text-emerald-700" : tone === "auto" && amount < 0 ? "text-red-700" : "";
  return <span className={`tabular-nums ${color} ${className}`}>{formatCurrency(amount)}</span>;
}

type DateTextProps = {
  value: string | Date | null | undefined;
  /** "short": 09.10.2026 · "long": 9 Ekim 2026 · "datetime": 09.10.2026 14:30 · "time": 14:30 */
  format?: "short" | "long" | "datetime" | "time";
  className?: string;
};

const SHORT = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const LONG = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function formatDateText(value: string | Date, format: DateTextProps["format"] = "short") {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  if (format === "long") return LONG.format(date);
  if (format === "time") return TIME.format(date);
  if (format === "datetime") return `${SHORT.format(date)} ${TIME.format(date)}`;
  return SHORT.format(date);
}

/** Tarihleri her ekranda aynı biçimde ve Türkiye saatine göre yazar; yoksa "—". */
export function DateText({ value, format = "short", className = "" }: DateTextProps) {
  const text = value ? formatDateText(value, format) : "";
  if (!text) return <span className={`text-slate-300 ${className}`} aria-label="Tarih yok">—</span>;
  const iso = typeof value === "string" ? value : value instanceof Date ? value.toISOString() : undefined;
  return <time dateTime={iso} className={`tabular-nums ${className}`}>{text}</time>;
}
