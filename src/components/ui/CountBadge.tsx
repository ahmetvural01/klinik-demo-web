export type CountBadgeTone = "critical" | "warning" | "neutral" | "info" | "success";

// Durum tonları Badge ile aynı anlamdadır; sayaç küçük olduğu için dolu renk.
const TONE_CLASS: Record<CountBadgeTone, string> = {
  neutral: "bg-slate-200 text-slate-700",
  critical: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  info: "bg-primary text-white",
  success: "bg-emerald-600 text-white",
};

export interface CountBadgeProps {
  /** 0, negatif ya da boşsa hiçbir şey çizilmez. */
  count: number | null | undefined;
  /** "critical": geciken/acil · "warning": bugün bakılacak · "neutral": bilgi · "info": seçim/filtre sayısı. */
  tone?: CountBadgeTone;
  /** Üst sınır: varsayılan 99 → "99+". Köşe rozetinde 9 önerilir ("9+"). */
  max?: number;
  /**
   * Sayının neyi saydığı ("geciken taksit"). Verilirse ekran okuyucu tam
   * sayıyla "128 geciken taksit" duyar ve fareyle üzerine gelince aynı metin
   * görünür. Rozet `aria-label`'lı bir düğmenin içindeyse sayıyı o etikete de yazın.
   */
  label?: string;
  /** "corner": ikon düğmesinin sağ üst köşesi (kapsayıcı `relative` olmalı). */
  placement?: "inline" | "corner";
  className?: string;
}

/**
 * Uygulama genelinde TEK sayaç rozeti (sekme, menü, üst bar, düğme içi).
 * Önceden aynı iş dört biçimde yazılmıştı: menüde degrade + gölge, üst barda
 * düz kırmızı/yeşil, sekmede `ui-tab-count`, randevu düğmesinde elle amber.
 * Ölçü sekme sayacıyla birebir aynıdır (20px yükseklik, 11px kalın rakam).
 *
 *   <CountBadge count={gecikmis} tone="critical" label="gecikmiş takip" />
 *   <button className="relative" aria-label={`Bildirimler, ${n} yeni`}>
 *     <Bell /><CountBadge count={n} tone="critical" placement="corner" max={9} />
 *   </button>
 */
export function CountBadge({ count, tone = "neutral", max = 99, label, placement = "inline", className = "" }: CountBadgeProps) {
  if (!count || !Number.isFinite(count) || count < 1) return null;
  const value = Math.floor(count);
  const text = value > max ? `${max}+` : String(value);
  const spoken = label ? `${value} ${label}` : undefined;
  return (
    <span
      title={spoken}
      className={[
        "ui-count-badge inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-bold leading-none",
        TONE_CLASS[tone],
        placement === "corner" ? "pointer-events-none absolute -right-1 -top-1 ring-2 ring-white" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      {spoken ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{spoken}</span>
        </>
      ) : text}
    </span>
  );
}
