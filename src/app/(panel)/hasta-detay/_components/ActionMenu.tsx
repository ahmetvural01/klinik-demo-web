"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type ActionMenuItem = {
  key: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  onSelect?: () => void;
};

/**
 * Hasta dosyasının "İşlem ekle" menüsü: bu hasta için yapılabilecek bütün
 * işlemler tek yerde (randevu, tahsilat, tedavi, lab işi, reçete, not...).
 * Ok tuşları ile gezilir, Esc veya dışarı tıklama kapatır.
 */
export function ActionMenu({ items, label = "İşlem ekle" }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const elements = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") || []);
    const index = elements.findIndex((element) => element === document.activeElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? elements.length - 1
        : event.key === "ArrowDown" ? (index + 1) % elements.length
          : (index - 1 + elements.length) % elements.length;
    elements[next]?.focus();
  };

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="secondary"
        icon={Plus}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                  {item.description && <span className="block text-xs text-slate-500">{item.description}</span>}
                </span>
              </>
            );
            const className = "flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";
            return item.href ? (
              <Link key={item.key} href={item.href} role="menuitem" className={className} onClick={() => setOpen(false)}>{content}</Link>
            ) : (
              <button key={item.key} type="button" role="menuitem" className={className} onClick={() => { setOpen(false); item.onSelect?.(); }}>{content}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
