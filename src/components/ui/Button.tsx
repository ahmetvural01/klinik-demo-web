"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-gradient-to-r from-primary via-primary to-primary-strong text-white shadow-[0_8px_24px_rgba(13,125,111,0.18)] hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(13,125,111,0.22)] font-bold disabled:opacity-60",
  secondary: "border border-primary/15 bg-primary/[0.035] text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.04)] hover:border-primary/25 hover:bg-primary/[0.06] hover:text-slate-900 font-semibold disabled:opacity-60",
  danger: "border border-transparent bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_8px_24px_rgba(220,38,38,0.18)] hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(220,38,38,0.22)] font-bold disabled:opacity-60",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold disabled:opacity-40",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm rounded-xl",
  sm: "h-9 px-3 text-xs rounded-xl",
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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-0",
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
  primary: "border border-primary/15 bg-primary/10 text-primary hover:bg-primary hover:text-white hover:shadow-[0_10px_22px_rgba(13,125,111,0.16)]",
  neutral: "border border-primary/12 bg-primary/[0.03] text-slate-600 shadow-[0_6px_16px_rgba(15,23,42,0.04)] hover:bg-primary/[0.06] hover:text-slate-900",
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
}: IconButtonProps) {
  const classes = [
    "inline-flex shrink-0 items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
    ICON_TONE_CLASS[tone],
    ICON_BUTTON_SIZE_CLASS[size],
    className,
  ].filter(Boolean).join(" ");

  if (href && !disabled) {
    return (
      <Link href={href} title={title} aria-label={title} className={classes}>
        <Icon className={ICON_SIZE_CLASS[size]} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={classes}
    >
      <Icon className={ICON_SIZE_CLASS[size]} />
    </button>
  );
}
