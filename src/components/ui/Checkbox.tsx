"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Kutunun ne anlama geldiğini söyleyen etiket ("Randevu hatırlatma SMS'i gönder"). */
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Kısmi seçim (ör. "görünenlerin bir kısmı seçili"). */
  indeterminate?: boolean;
  name?: string;
  id?: string;
  className?: string;
};

/**
 * Onay kutusu — TEK görünüm: solda kutu, yanında etiket ve isteğe bağlı
 * açıklama; etiketin tamamı tıklanabilir. Açık/kapalı AYAR için Switch,
 * formda "bunu da yap" seçimi için Checkbox kullanılır (sözleşme §2).
 */
export function Checkbox({ checked, onChange, label, description, disabled = false, indeterminate = false, name, id, className = "" }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [checked, indeterminate]);

  return (
    <div className={`ui-checkbox flex items-start gap-2.5 ${disabled ? "opacity-50" : ""} ${className}`}>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-primary !min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className={`block text-sm font-semibold leading-5 text-slate-800 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>{label}</label>
        {description && <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
    </div>
  );
}
