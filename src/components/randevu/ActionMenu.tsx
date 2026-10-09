"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { useOutsideClick } from "@/lib/use-outside-click";
import { useEscapeClose } from "@/lib/use-modal-dismiss";

export type ActionMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  /** Öğenin altında küçük açıklama (ör. neden pasif olduğu). */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
};

type ActionMenuProps = {
  label: string;
  items: ActionMenuItem[];
  icon?: ComponentType<{ className?: string }>;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Menü düğmenin sağ kenarına mı sol kenarına mı hizalansın. */
  align?: "start" | "end";
};

const MENU_WIDTH = 248;

/**
 * İkincil eylemler için açılır menü. Menü document.body'ye (portal) çizilir;
 * böylece araç çubuğunun taşma/kırpma kurallarından etkilenmez (önceki
 * "Dışa Aktar" menüsü araç çubuğunun içinde kırpılıp tıklanamıyordu).
 * Dışarı tıklama ve Escape ile kapanır; ok tuşlarıyla gezilir.
 */
export function ActionMenu({ label, items, icon, variant = "secondary", size = "md", align = "end" }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(triggerRef, close, open);
  useEscapeClose(close, open);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth;
    const width = Math.min(MENU_WIDTH, viewportWidth - 16);
    const preferredLeft = align === "end" ? rect.right - width : rect.left;
    const left = Math.max(8, Math.min(preferredLeft, viewportWidth - width - 8));
    setPosition({ top: rect.bottom + 6, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    });
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.cancelAnimationFrame(frame);
    };
  }, [open, place]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || []);
    if (buttons.length === 0) return;
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={triggerRef} className="relative inline-flex">
      <Button
        variant={variant}
        size={size}
        icon={icon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </Button>
      {open && position && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-outside-click-ignore
          onKeyDown={onMenuKeyDown}
          style={{ top: position.top, left: position.left, width: Math.min(MENU_WIDTH, window.innerWidth - 16) }}
          className="ui-popover fixed z-[320] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition-colors focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${item.danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block font-semibold">{item.label}</span>
                  {item.hint && <span className="mt-0.5 block text-xs font-normal text-slate-500">{item.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
