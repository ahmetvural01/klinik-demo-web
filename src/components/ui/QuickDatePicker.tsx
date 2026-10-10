"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { isValidDateKey, turkeyDateKey } from "@/lib/tz";
import { useTurkeyToday } from "@/lib/use-turkey-today";

/** Hızlı seçenek: bugünden `days` gün sonrası ya da sabit `date` ("YYYY-MM-DD"). */
export type QuickDateOption = { label: string; days?: number; date?: string };

export const DEFAULT_QUICK_DATES: QuickDateOption[] = [
  { label: "Bugün", days: 0 },
  { label: "Yarın", days: 1 },
  { label: "3 gün sonra", days: 3 },
  { label: "1 hafta sonra", days: 7 },
];

/**
 * "YYYY-MM-DD" gününe takvim günü ekler (saat dilimi kaymasız). Geçersiz
 * anahtarda "" döner (önceden RangeError fırlatıp formu çökertiyordu).
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey) || !Number.isFinite(days)) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const LONG_DATE = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });

function longDate(dateKey: string) {
  if (!isValidDateKey(dateKey)) return "";
  return LONG_DATE.format(new Date(`${dateKey}T00:00:00.000Z`));
}

type QuickDatePickerProps = {
  /** Alanın adı ("Son tarih", "Sonraki arama"). */
  label: string;
  /** "YYYY-MM-DD" ya da "" (seçilmedi). */
  value: string;
  onChange: (value: string) => void;
  /** Hızlı seçenekler; varsayılan Bugün / Yarın / 3 gün sonra / 1 hafta sonra. */
  options?: QuickDateOption[];
  /** En erken gün: "YYYY-MM-DD" ya da "today" (geçmiş günler seçilemez). */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  /** Ad görünmesin (yalnız ekran okuyucu). */
  labelHidden?: boolean;
  /** Tarih alanının ekran okuyucu adı. Varsayılan "Tarih seç". */
  customLabel?: string;
  /** Tarih alanının id'si (dışarıdan odaklamak için). */
  id?: string;
  className?: string;
};

/**
 * Hızlı tarih seçimi — sık seçilen günler tek dokunuşla, diğerleri tarih
 * alanından. Tarih alanı her zaman seçili günü gösterir ("Yarın" hangi gün,
 * görünür). Günler Türkiye takvimine göre hesaplanır (Europe/Istanbul);
 * değer "YYYY-MM-DD". Önceden takip/görev formlarında yalnız tarih-saat
 * kutusu vardı ve randevu formu kendi gün düğmelerini yazıyordu.
 * Zorunlu olmayan alanda seçili hızlı seçeneğe yeniden basmak tarihi kaldırır.
 */
export function QuickDatePicker({
  label,
  value,
  onChange,
  options = DEFAULT_QUICK_DATES,
  min,
  max,
  required = false,
  disabled = false,
  error,
  hint,
  labelHidden = false,
  customLabel = "Tarih seç",
  id,
  className = "",
}: QuickDatePickerProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const messageId = error || hint ? `${baseId}-message` : undefined;
  // Bugün render'da new Date() ile değil, hidrasyon güvenli hook'la gelir:
  // sunucu ile tarayıcının günü farklıysa basılı durum/pasiflik/title uyuşmazlığı
  // (#418) olmasın. Hidrasyon sırasında null; göreli günler o an hesaplanmaz.
  const today = useTurkeyToday();
  const minKey = min === "today" ? today ?? undefined : min;
  // Sabit `date` boş ya da bozuksa (ör. vade tarihi henüz yok) seçenek gösterilmez.
  const resolved = options.flatMap((option) => {
    if (option.date !== undefined) return isValidDateKey(option.date) ? [{ ...option, key: option.date }] : [];
    return [{ ...option, key: today ? addDaysToDateKey(today, option.days ?? 0) : "" }];
  });

  return (
    <div className={className}>
      <p id={labelId} className={labelHidden ? "sr-only" : "ui-form-label mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800"}>
        {label}
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
      </p>
      <div role="group" aria-labelledby={labelId} aria-describedby={messageId} className="flex flex-wrap items-center gap-2">
        {resolved.map((option, index) => {
          const known = option.key !== "";
          const pressed = known && value === option.key;
          const outOfRange = known && Boolean((minKey && option.key < minKey) || (max && option.key > max));
          const dayText = known ? longDate(option.key) : "";
          return (
            <button
              key={`${option.label}-${index}`}
              type="button"
              aria-pressed={pressed}
              disabled={disabled || outOfRange}
              // Asıl gün ipucunda: "Yarın" → "11 Ekim 2026 Pazar".
              title={dayText ? (outOfRange ? `${dayText} — seçilemez` : dayText) : undefined}
              onClick={() => {
                // Hidrasyon anında tıklanırsa gün o an hesaplanır.
                const key = option.key || addDaysToDateKey(turkeyDateKey(), option.days ?? 0);
                if (!key) return;
                onChange(value === key && !required ? "" : key);
              }}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${pressed ? "border-primary bg-primary/10 text-primary" : `bg-white text-slate-700 hover:border-slate-300 ${error && !outOfRange ? "border-red-300" : "border-slate-200"}`}`}
            >
              {option.label}
            </button>
          );
        })}
        <Input
          id={id}
          type="date"
          aria-label={customLabel}
          aria-describedby={messageId}
          aria-invalid={error ? true : undefined}
          required={required}
          disabled={disabled}
          min={minKey}
          max={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-[10.5rem] flex-none tabular-nums"
        />
      </div>
      {error ? (
        <p id={messageId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
