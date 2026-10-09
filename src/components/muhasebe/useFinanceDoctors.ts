"use client";

import { useEffect, useState } from "react";
import { cachedGet } from "@/lib/client-cache";
import { selectDoctors } from "@/lib/staff-roles";
import type { FinanceDoctor } from "@/components/muhasebe/muhasebe-utils";

async function loadFinanceDoctors(): Promise<FinanceDoctor[]> {
  // Önce muhasebe ucu: staff:read izni olmayan muhasebe rolü de doktor listesini alabilsin.
  const primary = await cachedGet<FinanceDoctor[]>("/api/muhasebe/doktorlar", 60_000, { throwOnError: true }).catch(() => null);
  if (Array.isArray(primary) && primary.length > 0) return selectDoctors(primary);
  const staff = await cachedGet<FinanceDoctor[]>("/api/staff", 60_000, { throwOnError: true });
  return selectDoctors(Array.isArray(staff) ? staff : []);
}

/**
 * Muhasebe ekranlarının doktor listesi. "Kim doktor?" kuralı tek yerden gelir
 * (bkz. src/lib/staff-roles.ts); liste DoctorSelect'e `doctors` olarak
 * verilir, böylece aynı veri ikinci kez istenmez.
 */
export function useFinanceDoctors(enabled = true) {
  const [doctors, setDoctors] = useState<FinanceDoctor[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadFinanceDoctors()
      .then((list) => { if (active) { setDoctors(list); setError(""); } })
      .catch(() => { if (active) { setDoctors([]); setError("Doktor listesi yüklenemedi."); } })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [enabled]);

  return { doctors, error, loaded };
}
