"use client";

import { useId, useState } from "react";

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
  className,
  emptyText,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchOption[];
  onSelect: (option: SearchOption) => void;
  placeholder?: string;
  className?: string;
  emptyText?: string;
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
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
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
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        className={className}
      />
      {open && (
        <div id={listboxId} role="listbox" className="ui-popover absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{emptyText || "Sonuç bulunamadı"}</p>
          ) : (
            options.map((option, index) => (
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
                {option.meta && <span className="block truncate text-xs text-slate-400">{option.meta}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
