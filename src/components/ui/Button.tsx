"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentType } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

type IconComponent = ComponentType<{ className?: string }>;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border border-primary bg-gradient-to-b from-primary to-primary-strong text-white shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,var(--shadow-surface)] hover:brightness-[1.05] hover:shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,var(--shadow-raised)] font-bold disabled:opacity-55",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-[var(--shadow-rest)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-[var(--shadow-surface)] font-semibold disabled:opacity-55",
  danger: "border border-red-600 bg-gradient-to-b from-red-600 to-red-700 text-white shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,var(--shadow-surface)] hover:brightness-[1.05] hover:shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,var(--shadow-raised)] font-bold disabled:opacity-55",
  ghost: "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold disabled:opacity-40",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm rounded-lg",
  sm: "h-8 px-3 text-xs rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  iconPosition?: "left" | "right";
  loading?: boolean;
  fullWidth?: boolean;
  href?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  href,
  ...rest
}: ButtonProps) {
  const iconEl = loading ? (
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
  ) : Icon ? (
    <Icon className="h-4 w-4 shrink-0" />
  ) : null;

  const classes = [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? "w-full" : "",
    className,
  ].filter(Boolean).join(" ");

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={classes}>
        {iconEl && iconPosition === "left" && iconEl}
        {children}
        {iconEl && iconPosition === "right" && iconEl}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={classes}
      {...rest}
    >
      {iconEl && iconPosition === "left" && iconEl}
      {children}
      {iconEl && iconPosition === "right" && iconEl}
    </button>
  );
}

export type IconButtonTone = "primary" | "neutral" | "danger";

const ICON_TONE_CLASS: Record<IconButtonTone, string> = {
  primary: "border border-primary/15 bg-primary/10 text-primary hover:border-primary/25 hover:bg-primary/15",
  neutral: "border border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  danger: "border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
};

const ICON_BUTTON_SIZE_CLASS: Record<"sm" | "md", string> = {
  md: "p-2",
  sm: "p-1.5",
};

const ICON_SIZE_CLASS: Record<"sm" | "md", string> = {
  md: "h-4 w-4",
  sm: "h-3.5 w-3.5",
};

export interface IconButtonProps {
  icon: IconComponent;
  title: string;
  tone?: IconButtonTone;
  size?: "sm" | "md";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  tooltipSide?: "top" | "bottom" | "right";
}

export function IconButton({
  icon: Icon,
  title,
  tone = "neutral",
  size = "md",
  href,
  onClick,
  disabled = false,
  className = "",
  tooltipSide = "top",
}: IconButtonProps) {
  const classes = [
    "inline-flex shrink-0 items-center justify-center rounded-lg transition-all duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
    ICON_TONE_CLASS[tone],
    ICON_BUTTON_SIZE_CLASS[size],
    className,
  ].filter(Boolean).join(" ");

  if (href && !disabled) {
    return (
      <Tooltip label={title} side={tooltipSide}>
        <Link href={href} aria-label={title} className={classes}>
          <Icon className={ICON_SIZE_CLASS[size]} />
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={title} side={tooltipSide}>
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={classes}
      >
        <Icon className={ICON_SIZE_CLASS[size]} />
      </button>
    </Tooltip>
  );
}
