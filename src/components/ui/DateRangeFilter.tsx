"use client";

import { useEffect, useId, useState } from "react";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Input, Select } from "@/components/ui/Input";
import type { ActiveFilter } from "@/components/ui/Toolbar";
import {
  DATE_PRESET_LABELS,
  describeDateRange,
  effectiveMaxKey,
  formatRangeLabel,
  presetRange,
  validateRange,
  type DatePresetKey,
  type DateRangeValue,
  type RangeLimits,
} from "@/lib/date-presets";
import { useTurkeyToday } from "@/lib/use-turkey-today";

type DateRangeFilterProps = RangeLimits & {
  /** Gösterilecek hazır dönemler — tercihen `DATE_PRESET_SETS.takvim` / `.gecmis`. "ozel" varsa iki tarih alanı açılabilir. */
  presets: readonly DatePresetKey[];
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Her yerde "Dönem". "select"te ekran okuyucu adı, "chips"te görünür etiket. */
  label?: string;
  /**
   * "select" (varsayılan): araç çubuğunda tek açılır liste — sığar, mobilde yerel seçici açılır.
   * "chips": dönem sayfanın ana süzgeciyse ve en çok 4-5 seçenek varsa, görünür etiketli çipler.
   */
  variant?: "select" | "chips";
  /** Dışarıdan gelen hata (ör. sunucu aralığı reddetti). Özel aralık hatası kendiliğinden gösterilir. */
  error?: string | null;
  /** Hazır dönemin gerçek tarihlerini yanında soluk yazı olarak göster ("1–10 Eki 2026"). */
  showRange?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
};

/**
 * Dönem / tarih aralığı seçici — TEK görünüm ve TEK davranış (Raporlar,
 * İşlem Kayıtları, Defter, Gönderim geçmişi, firma ekstresi…). Hazır dönem
 * seçilir; "Tarih aralığı seç" ile görünür etiketli "Başlangıç"/"Bitiş"
 * alanları açılır ve o an bakılan dönemle dolu gelir. Bitiş varsayılan
 * olarak bugünü geçemez (`allowFuture` ile açılır). Geçersiz aralıkta hata
 * alanların altında yazılır; sayfa `resolveDateRange`/`useDateRangeParam`
 * `error`'ı varken istek atmaz. Adres çubuğuyla birlikte: `useDateRangeParam`.
 *
 *   const period = useDateRangeParam(DATE_PRESET_SETS.takvim, "ay");
 *   <Toolbar filters={<DateRangeFilter {...period.filterProps} />} filterCount={…}>…</Toolbar>
 */
