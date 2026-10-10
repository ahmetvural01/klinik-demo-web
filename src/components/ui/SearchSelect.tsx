"use client";

import { useId, useState } from "react";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";

type SearchOption = {
  id: string;
  label: string;
  meta?: string;
};

export function SearchSelect({
  query,
  onQueryChange,
  options,
  onSelect,
  placeholder,
  className = "ui-control",
  emptyText,
  loading = false,
  error,
  onRetry,
  id,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchOption[];
  onSelect: (option: SearchOption) => void;
  placeholder?: string;
  /** Giriş kutusunun sınıfı. Varsayılan ortak alan görünümü "ui-control". */
  className?: string;
  emptyText?: string;
  loading?: boolean;
  /**
   * Arama hatası: listenin üstünde gösterilir; verilen seçenekler (ör.
   * "+ Yeni hasta ekle") altında seçilebilir kalır.
   */
  error?: string;
  /** Verilirse hata satırında "Tekrar dene" çıkar (Enter da yeniden dener). */
  onRetry?: () => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** Zorunlu alan: ekran okuyucu "zorunlu" duyar (FormField bileşik alanda bunu kendisi ekleyemez). */
  "aria-required"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const selectOption = (option: SearchOption) => {
    onSelect(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="relative">
      <input
        id={id}
        // Yer tutucu ad olarak verilmez: FormField etiketini ("Laboratuvar") ezip
        // alanı "Laboratuvar adı yazın…" diye adlandırıyordu. Etiketsiz kullanımda
        // tarayıcı yer tutucuyu zaten ad sayar.
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired || undefined}
        data-dirty-ignore
        value={query}
        disabled={disabled}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (!open) return;
            setOpen(false);
            setActiveIndex(-1);
            // Yalnız bir şey yazılmışken açık liste Esc'i kendisi kullanır. Odakla
            // kendiliğinden açılan boş liste ilk Esc'i yutmasın; Esc içinde
            // bulunduğu pencereye ulaşsın (Modal sözleşmesi, canlı B12).
            if (query.trim()) {
              event.preventDefault();
              event.stopPropagation();
            }
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(options.length - 1, current + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
            event.preventDefault();
            selectOption(options[activeIndex]);
          } else if (event.key === "Enter" && open && error && onRetry && !loading) {
            event.preventDefault();
            onRetry();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-busy={loading}
        aria-invalid={Boolean(error)}
        className={className}
      />
      {open && !disabled && (
        <div className="ui-popover absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto py-1">
          {loading ? (
            <p role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Aranıyor...
            </p>
          ) : (
            <>
              {/* Hata satırı seçenekleri gizlemez: arama başarısızken de
                  "+ Yeni hasta ekle" seçilebilir (canlı H8, B12). */}
              {error && (
                <div role="alert" className="flex items-start justify-between gap-2 px-3 py-2 text-xs text-red-600">
                  <span className="flex min-w-0 items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{error}</span>
                  </span>
                  {onRetry && (
                    <button
                      type="button"
                      // Odak kutuda kalsın: liste kapanmasın, yeniden arama sonucu görünsün.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={onRetry}
                      className="ui-touch-target inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-red-700 !min-h-0 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Tekrar dene
                    </button>
                  )}
                </div>
              )}
              {options.length === 0 ? (
                !error && <p className="px-3 py-2 text-xs text-slate-500">{emptyText || "Sonuç bulunamadı"}</p>
              ) : (
                <div id={listboxId} role="listbox" className={error ? "border-t border-slate-100" : undefined}>
                  {options.map((option, index) => (
                    <button
                      key={option.id}
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                      className={`block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors ${index === activeIndex ? "bg-primary/5" : "hover:bg-slate-50"}`}
                    >
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.meta && <span className="block truncate text-xs text-slate-500">{option.meta}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
