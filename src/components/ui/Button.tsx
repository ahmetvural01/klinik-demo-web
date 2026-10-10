"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type MouseEventHandler, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";
import { CountBadge, type CountBadgeTone } from "@/components/ui/CountBadge";

type IconComponent = ComponentType<{ className?: string }>;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border border-primary-800/25 bg-primary text-white shadow-[0_1px_1px_rgb(255_255_255/0.18)_inset,0_2px_5px_rgb(var(--app-primary)/0.18)] hover:bg-primary-800 hover:shadow-[0_1px_1px_rgb(255_255_255/0.18)_inset,0_5px_12px_rgb(var(--app-primary)/0.22)] font-semibold disabled:opacity-50",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-[0_3px_8px_rgb(15_23_42/0.08)] font-semibold disabled:opacity-50",
  danger: "border border-red-700/20 bg-red-600 text-white shadow-[0_1px_1px_rgb(255_255_255/0.16)_inset,0_2px_5px_rgb(220_38_38/0.16)] hover:bg-red-700 hover:shadow-[0_5px_12px_rgb(220_38_38/0.2)] font-semibold disabled:opacity-50",
  ghost: "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold disabled:opacity-50",
  // Nadir/tehlikeli İKİNCİL eylem (Arşivle, Planı iptal et): pencere altında
  // solda durur, dolu kırmızı düğme gibi "ana eylem" görünmez. Önceden ghost +
  // elle `!text-red-600` sınıflarıyla yazılıyordu.
  "danger-ghost": "border border-transparent text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold disabled:opacity-50",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm rounded-md",
  // sm 36px: panel tabanı (.panel-content button) dışında da — pencere, çekmece ve
  // bağlantı (<a>) düğmeleri satırdaki IconButton sm ve ActionMenu "…" ile aynı boyda.
  sm: "h-9 px-3 text-xs rounded-md",
};

/** Next yönlendirmesi yerine düz <a> gereken bağlantılar (dış site, WhatsApp, arama, e-posta). */
const EXTERNAL_HREF = /^(https?:|tel:|mailto:|sms:|whatsapp:|\/\/)/i;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  iconPosition?: "left" | "right";
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Verilirse düğme bağlantı olur. Uygulama içi yol Next Link ile; dış adres
   * (http/https, wa.me, tel:, mailto:) düz <a> ile açılır.
   */
  href?: string;
  /** Bağlantının açılacağı yer ("_blank": yeni sekme; rel kendiliğinden "noopener noreferrer"). */
  target?: string;
  rel?: string;
  /**
   * Etiketin yanında küçük sayaç ("Bekleyenler 3") — ortak CountBadge.
   * 0/undefined gösterilmez; 99'dan büyükse "99+".
   */
  count?: number;
  countTone?: CountBadgeTone;
  /** Sayacın neyi saydığı ("bekleyen talep") — ekran okuyucu "3 bekleyen talep" duyar. */
  countLabel?: string;
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
  target,
  rel,
  count,
  countTone = "neutral",
  countLabel,
  ...rest
}: ButtonProps) {
  const iconEl = loading ? (
    <Spinner className="h-4 w-4 shrink-0" />
  ) : Icon ? (
    <Icon className="h-4 w-4 shrink-0" />
  ) : null;

  const classes = [
    "ui-button-premium relative isolate overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? "w-full" : "",
    className,
  ].filter(Boolean).join(" ");

  // Dolu (renkli) düğmede zeminle aynı renge karışan sayaç beyaz yarı saydam olur.
  const solid = variant === "primary" || variant === "danger";
  const blendsIn = countTone === "neutral" || countTone === "info" || (variant === "danger" && countTone === "critical");
  const countEl = count ? (
    <>
      {" "}
      <CountBadge count={count} tone={countTone} label={countLabel} className={solid && blendsIn ? "!bg-white/25 !text-white" : ""} />
    </>
  ) : null;

  const content = (
    <>
      {iconEl && iconPosition === "left" && iconEl}
      {children}
      {countEl}
      {iconEl && iconPosition === "right" && iconEl}
    </>
  );

  if (href && !disabled && !loading) {
    // Bağlantıda da ekran okuyucu adı, ipucu ve tıklama (ör. kayıt düşme)
    // korunur; önceden href verilince bunlar sessizce düşüyordu.
    const linkProps = {
      id: rest.id,
      title: rest.title,
      "aria-label": rest["aria-label"],
      onClick: rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement> | undefined,
      target,
      rel: rel ?? (target === "_blank" ? "noopener noreferrer" : undefined),
    };
    // "wa.me/905..." şemasız yazılırsa uygulama içi yol sanılıp kırık açılırdı.
    const externalHref = /^wa\.me\//i.test(href) ? `https://${href}` : href;
    if (EXTERNAL_HREF.test(externalHref)) {
      return <a href={externalHref} className={classes} {...linkProps}>{content}</a>;
    }
    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
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
      {content}
    </button>
  );
}

