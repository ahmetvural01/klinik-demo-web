"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type DisclosureProps = {
  /** Katlanır bölümün başlığı ("Diğer bilgiler" — sözleşme §3: katlanır bölümün tek adı). */
  title: ReactNode;
  /** Kapalıyken başlığın yanında görünen kısa özet ("2 alan dolu"). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Dışarıdan kontrol (ör. hatalı alan varsa açık tut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * Formlarda seyrek kullanılan/isteğe bağlı alanları katlayan bölüm: önce
 * gerekli alanlar, ayrıntılar "Diğer bilgiler" altında. İçerik kapalıyken de
 * DOM'da kalır (yazılan değerler kaybolmaz), yalnız gizlenir. Elle yazılmış
 * `<details>` ve "Daha fazla göster" düğmelerinin yerine geçer.
 */
export function Disclosure({ title, summary, defaultOpen = false, open, onOpenChange, children, className = "" }: DisclosureProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const contentId = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div className={`ui-disclosure rounded-[var(--radius-surface)] border border-slate-200 ${className}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-surface)] px-3.5 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          {title}
          {summary && !isOpen && <span className="text-xs font-normal text-slate-500">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={contentId} hidden={!isOpen} className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
        {children}
      </div>
    </div>
  );
}
