"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { QuickDatePicker, type QuickDateOption } from "@/components/ui/QuickDatePicker";
import { turkeyDateKey, turkeyTimeKey } from "@/lib/tz";
import type { DateTimeParts } from "./takip-utils";

type Props = {
  label: string;
  value: DateTimeParts;
  onChange: (value: DateTimeParts) => void;
  /** Gün seçilince saat boşsa önerilecek saat ("10:00"). */
  defaultTime: (dateKey: string) => string;
  options?: QuickDateOption[];
  required?: boolean;
  min?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * Hızlı gün seçimi + saat. Gün sık seçilen seçeneklerden tek dokunuşla
 * (Bugün / Yarın / …), saat altında küçük alanda; gün seçilince saat makul
 * bir varsayılanla dolar ve çoğu zaman dokunulmaz. Önceden yalnız tarih-saat
 * kutusu vardı ve varsayılan saat gece yarısıydı (canlı test H3).
 */
export function DateTimeQuickField({ label, value, onChange, defaultTime, options, required = false, min, error, hint, disabled = false }: Props) {
  const timeId = useId();
  // Gün değişince saat, önceki günün önerisiyse ya da bugün için geçmişte kalıyorsa yeni güne
  // göre önerilir: önceden "Yarın 18:00" seçilip akşam "Bugün"e geçilince (ya da gecikmiş
  // görev bugüne alınınca) saat geçmişte kalıyor, kayıt "Son tarih geçmişte olamaz" hatasıyla
  // duruyordu. Başka bir gün için elle girilmiş saat korunur.
  const changeDate = (date: string) => {
    if (!date) {
      onChange({ date, time: "" });
      return;
    }
    const wasSuggested = Boolean(value.date) && value.time === defaultTime(value.date);
    const pastToday = date === turkeyDateKey() && value.time !== "" && value.time < turkeyTimeKey(new Date());
    const keepTime = Boolean(value.time) && !wasSuggested && !pastToday;
    onChange({ date, time: keepTime ? value.time : defaultTime(date) });
  };
  return (
    <div>
      <QuickDatePicker
        label={label}
        value={value.date}
        onChange={changeDate}
        options={options}
        required={required}
        min={min}
        error={error}
        hint={hint}
        disabled={disabled}
      />
      {value.date && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={timeId} className="text-xs font-semibold text-slate-600">Saat</label>
          <Input
            id={timeId}
            type="time"
            size="sm"
            step={300}
            value={value.time}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            className="w-28 tabular-nums"
          />
        </div>
      )}
    </div>
  );
}
