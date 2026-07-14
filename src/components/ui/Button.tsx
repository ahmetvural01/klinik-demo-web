"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary/90 font-bold disabled:opacity-60",
  secondary: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold disabled:opacity-60",
  danger: "bg-red-600 text-white hover:bg-red-700 font-bold disabled:opacity-60",
  ghost: "text-slate-600 hover:bg-slate-100 font-semibold disabled:opacity-40",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm rounded-lg",
  sm: "h-9 px-3 text-xs rounded-lg",
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
    "inline-flex items-center justify-center gap-2 transition",
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
  primary: "bg-primary/10 text-primary hover:bg-primary hover:text-white",
  neutral: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  danger: "bg-red-50 text-red-600 hover:bg-red-100",
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
    "inline-flex shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40",
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
