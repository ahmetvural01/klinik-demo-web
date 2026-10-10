"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { COUNTRY_CODES } from "@/lib/country-codes";
import { useOutsideClick } from "@/lib/use-outside-click";

type PhoneCountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
};

type Country = (typeof COUNTRY_CODES)[number];

// Türkiye en üstte, ardından kliniklerde en sık görülen yabancı numaralar;
// kalanlar alfabetik. Önceden liste rastgele sıradaydı (Türkiye'nin hemen
// altında Afganistan, Arnavutluk, Cezayir…).
const FREQUENT = ["+90", "+49", "+31", "+44", "+994", "+964", "+963", "+7", "+33", "+1", "+971"];

function orderCountries(list: readonly Country[]): Country[] {
  const rank = (item: Country) => {
    const index = FREQUENT.indexOf(item.code);
    return index === -1 ? FREQUENT.length : index;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "tr"));
}

const ORDERED = orderCountries(COUNTRY_CODES);

/**
 * Telefon alanının ülke kodu seçicisi (bayrak + kod). Liste gövdeye çizilir;
 * arama kutusu ve ok tuşlarıyla gezilir. Esc YALNIZ listeyi kapatır: önceden
 * olay yukarı kabardığı için içinde bulunduğu hasta formunu da kapatıyor,
 * yazılan bilgiler kayboluyordu (denetim C3/F2).
 */
export function PhoneCountrySelect({ value, onChange, className = "", disabled = false, id }: PhoneCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320 });
  const selected = COUNTRY_CODES.find((item) => item.code === value) ?? COUNTRY_CODES[0];
  const options = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return ORDERED;
    return ORDERED.filter((item) => `${item.name} ${item.code} ${item.keywords || ""}`.toLocaleLowerCase("tr-TR").includes(term));
  }, [query]);

  const close = (focusTrigger = true) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  useOutsideClick(rootRef, () => { setOpen(false); setQuery(""); }, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Pencerenin (Modal) Esc dinleyicisi window'da; olay oraya ulaşmasın.
      event.stopPropagation();
      event.preventDefault();
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
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
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

  const focusOption = (index: number) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") || []);
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") || []);
    const current = items.findIndex((item) => item === document.activeElement);
    if (event.key === "Home") focusOption(0);
    else if (event.key === "End") focusOption(items.length - 1);
    else if (event.key === "ArrowDown") focusOption(current + 1);
    else focusOption(current <= 0 ? items.length - 1 : current - 1);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ülke kodu: ${selected.name} ${selected.code}`}
        // Numara kutusunun yanında ayrı, aynı görünümlü kontrol (ortak .ui-control).
        className="ui-control flex !min-h-10 items-center gap-1.5 !px-2.5 text-left font-semibold text-slate-700"
      >
        <span aria-hidden="true" className={`fi fi-${selected.iso} shrink-0 rounded-[1px]`} />
        <span className="min-w-0 flex-1 truncate tabular-nums">{selected.code}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          data-outside-click-ignore
          // Liste gövdenin sonunda: Tab'da kapanıp odak tetikleyiciye döner, tarayıcı
          // oradan sıradaki alana geçer. Yoksa odak pencerenin arkasındaki sayfaya kaçıyordu.
          onKeyDown={(event) => { if (event.key === "Tab") close(true); }}
          className="fixed z-[var(--z-popover)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-floating)]"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          <div className="border-b border-slate-100 p-2">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2.5 text-slate-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); focusOption(0); }
                  else if (event.key === "Enter" && options.length > 0) { event.preventDefault(); onChange(options[0].code); close(); }
                }}
                placeholder="Ülke veya kod ara"
                aria-label="Ülke veya kod ara"
                data-dirty-ignore
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
              />
            </label>
          </div>
          <div ref={listRef} role="listbox" aria-label="Ülke kodları" onKeyDown={onListKeyDown} className="max-h-56 overflow-y-auto p-1.5">
            {options.map((item) => (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={item.code === value}
                onClick={() => { onChange(item.code); close(); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${item.code === value ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"}`}
              >
                <span aria-hidden="true" className={`fi fi-${item.iso} shrink-0 rounded-[1px]`} />
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="font-mono text-xs text-slate-500">{item.code}</span>
                {item.code === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
            {options.length === 0 && <p className="px-2.5 py-3 text-sm text-slate-500">Ülke bulunamadı.</p>}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
