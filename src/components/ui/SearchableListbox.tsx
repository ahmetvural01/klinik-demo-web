"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, ChevronDown, Search, X } from "lucide-react";
import { useOutsideClick } from "@/lib/use-outside-click";

export type SearchableListboxOption = {
  id: string;
  label: string;
  meta?: string;
  keywords?: string;
};

type SearchableListboxProps = {
  options: SearchableListboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allSelectedLabel?: string;
  selectedLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
};

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

export function SearchableListbox({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Seçim yapın",
  searchPlaceholder = "Listede ara",
  emptyText = "Sonuç bulunamadı",
  allSelectedLabel = "Tümü seçildi",
  selectedLabel = "seçim",
  loading = false,
  disabled = false,
  onOpen,
}: SearchableListboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  useOutsideClick(rootRef, () => setOpen(false), open);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.has(option.id)),
    [options, selectedIds],
  );
  const allSelected = options.length > 0 && selectedOptions.length === options.length;
  const normalizedQuery = normalizeSearch(query);
  const filteredOptions = useMemo(() => (
    normalizedQuery
      ? options.filter((option) => normalizeSearch(`${option.label} ${option.meta || ""} ${option.keywords || ""}`).includes(normalizedQuery))
      : options
  ), [normalizedQuery, options]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const summary = loading
    ? "Yükleniyor..."
    : allSelected && multiple
      ? `${allSelectedLabel} (${options.length})`
      : selectedOptions.length === 0
        ? placeholder
        : !multiple || selectedOptions.length === 1
          ? selectedOptions[0].label
          : `${selectedOptions.length} ${selectedLabel}`;

  const toggleOption = (optionId: string) => {
    if (!multiple) {
      onChange([optionId]);
      setOpen(false);
      return;
    }
    onChange(selectedIds.has(optionId) ? value.filter((id) => id !== optionId) : [...value, optionId]);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => {
          if (!current) onOpen?.();
          return !current;
        })}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-700 outline-none transition-colors hover:border-slate-300 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selectedOptions.length === 0 ? "text-slate-400" : "font-medium text-slate-800"}`}>{summary}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="ui-popover absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] overflow-hidden p-0 shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                  if (event.key === "Enter" && !multiple && filteredOptions.length === 1) {
                    event.preventDefault();
                    toggleOption(filteredOptions[0].id);
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {multiple && options.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button type="button" onClick={() => onChange(options.map((option) => option.id))} disabled={allSelected} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark disabled:cursor-default disabled:opacity-45">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Tümünü seç
                </button>
                <button type="button" onClick={() => onChange([])} disabled={value.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:cursor-default disabled:opacity-45">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Temizle
                </button>
              </div>
            )}
          </div>

          <div id={listboxId} role="listbox" aria-multiselectable={multiple || undefined} className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-5 text-center text-xs text-slate-400">{emptyText}</p>
            ) : filteredOptions.map((option) => {
              const selected = selectedIds.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleOption(option.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-slate-50"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${multiple ? "rounded" : "rounded-full"} ${selected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}>
                    {selected && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{option.label}</span>
                    {option.meta && <span className="block truncate text-xs text-slate-400">{option.meta}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
