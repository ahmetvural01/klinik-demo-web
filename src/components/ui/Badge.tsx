import type { ComponentType, ReactNode } from "react";

export type BadgeTone = "critical" | "warning" | "success" | "info" | "neutral";

// Durum renkleri (critical/warning/success) kasıtlı olarak tema tokenlerinden
// muaf tutulur — bkz. tailwind.config.ts: "Durum renkleri kasıtlı olarak
// dokunulmaz". "info" ise marka/bilgi etiketi olduğu için tema tokenli kalır.
// critical/warning önceden -50 (neredeyse görünmez, beyaza yakın) tondaydı —
// success/neutral zaten -100 kullanıyordu, bu yüzden ekran görüntülerinde
// "Gecikiyor"/uyarı rozetleri arka plansız düz metin gibi görünüyordu (bkz.
// kullanıcı geri bildirimi). Artık tüm tonlar aynı görünürlük seviyesinde.
const SUBTLE_CLASS: Record<BadgeTone, string> = {
  critical: "border border-red-200 bg-red-50 text-red-700",
  warning: "border border-amber-200 bg-amber-50 text-amber-700",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border border-primary/15 bg-primary/10 text-primary",
  neutral: "border border-slate-200 bg-slate-50 text-slate-600",
};

const SOLID_CLASS: Record<BadgeTone, string> = {
  critical: "bg-red-600 text-white shadow-[0_6px_16px_rgba(220,38,38,0.16)]",
  warning: "bg-amber-500 text-white shadow-[0_6px_16px_rgba(217,119,6,0.16)]",
  success: "bg-emerald-600 text-white shadow-[0_6px_16px_rgba(22,163,74,0.16)]",
  info: "bg-primary text-white shadow-[0_6px_16px_rgba(13,125,111,0.16)]",
  neutral: "bg-slate-600 text-white shadow-[0_6px_16px_rgba(71,85,105,0.14)]",
};

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "px-2 py-0.5 text-xs font-semibold",
  md: "px-2.5 py-1 text-xs font-bold",
};

export interface BadgeProps {
  tone?: BadgeTone;
  solid?: boolean;
  icon?: ComponentType<{ className?: string }>;
  size?: "sm" | "md";
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", solid = false, icon: Icon, size = "sm", title, className, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={[
        "ui-badge-premium inline-flex items-center gap-1 rounded-full leading-none",
        solid ? SOLID_CLASS[tone] : SUBTLE_CLASS[tone],
        SIZE_CLASS[size],
        className || "",
      ].join(" ")}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}
