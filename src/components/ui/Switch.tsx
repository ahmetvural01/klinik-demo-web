"use client";

import { useId, type ReactNode } from "react";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Anahtarın ne yaptığını söyleyen etiket ("Ödeme hatırlatmalarını otomatik gönder"). */
  label: ReactNode;
  /** Etiketin altında kısa açıklama. */
  description?: ReactNode;
  disabled?: boolean;
  /** Etiket metni olmadan yalnız anahtar gerekiyorsa ekran okuyucu adı. */
  "aria-label"?: string;
  className?: string;
};

/**
 * Açık/kapalı ayarlar için TEK görünüm. Önceden aynı iş üç farklı biçimde
 * yapılıyordu (solda küçük onay kutusu, sağda büyük onay kutusu, durum yazan
 * "Açık/Kapalı" düğmesi). Etiket her zaman eylemi anlatır; durum anahtarın
 * kendisinden okunur.
 */
export function Switch({ checked, onChange, label, description, disabled = false, "aria-label": ariaLabel, className = "" }: SwitchProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-60" : ""} ${className}`}>
      <div className="min-w-0">
        <label htmlFor={id} className={`block text-sm font-semibold text-slate-800 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>{label}</label>
        {description && <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`ui-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${checked ? "border-primary bg-primary" : "border-slate-300 bg-slate-200"}`}
      >
        <span className="sr-only">{checked ? "Açık" : "Kapalı"}</span>
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