export function DateRangeFilter({
  presets,
  value,
  onChange,
  label = "Dönem",
  variant = "select",
  error,
  showRange = false,
  size = "md",
  disabled = false,
  className = "",
  min,
  max,
  allowFuture,
  maxDays,
}: DateRangeFilterProps) {
  const id = useId();
  const isCustom = value.preset === "ozel";
  // Tarih alanları yerel taslakla çalışır: değer adres çubuğundan bir tur
  // gecikmeyle dönerken kontrollü alan eski değere sıçramasın.
  const [draftFrom, setDraftFrom] = useState(value.from || "");
  const [draftTo, setDraftTo] = useState(value.to || "");
  useEffect(() => setDraftFrom(value.from || ""), [value.from]);
  useEffect(() => setDraftTo(value.to || ""), [value.to]);

  const limits: RangeLimits = { min, max, allowFuture, maxDays };
  // "Bugün" render'da new Date() ile hesaplanmaz (§0.5): sunucuyla tarayıcının
  // Türkiye günü farklıysa title/aralık metni/max özniteliği uyuşmaz (#418).
  // Hidrasyon sırasında null; bugüne bağlı metin ve sınır hemen ardından gelir.
  const today = useTurkeyToday();
  const now = today ? new Date(`${today}T12:00:00.000Z`) : null;
  const maxKey = limits.max ? limits.max : now ? effectiveMaxKey(limits, now) : null;
  const customError = isCustom && now ? validateRange({ from: draftFrom, to: draftTo }, limits, now) : null;
  const shownError = error || customError;
  const errorId = `${id}-error`;
  const rangeId = `${id}-range`;
  const rangeText = isCustom || !now ? "" : formatRangeLabel(presetRange(value.preset, null, now));

  const selectPreset = (preset: DatePresetKey) => {
    if (preset === value.preset) return;
    if (preset !== "ozel") {
      onChange({ preset });
      return;
    }
    // Özel aralık o an bakılan dönemle başlar; kullanıcı yalnız değiştirmek istediği ucu düzeltir.
    const start = presetRange(value.preset) || presetRange("ay");
    let to = start?.to || "";
    let from = start?.from || "";
    const limitKey = effectiveMaxKey(limits);
    if (limitKey && to > limitKey) to = limitKey;
    if (from > to) from = to;
    onChange({ preset: "ozel", from, to });
  };

  const changeFrom = (next: string) => {
    setDraftFrom(next);
    onChange({ preset: "ozel", from: next, to: draftTo });
  };
  const changeTo = (next: string) => {
    setDraftTo(next);
    onChange({ preset: "ozel", from: draftFrom, to: next });
  };

  const fieldA11y = {
    "aria-invalid": shownError ? true : undefined,
    "aria-describedby": shownError ? errorId : undefined,
  } as const;
  const fromMax = draftTo && (!maxKey || draftTo < maxKey) ? draftTo : maxKey || undefined;
  const toMin = draftFrom && (!min || draftFrom > min) ? draftFrom : min;

  const errorText = shownError && (
    <p id={errorId} role="alert" className="text-xs font-medium text-red-600">{shownError}</p>
  );

  // Hata, kırmızı çerçeveli tarih alanlarının hemen altında durur.
  const customFields = isCustom && (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div role="group" aria-label={`${label}: tarih aralığı`} className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center sm:gap-1.5">
          Başlangıç
          <Input
            type="date"
            size={size}
            value={draftFrom}
            min={min}
            max={fromMax}
            disabled={disabled}
            onChange={(event) => changeFrom(event.target.value)}
            className="sm:w-40"
            {...fieldA11y}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center sm:gap-1.5">
          Bitiş
          <Input
            type="date"
            size={size}
            value={draftTo}
            min={toMin}
            max={maxKey || undefined}
            disabled={disabled}
            onChange={(event) => changeTo(event.target.value)}
            className="sm:w-40"
            {...fieldA11y}
          />
        </label>
      </div>
      {errorText}
    </div>
  );

  if (variant === "chips") {
    return (
      <div className={`ui-date-range-filter flex min-w-0 flex-col gap-2 ${className}`}>
        <ChoiceCards
          label={label}
          variant="pills"
          value={value.preset}
          onChange={selectPreset}
          options={presets.map((key) => ({ value: key, label: DATE_PRESET_LABELS[key], disabled }))}
        />
        {showRange && rangeText && <p className="text-xs tabular-nums text-slate-500">{rangeText}</p>}
        {customFields}
        {!isCustom && errorText}
      </div>
    );
  }

  return (
    <div className={`ui-date-range-filter flex min-w-0 flex-col gap-1.5 ${className}`}>
      {/* Özel aralıkta üstten hizalı: alan altındaki hata satırı seçiciyi aşağı itmesin. */}
      <div className={`flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap ${isCustom ? "sm:items-start" : "sm:items-center"}`}>
        <Select
          aria-label={label}
          size={size}
          value={value.preset}
          disabled={disabled}
          title={rangeText || undefined}
          aria-describedby={showRange && rangeText ? rangeId : undefined}
          onChange={(event) => selectPreset(event.target.value as DatePresetKey)}
          className="sm:w-auto"
        >
          {presets.map((key) => <option key={key} value={key}>{DATE_PRESET_LABELS[key]}</option>)}
        </Select>
        {showRange && rangeText && <span id={rangeId} className="whitespace-nowrap text-xs tabular-nums text-slate-500">{rangeText}</span>}
        {customFields}
      </div>
      {!isCustom && errorText}
    </div>
  );
}

/**
 * ActiveFilters için dönem etiketi: varsayılan dönemde null; aksi halde
 * "Son 7 gün" ya da özel aralıkta "1–10 Eki 2026" (ham ISO tarih yazılmaz).
 */
export function dateRangeActiveFilter(value: DateRangeValue, options: { fallback: DatePresetKey; onReset: () => void; key?: string }): ActiveFilter | null {
  if (value.preset === options.fallback) return null;
  return { key: options.key || "donem", label: describeDateRange(value), onRemove: options.onReset };
}
