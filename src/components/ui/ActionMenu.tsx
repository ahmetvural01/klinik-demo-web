"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MoreHorizontal } from "lucide-react";

type IconComponent = ComponentType<{ className?: string }>;

export type ActionMenuItem = {
  key: string;
  label: string;
  /** Menü öğesinin altında kısa açıklama (isteğe bağlı). */
  description?: string;
  /** `description` ile aynı (eski randevu menüsü API'siyle uyum için). */
  hint?: string;
  icon?: IconComponent;
  href?: string;
  onSelect?: () => void;
  /** Geri alınamaz/riskli eylem (arşivle, iptal et) — kırmızı ve en sonda. */
  danger?: boolean;
  disabled?: boolean;
  /** Pasifse nedeni: öğenin altında yazar (dokunmatikte de görünür), ekran okuyucu da duyar. */
  disabledReason?: string;
  /** Öncesine ayırıcı çizgi koy. */
  separatorBefore?: boolean;
};

type ActionMenuProps = {
  items: ActionMenuItem[];
  /**
   * "icon": satır sonundaki çerçevesiz "…" düğmesi (ekran okuyucu adı `label`).
   * "button": görünür etiketli ikincil düğme ("İşlem ekle ▾").
   */
  trigger?: "icon" | "button";
  label?: string;
  /** "button" tetikleyicide etiketin solundaki ikon. */
  icon?: IconComponent;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  align?: "start" | "end";
  /**
   * "button" tetikleyicide telefonda (<640px) yalnız ikon görünür (kare
   * düğme); etiket ekran okuyucu için kalır. `icon` ile birlikte verin.
   */
  iconOnlyOnMobile?: boolean;
  className?: string;
};

/**
 * Ortak eylem menüsü (açılır menü). Satır ve sayfa eylemlerinde "en sık iki
 * eylem görünür, kalanlar menüde" kuralını uygular. Menü gövdeye taşınır
 * (portal) — tablo/kart taşmasında kırpılmaz. Ok tuşları/Home/End ile
 * gezilir, Esc ve dışarı tıklama kapatır, odak tetikleyiciye döner.
 */
