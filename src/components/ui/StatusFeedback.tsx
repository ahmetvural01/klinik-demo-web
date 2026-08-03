/**
 * Başarı/hata anlarında kullanılan, çizilerek beliren durum sembolü.
 * Toast, form doğrulama ve modal onaylarında paylaşılan tek kaynak —
 * yalnızca statik ikonu büyütüp söndürmek yerine, dairenin ardından
 * check/x işaretinin gerçekten "çizildiği" bir hareket dizisi kullanır
 * (bkz. globals.css .ui-status-feedback / ui-status-stroke-draw).
 * Check ve X, telif konusu olmayan evrensel semboller — üçüncü taraf
 * bir ikon paketinden alınmadı, ama "kendi ikon sistemini kur" anlamında
 * yeni bir illüstrasyon dili de değil; yalnızca iki temel glif.
 */
type StatusFeedbackProps = {
  type: "success" | "error";
  size?: number;
  className?: string;
};

export function StatusFeedback({ type, size = 20, className = "" }: StatusFeedbackProps) {
  const isSuccess = type === "success";
  const ringColor = isSuccess ? "rgb(var(--color-success, 5 150 105))" : "rgb(var(--color-danger, 220 38 38))";
  return (
    <span className={`ui-status-feedback inline-flex ${className}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={ringColor} strokeWidth="1.6" opacity="0.35" />
        {isSuccess ? (
          <path
            className="ui-status-stroke"
            d="M7 12.5l3 3 7-7"
            stroke={ringColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--stroke-len" as string]: 16 }}
          />
        ) : (
          <path
            className="ui-status-stroke"
            d="M8 8l8 8M16 8l-8 8"
            stroke={ringColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--stroke-len" as string]: 23 }}
          />
        )}
      </svg>
    </span>
  );
}
