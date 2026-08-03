"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentType } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";

type IconComponent = ComponentType<{ className?: string }>;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border border-primary-800/25 bg-primary text-white shadow-[0_1px_1px_rgb(255_255_255/0.18)_inset,0_2px_5px_rgb(var(--app-primary)/0.18)] hover:bg-primary-800 hover:shadow-[0_1px_1px_rgb(255_255_255/0.18)_inset,0_5px_12px_rgb(var(--app-primary)/0.22)] font-bold disabled:opacity-55",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-[0_3px_8px_rgb(15_23_42/0.08)] font-semibold disabled:opacity-55",
  danger: "border border-red-700/20 bg-red-600 text-white shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,0_2px_5px_rgb(220_38_38/0.16)] hover:bg-red-700 hover:shadow-[0_5px_12px_rgb(220_38_38/0.2)] font-bold disabled:opacity-55",
  ghost: "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold disabled:opacity-40",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm rounded-md",
  sm: "h-8 px-3 text-xs rounded-md",
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
    <Spinner className="h-4 w-4 shrink-0" />
  ) : Icon ? (
    <Icon className="h-4 w-4 shrink-0" />
  ) : null;

  const classes = [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed",
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
    "inline-flex shrink-0 items-center justify-center rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
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
