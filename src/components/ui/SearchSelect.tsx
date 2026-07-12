"use client";

import { useState } from "react";

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

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{emptyText || "Sonuç bulunamadı"}</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
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
