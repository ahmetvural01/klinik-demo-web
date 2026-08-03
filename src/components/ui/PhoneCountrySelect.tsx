"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COUNTRY_CODES } from "@/lib/country-codes";
import { useOutsideClick } from "@/lib/use-outside-click";

type PhoneCountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function PhoneCountrySelect({ value, onChange, className = "" }: PhoneCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320 });
  const selected = COUNTRY_CODES.find((item) => item.code === value) ?? COUNTRY_CODES[0];
  const options = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return COUNTRY_CODES;
    return COUNTRY_CODES.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase("tr-TR").includes(term));
  }, [query]);

  useOutsideClick(rootRef, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      setPosition({
        left: Math.min(rect.left, window.innerWidth - width - 16),
        top: Math.min(rect.bottom + 6, window.innerHeight - 280),
        width,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2 border-0 border-r border-slate-200 bg-slate-50 px-3 text-left text-sm font-semibold text-slate-700 outline-none transition hover:bg-primary/[0.04] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary/20"
      >
        <span aria-hidden="true" className={`fi fi-${selected.iso} shrink-0 rounded-[1px]`} />
        <span className="min-w-0 flex-1 truncate">{selected.code}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div data-outside-click-ignore className="fixed z-[330] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-floating)]" style={{ left: position.left, top: position.top, width: position.width }}>
          <div className="border-b border-slate-100 p-2">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2.5 text-slate-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="h-4 w-4" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ülke veya kod ara" className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none" />
            </label>
          </div>
          <div role="listbox" className="max-h-56 overflow-y-auto p-1.5">
            {options.map((item) => (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={item.code === value}
                onClick={() => { onChange(item.code); setOpen(false); setQuery(""); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${item.code === value ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <span aria-hidden="true" className={`fi fi-${item.iso} shrink-0 rounded-[1px]`} />
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="font-mono text-xs text-slate-500">{item.code}</span>
                {item.code === value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
            {options.length === 0 && <p className="px-2.5 py-3 text-sm text-slate-500">Ülke bulunamadı.</p>}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
