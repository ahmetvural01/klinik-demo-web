"use client";

import { useId, useState, type FocusEvent } from "react";
import { Input } from "@/components/ui/Input";

export type TimeRange = { start: string; end: string };

/**
 * Saat aralığı için TEK tip hata metni; sorun yoksa null. Kaydetmeden önce
 * çağrılır (bileşen de aynı metni gösterir).
 * `required` değilse iki alan birlikte boş bırakılabilir (ör. öğle arası yok).
 */
export function timeRangeError(range: TimeRange, options: { required?: boolean } = {}): string | null {
  const start = range.start.trim();
  const end = range.end.trim();
  if (!start || !end) {
    if (!start && !end && !options.required) return null;
    return options.required ? "Başlangıç ve bitiş saatini girin." : "İki saati de girin ya da ikisini de boş bırakın.";
  }
  // "HH:MM" biçiminde metin karşılaştırması saat sırasını verir.
  if (start >= end) return "Bitiş saati başlangıçtan sonra olmalı.";
  return null;
}

type TimeRangeInputProps = {
  /** Alanın adı ("Çalışma saati", "Öğle arası"). */
  label: string;
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  /** Ad görünmesin (yalnız ekran okuyucu) — gün satırı gibi adın yanında yazdığı yerler. */
  labelHidden?: boolean;
  required?: boolean;
  disabled?: boolean;
  /**
   * Dış hata (ör. "Öğle arası çalışma saatleri içinde olmalı"). Verilirse iç
   * doğrulamanın yerine gösterilir.
   */
  error?: string;
  hint?: string;
  /** Ekran okuyucu adları; görünür ad `label`'dır. */
  startLabel?: string;
  endLabel?: string;
  /** Saat seçicide dakika adımı (ör. 15). */
  minuteStep?: number;
  size?: "sm" | "md";
  /** Başlangıç alanının id'si (dışarıdan odaklamak için). */
  id?: string;
  className?: string;
};

/**
 * "08:30 – 18:00" saat aralığı — iki saat alanı, TEK etiket, TEK hata metni.
 * Önceden çalışma saatleri, öğle arası ve personel mesaisi ayrı "Açılış /
 * Kapanış" alanları ve satır sonunda ayrı hata kutusuyla yazılıyordu.
 * Sıra hatası (bitiş ≤ başlangıç) kullanıcı alanlardan çıkınca gösterilir;
 * yazarken ara değerlerde hata yanıp sönmez.
 */
export function TimeRangeInput({
  label,
  value,
  onChange,
  labelHidden = false,
  required = false,
  disabled = false,
  error,
  hint,
  startLabel = "Başlangıç",
  endLabel = "Bitiş",
  minuteStep,
  size = "md",
  id,
  className = "",
}: TimeRangeInputProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const [touched, setTouched] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const internalError = touched && !focusWithin ? timeRangeError(value, { required }) : null;
  const shownError = error || internalError;
  const messageId = shownError || hint ? `${baseId}-message` : undefined;
  const step = minuteStep ? minuteStep * 60 : undefined;

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocusWithin(false);
    setTouched(true);
  };

  const field = (key: keyof TimeRange, name: string, fieldId?: string) => (
    <Input
      id={fieldId}
      type="time"
      size={size}
      step={step}
      aria-label={name}
      aria-describedby={messageId}
      aria-invalid={shownError ? true : undefined}
      required={required}
      disabled={disabled}
      value={value[key]}
      onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      className="min-w-0 flex-1 tabular-nums"
    />
  );

  return (
    <div className={className}>
      <p id={labelId} className={labelHidden ? "sr-only" : "ui-form-label mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800"}>
        {label}
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        onFocus={() => setFocusWithin(true)}
        onBlur={onBlur}
        className="flex max-w-[18rem] items-center gap-2"
      >
        {field("start", startLabel, id)}
        <span aria-hidden="true" className="shrink-0 text-sm font-semibold text-slate-400">–</span>
        {field("end", endLabel)}
      </div>
      {shownError ? (
        <p id={messageId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{shownError}</p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
