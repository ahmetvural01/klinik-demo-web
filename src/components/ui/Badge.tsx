import type { ComponentType, ReactNode } from "react";

export type BadgeTone = "critical" | "warning" | "success" | "info" | "neutral";

// Durum renkleri (critical/warning/success) kasıtlı olarak tema tokenlerinden
// muaf tutulur — bkz. tailwind.config.ts: "Durum renkleri kasıtlı olarak
// dokunulmaz". "info" ise marka/bilgi etiketi olduğu için tema tokenli kalır.
const SUBTLE_CLASS: Record<BadgeTone, string> = {
  critical: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-emerald-100 text-emerald-700",
  info: "bg-primary/10 text-primary",
  neutral: "bg-slate-100 text-slate-600",
};

const SOLID_CLASS: Record<BadgeTone, string> = {
  critical: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  success: "bg-emerald-600 text-white",
  info: "bg-primary text-white",
  neutral: "bg-slate-600 text-white",
};

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "px-2 py-0.5 text-[11px] font-semibold",
  md: "px-2.5 py-1 text-xs font-bold",
};

export interface BadgeProps {
  tone?: BadgeTone;
  solid?: boolean;
  icon?: ComponentType<{ className?: string }>;
  size?: "sm" | "md";
  title?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", solid = false, icon: Icon, size = "sm", title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-full",
        solid ? SOLID_CLASS[tone] : SUBTLE_CLASS[tone],
        SIZE_CLASS[size],
      ].join(" ")}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}
