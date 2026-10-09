"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

export type ChoiceOption<V extends string = string> = {
  value: V;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Pasif seçeneğin neden seçilemediği (ör. "WhatsApp bağlı değil"). */
  disabledReason?: string;
};

type ChoiceCardsProps<V extends string> = {
  /** Grubun görünür adı (FormField yerine bunu kullanın). */
  label: string;
  options: ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** "cards": açıklamalı büyük seçenekler; "pills": kısa seçenekler (gün, kanal vb.). */
  variant?: "cards" | "pills";
  columns?: 1 | 2 | 3;
  className?: string;
};

/**
 * Birbirini dışlayan seçenekler (kanal önceliği, ödeme yöntemi, gün sayısı...)
 * için TEK görünüm: role="radiogroup", ok tuşlarıyla gezilir, pasif seçenek
 * nedenini söyler. Önceden her ekran kendi kart/çip/düğme grubunu yazıyordu.
 */
export function ChoiceCards<V extends string>({ label, options, value, onChange, variant = "cards", columns = 2, className = "" }: ChoiceCardsProps<V>) {
  const groupId = useId();
  const enabled = options.filter((option) => !option.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.value === value);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = enabled[(index + step + enabled.length) % enabled.length];
    onChange(next.value);
    document.getElementById(`${groupId}-${next.value}`)?.focus();
  };

  const grid = variant === "pills"
    ? "flex flex-wrap gap-2"
    : `grid gap-2 ${columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`;

  return (
    <div className={className}>
      <p id={`${groupId}-label`} className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">{label}</p>
      <div role="radiogroup" aria-labelledby={`${groupId}-label`} onKeyDown={onKeyDown} className={grid}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              id={`${groupId}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!value && option === enabled[0]) ? 0 : -1}
              disabled={option.disabled}
              title={option.disabled ? option.disabledReason : undefined}
              onClick={() => onChange(option.value)}
              className={variant === "pills"
                ? `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`
                : `flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-primary bg-primary/[0.06]" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              {variant === "cards" && (
                <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}>
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              )}
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${selected ? "text-primary" : "text-slate-800"}`}>{option.label}</span>
                {variant === "cards" && option.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span>}
                {variant === "cards" && option.disabled && option.disabledReason && <span className="mt-0.5 block text-xs font-medium text-amber-700">{option.disabledReason}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
