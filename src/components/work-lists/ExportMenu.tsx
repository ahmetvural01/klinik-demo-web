"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/lib/use-outside-click";

export type ExportMenuItem = {
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
};

/**
 * Liste araç çubuğunun sağındaki tek "Dışa aktar" düğmesi. Önceden başlıkta
 * ayrı "PDF" ve "Excel" düğmeleri birincil eylemin yanında yer kaplıyordu.
 */
export function ExportMenu({ items, label = "Dışa aktar" }: { items: ExportMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useOutsideClick(rootRef, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="secondary"
        size="sm"
        icon={Download}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[var(--shadow-floating)]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  void item.onSelect();
                }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                  {item.description && <span className="block text-xs text-slate-500">{item.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