export type IconButtonTone = "primary" | "neutral" | "danger" | "ghost";

const ICON_TONE_CLASS: Record<IconButtonTone, string> = {
  primary: "border border-primary/15 bg-primary/10 text-primary hover:border-primary/25 hover:bg-primary/15",
  neutral: "border border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  danger: "border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
  // Kenarlıksız (üst bar, menü, şifre göster/gizle, satır eylemi): zemin yalnız üzerine gelince.
  ghost: "border border-transparent bg-transparent text-slate-500 !shadow-none hover:bg-slate-100 hover:text-slate-900",
};
// Liste satırında (ListTable tablo hücresi ve telefon kartı) her ton çerçevesiz
// ve zeminsiz çizilir, rengini korur (sadelik K3; globals.css `[data-tone]`):
// satır başına 2–3 kutulu ikon kalabalığı oluşmaz. Ton `data-tone` ile işaretlenir.

// Satırda "Geldi" (Button sm) + ✎ (IconButton) + … (ActionMenu) aynı hizada
// dursun: panelde Button sm 36px, md 40px — ikon düğmeleri de aynı ölçüde.
const ICON_BUTTON_SIZE_CLASS: Record<"sm" | "md", string> = {
  md: "h-10 w-10",
  sm: "h-9 w-9",
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
  /** Açılır pencere/menü tetikleyicisi için (aria-expanded, aria-controls, aria-haspopup). */
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-haspopup"?: "menu" | "listbox" | "dialog" | "true";
  /** İkonun yanında köşe rozeti gibi ek içerik (ör. `<CountBadge placement="corner" />`). */
  children?: ReactNode;
}

/**
 * Kare ikon düğmesi; adı (`title`) ekran okuyucuya ve ipucu balonuna gider.
 * `ref` yalnız düğme biçiminde (href'siz) bağlanır — açılır menüye odak
 * döndürmek için.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  icon: Icon,
  title,
  tone = "neutral",
  size = "md",
  href,
  onClick,
  disabled = false,
  className = "",
  tooltipSide = "top",
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
  "aria-haspopup": ariaHaspopup,
  children,
}, ref) {
  const classes = [
    "ui-icon-button-premium inline-flex shrink-0 items-center justify-center rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
    ICON_TONE_CLASS[tone],
    ICON_BUTTON_SIZE_CLASS[size],
    className,
  ].filter(Boolean).join(" ");

  if (href && !disabled) {
    return (
      <Tooltip label={title} side={tooltipSide}>
        <Link href={href} aria-label={title} data-tone={tone} className={classes}>
          <Icon className={ICON_SIZE_CLASS[size]} />
          {children}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={title} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={title}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-haspopup={ariaHaspopup}
        disabled={disabled}
        onClick={onClick}
        data-tone={tone}
        className={classes}
      >
        <Icon className={ICON_SIZE_CLASS[size]} />
        {children}
      </button>
    </Tooltip>
  );
});
