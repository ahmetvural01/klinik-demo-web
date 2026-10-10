import { useId, type ReactNode } from "react";

export type ProgressTone = "primary" | "success" | "warning" | "critical" | "neutral";

const FILL_CLASS: Record<ProgressTone, string> = {
  primary: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  neutral: "bg-slate-400",
};

// Türkçe yüzde biçimi: "%60" (işaret önde).
const PERCENT = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 0 });

type ProgressBarProps = {
  /** Gelinen değer (ör. tamamlanan adım, yüklenen bayt). 0..max aralığına sıkıştırılır. */
  value: number;
  /** Üst sınır (varsayılan 100). 0 ya da geçersizse çubuk boş görünür. */
  max?: number;
  /** Çubuğun üstünde solda kısa ad ("Tedavi adımları", "Kalan kredi"). */
  label?: ReactNode;
  /**
   * Sağdaki değer metni. Verilmezse `label` varken yüzde ("%60") gösterilir;
   * kendi metninizi verin ("3 / 5 adım", "42 / 1.000") ya da false ile gizleyin.
   */
  valueLabel?: ReactNode | false;
  /** primary (varsayılan) · success (tamamlandı) · warning (azalıyor) · critical (bitti/aşıldı) · neutral */
  tone?: ProgressTone;
  /** sm: 6px (liste/kart içi, varsayılan) · md: 8px (tek başına, yükleme). */
  size?: "sm" | "md";
  /** Görünür `label` yoksa ekran okuyucu adı (zorunlu sayılır). */
  "aria-label"?: string;
  className?: string;
};

/**
 * İlerleme çubuğu — TEK görünüm. Tedavi planı ilerlemesi, paket seansı,
 * belge yükleme, SMS kredisi gibi "ne kadarı bitti" bilgisi için. Önceden
 * sayfalar SVG çizgi ya da iç içe div ile ayrı ayrı yazıyordu. Animasyon
 * yalnız değer değişince kısa bir genişlik geçişidir.
 *
 *   <ProgressBar value={done} max={plan.steps.length} label="Tedavi adımları" valueLabel={`${done} / ${plan.steps.length} adım`} />
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueLabel,
  tone = "primary",
  size = "sm",
  "aria-label": ariaLabel,
  className = "",
}: ProgressBarProps) {
  const labelId = useId();
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? value : 0;
  const clamped = safeMax ? Math.min(Math.max(safeValue, 0), safeMax) : 0;
  const ratio = safeMax ? clamped / safeMax : 0;
  const percentText = PERCENT.format(ratio);
  const shownValue = valueLabel === undefined ? (label ? percentText : null) : valueLabel;
  const hasValue = shownValue !== false && shownValue !== null && shownValue !== "";
  const valueText = typeof shownValue === "string" ? shownValue : percentText;

  return (
    <div className={`ui-progress ${className}`}>
      {(label || hasValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs leading-4">
          {label ? <span id={labelId} className="min-w-0 truncate font-semibold text-slate-600">{label}</span> : <span />}
          {hasValue && <span className="shrink-0 tabular-nums text-slate-500">{shownValue}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-labelledby={label && !ariaLabel ? labelId : undefined}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={valueText}
        className={`overflow-hidden rounded-full bg-slate-100 ${size === "md" ? "h-2" : "h-1.5"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${FILL_CLASS[tone]}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
