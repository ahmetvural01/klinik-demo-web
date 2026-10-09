"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> & {
  value: string;
  onChange: (value: string) => void;
  /** Ekranda görünen ipucu; ekran okuyucu adı verilmezse bu kullanılır. */
  placeholder: string;
  /** "/" tuşu ile bu kutuya odaklanılsın mı (sayfanın ana araması için). */
  slashShortcut?: boolean;
  size?: "sm" | "md";
  /** Kutunun dış sarmalayıcısına eklenecek sınıf (genişlik vb.). */
  wrapperClassName?: string;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Uygulama genelinde TEK arama kutusu görünümü: solda büyüteç, yazı varken
 * sağda temizle (×) düğmesi. Escape yazıyı temizler. Önceden her liste kendi
 * arama kutusunu farklı yükseklik/ikon/yer tutucu ile yazıyordu.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder, slashShortcut = false, size = "md", wrapperClassName = "", className = "", "aria-label": ariaLabel, onKeyDown, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  useEffect(() => {
    if (!slashShortcut) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector(".ui-modal-panel")) return;
      event.preventDefault();
      innerRef.current?.focus();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [slashShortcut]);

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        ref={innerRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
          onKeyDown?.(event);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        data-dirty-ignore
        className={`ui-control ${size === "sm" ? "ui-control-sm" : ""} ui-search-input pl-9 ${value ? "pr-9" : ""} ${className}`}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            innerRef.current?.focus();
          }}
          aria-label="Aramayı temizle"
          className="ui-search-clear absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
