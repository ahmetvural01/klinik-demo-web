"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedGet, invalidateCachedGet } from "@/lib/client-cache";
import { selectDoctors } from "@/lib/staff-roles";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import { toTreatmentOptions, type CalendarDoctor, type CalendarSettings, type ClinicUnit } from "@/components/randevu/appointment-utils";

const SETTINGS_URL = "/api/appointments/calendar-settings";
const UNITS_URL = "/api/clinic-units";

/**
 * Takvim ve randevu formunun ihtiyaç duyduğu salt-okunur bilgiler: çalışma
 * saatleri, randevu süresi, tedavi türleri, randevu verilebilen doktorlar ve
 * tedavi alanları. Tek uç (randevu okuma yetkisi yeter) — önceden Banko/Doktor
 * rolünde /api/staff ve /api/settings yetkisi olmadığı için takvim "Doktor
 * bulunamadı" diyordu.
 */
export function useCalendarSettings() {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [clinicUnits, setClinicUnits] = useState<ClinicUnit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    if (force) {
      invalidateCachedGet(SETTINGS_URL);
      invalidateCachedGet(UNITS_URL);
    }
    try {
      const [data, units] = await Promise.all([
        cachedGet<CalendarSettings>(SETTINGS_URL, 60_000, { throwOnError: true }),
        cachedGet<ClinicUnit[]>(UNITS_URL, 60_000, { throwOnError: true }).catch(() => [] as ClinicUnit[]),
      ]);
      setSettings(data);
      setClinicUnits(Array.isArray(units) ? units : []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Takvim ayarları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onPreview = () => void load(true);
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, [load]);

  const doctors = useMemo<CalendarDoctor[]>(() => selectDoctors(settings?.doctors || []), [settings?.doctors]);
  const treatments = useMemo<TreatmentOption[]>(() => toTreatmentOptions(settings?.treatments), [settings?.treatments]);
  const slotInterval = Math.max(5, Math.min(120, Number(settings?.appointmentDuration) || 15));

  return { settings, doctors, treatments, clinicUnits, slotInterval, loading, error, reload: () => load(true) };
}
