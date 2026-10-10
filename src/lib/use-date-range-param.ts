"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ActiveFilter } from "@/components/ui/Toolbar";
import { dateRangeActiveFilter } from "@/components/ui/DateRangeFilter";
import {
  readDateRangeParams,
  resolveDateRange,
  writeDateRangeParams,
  type DatePresetKey,
  type DateRange,
  type DateRangeParamNames,
  type DateRangeValue,
  type RangeLimits,
} from "@/lib/date-presets";

export type DateRangeParamOptions = DateRangeParamNames & RangeLimits;

export type DateRangeParamState = {
  /** Seçici değeri (DateRangeFilter `value`). */
  value: DateRangeValue;
  /** Seçimi değiştirir ve adres çubuğuna yazar. */
  setValue: (value: DateRangeValue) => void;
  /**
   * Sorguda kullanılacak gün aralığı (iki uç dahil). null ise ya "Tüm zamanlar"
   * (tarih filtresi yok) ya da özel aralık hatalıdır — önce `error`'a bakın.
   * Aynı aralıkta nesne kimliği korunur; efekt bağımlılığı olarak verilebilir.
   */
  range: DateRange | null;
  /** Özel aralık hatası (DateRangeFilter alanın altında zaten gösterir). Varken istek atmayın. */
  error: string | null;
  /** Varsayılan dönem seçili mi (aktif filtre sayısına katılmaz). */
  isDefault: boolean;
  /** ActiveFilters için hazır etiket; varsayılan dönemde null. */
  activeFilter: ActiveFilter | null;
  /** Varsayılan döneme döner. */
  reset: () => void;
  /** `<DateRangeFilter {...period.filterProps} />` — set, değer ve sınırlar tek yerden gelsin. */
  filterProps: RangeLimits & { presets: readonly DatePresetKey[]; value: DateRangeValue; onChange: (value: DateRangeValue) => void };
};

/**
 * Seçili dönemi adres çubuğunda tutar (`?donem=ay` ya da
 * `?donem=ozel&from=YYYY-MM-DD&to=YYYY-MM-DD`): sayfa yenilense, bağlantı
 * paylaşılsa ya da geri tuşuna basılsa da kullanıcı aynı dönemi görür.
 * `useTabParam` gibi `window.history.replaceState` kullanır (Next 14.1+ bunu
 * useSearchParams ile eşitler): seçim ekranda hemen değişir, sunucuya tur
 * atılmaz (router.replace her değişimde ~200 ms'lik bir RSC turu yapıyordu).
 * Varsayılan dönem adreste yazılmaz. Eski
 * `?from=…&to=…` bağlantıları (donem'siz) özel aralık olarak açılır.
 *
 *   const period = useDateRangeParam(DATE_PRESET_SETS.takvim, "ay");
 *   useEffect(() => { if (!period.error) void load(period.range); }, [period.error, period.range]);
 *   <DateRangeFilter {...period.filterProps} />
 *   <ActiveFilters filters={[...(period.activeFilter ? [period.activeFilter] : []), …]} />
 */
export function useDateRangeParam(presets: readonly DatePresetKey[], fallback: DatePresetKey, options: DateRangeParamOptions = {}): DateRangeParamState {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { param = "donem", fromParam = "from", toParam = "to", min, max, allowFuture, maxDays } = options;

  const parsed = readDateRangeParams(searchParams, presets, fallback, { param, fromParam, toParam });
  const urlValue = useMemo<DateRangeValue>(
    () => (parsed.preset === "ozel" ? { preset: "ozel", from: parsed.from || "", to: parsed.to || "" } : { preset: parsed.preset }),
    [parsed.preset, parsed.from, parsed.to],
  );

  // Adres değişikliği (yönlendirici turu) beklenmeden seçim ekranda hemen
  // değişsin; adres dışarıdan değişirse (geri tuşu, bağlantı) yerel değer onu izler.
  const [value, setLocalValue] = useState<DateRangeValue>(urlValue);
  useEffect(() => setLocalValue(urlValue), [urlValue]);

  const setValue = useCallback((next: DateRangeValue) => {
    setLocalValue(next);
    const params = writeDateRangeParams(new URLSearchParams(searchParams.toString()), next, fallback, { param, fromParam, toParam });
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [fallback, fromParam, param, pathname, searchParams, toParam]);

  const reset = useCallback(() => setValue({ preset: fallback }), [fallback, setValue]);

  const resolved = resolveDateRange(value, { min, max, allowFuture, maxDays });
  const rangeFrom = resolved.range?.from;
  const rangeTo = resolved.range?.to;
  const range = useMemo(() => (rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : null), [rangeFrom, rangeTo]);

  return {
    value,
    setValue,
    range,
    error: resolved.error,
    isDefault: value.preset === fallback,
    activeFilter: dateRangeActiveFilter(value, { fallback, onReset: reset, key: param }),
    reset,
    filterProps: { presets, value, onChange: setValue, min, max, allowFuture, maxDays },
  };
}