export function ActionMenu({
  items,
  trigger = "icon",
  label = "Diğer işlemler",
  icon: TriggerIcon,
  variant = "secondary",
  size = "sm",
  align = "end",
  iconOnlyOnMobile = false,
  className = "",
}: ActionMenuProps) {
  const visible = items.filter(Boolean);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = menuRef.current?.offsetWidth || 220;
    const menuHeight = menuRef.current?.offsetHeight || 0;
    const gap = 6;
    let left = align === "end" ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    let top = rect.bottom + gap;
    if (menuHeight && top + menuHeight > window.innerHeight - 8 && rect.top - gap - menuHeight > 8) {
      top = rect.top - gap - menuHeight;
    }
    setPosition({ top, left, minWidth: Math.max(rect.width, 200) });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // İlk yerleşimden sonra menünün gerçek ölçüsüyle bir kez daha hizala.
    const frame = window.requestAnimationFrame(() => {
      place();
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    // Esc yalnız menüyü kapatır: olay durdurulmazsa window'daki Modal dinleyicisine
    // ulaşıp menünün içinde durduğu pencereyi (ve kirli formu) da kapatıyordu.
    // preventDefault, aynı document'taki Drawer dinleyicisine "kullanıldı" der.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    // Kaydırmada kapatmak yerine tetikleyiciye yeniden hizalanır: tıklamadan
    // hemen önceki kaydırmanın gecikmeli "scroll" olayı menüyü açılır açılmaz
    // kapatıyordu (dokunmatik/ivmeli kaydırmada da olur).
    const onScroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) place(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [close, open, place]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Tab: menü kapanır ve odak tetikleyiciye döner; tarayıcının Tab adımı
    // oradan sıradaki öğeye geçer (WAI-ARIA menü düğmesi). Odak tetikleyiciye
    // dönmezse gövdenin sonundaki menüden sayfanın başına (pencere içindeyse
    // pencerenin arkasına) kaçıyordu.
    if (event.key === "Tab") { close(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    // Pasif öğeler de oklarla gezilir (seçilemez): ekran okuyucu kullanıcısı
    // öğenin varlığını ve pasif olma nedenini ancak böyle duyar (WAI-ARIA).
    const elements = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") || []);
    if (elements.length === 0) return;
    const index = elements.findIndex((element) => element === document.activeElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? elements.length - 1
        : event.key === "ArrowDown" ? (index + 1) % elements.length
          : (index - 1 + elements.length) % elements.length;
    elements[next]?.focus();
  };

  if (visible.length === 0) return null;

  // `.panel-content button { min-height: 36px }` kare ikon düğmesini bozmasın.
  // "…" tetikleyicisi ÇERÇEVESİZ (sadelik K3): satırda/kartta kutu kalabalığı
  // yapmaz; zemin yalnız üzerine gelince ve menü açıkken belirir. Liste
  // satırında (ListTable) 32px'e iner (globals.css).
  const triggerClass = trigger === "icon"
    ? `ui-icon-button-premium inline-flex shrink-0 items-center justify-center rounded-md border border-transparent text-slate-500 !min-h-0 !shadow-none hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${open ? "bg-slate-100 text-slate-900" : "bg-transparent"} ${size === "sm" ? "h-9 w-9" : "h-10 w-10"}`
    // sm, Button sm ile aynı 36px: pencere ve çekmecede de (panel tabanı dışında) satırdaki düğmelerle hizalı.
    : `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${size === "sm" ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm"} ${variant === "primary" ? "border-primary-800/25 bg-primary text-white hover:bg-primary-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`;
  // Telefonda kare ikon düğmesi (üst bardaki "Yeni" gibi): etiket görsel olarak gizlenir, adı kalır.
  const iconOnly = trigger === "button" && iconOnlyOnMobile && Boolean(TriggerIcon);
  const iconOnlyClass = iconOnly ? `max-sm:gap-0 max-sm:px-0 ${size === "sm" ? "max-sm:w-9" : "max-sm:w-10"}` : "";

  const itemClass = (item: ActionMenuItem) => [
    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-none",
    item.disabled ? "cursor-not-allowed text-slate-700 focus-visible:bg-slate-100" : item.danger ? "text-red-700 hover:bg-red-50 focus-visible:bg-red-50" : "text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100",
  ].join(" ");

  // Pasif öğede ad ve ikon soluklaşır; neden (disabledReason) soluklaşmadan
  // altında yazar — `title` dokunmatikte hiç görünmüyordu (sözleşme §0.3).
  const content = (item: ActionMenuItem) => (
    <>
      {item.icon && <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.danger ? "text-red-600" : "text-slate-500"} ${item.disabled ? "opacity-50" : ""}`} />}
      <span className="min-w-0">
        <span className={`block font-semibold ${item.disabled ? "opacity-50" : ""}`}>{item.label}</span>
        {(item.description || item.hint) && <span className={`mt-0.5 block text-xs font-normal text-slate-500 ${item.disabled ? "opacity-50" : ""}`}>{item.description || item.hint}</span>}
        {item.disabled && item.disabledReason && <span className="mt-0.5 block text-xs font-medium text-amber-700">{item.disabledReason}</span>}
      </span>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger === "icon" ? label : undefined}
        title={trigger === "icon" ? label : undefined}
        data-tone={trigger === "icon" ? "ghost" : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`${triggerClass} ${iconOnlyClass} ${className}`}
      >
        {trigger === "icon" ? (
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        ) : (
          <>
            {TriggerIcon && <TriggerIcon className="h-4 w-4 shrink-0" />}
            {iconOnly ? <span className="max-sm:sr-only">{label}</span> : label}
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${iconOnly ? "max-sm:hidden" : ""}`} aria-hidden="true" />
          </>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          // Menü body'ye çizilir; açık bir açılır pencere/üst bar menüsü
          // (useOutsideClick) buradaki tıklamayı "dışarısı" sayıp kapanmasın.
          data-outside-click-ignore
          onKeyDown={onMenuKeyDown}
          style={{ position: "fixed", top: position?.top ?? -9999, left: position?.left ?? -9999, minWidth: position?.minWidth ?? 200 }}
          className="ui-popover z-[var(--z-menu)] max-h-[70vh] max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {visible.map((item) => (
            <div key={item.key}>
              {item.separatorBefore && <div className="my-1 border-t border-slate-100" role="separator" />}
              {item.href && !item.disabled ? (
                <Link href={item.href} role="menuitem" tabIndex={-1} className={itemClass(item)} onClick={() => close(false)}>
                  {content(item)}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  title={item.disabled ? item.disabledReason : undefined}
                  className={itemClass(item)}
                  onClick={() => {
                    if (item.disabled) return;
                    close(false);
                    item.onSelect?.();
                  }}
                >
                  {content(item)}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
