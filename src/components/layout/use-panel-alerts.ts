"use client";

import { useEffect, useState } from "react";

export type PanelAlertCounts = { taksit: number; stok: number; lab: number };

const EMPTY_ALERTS: PanelAlertCounts = { taksit: 0, stok: 0, lab: 0 };
const CACHE_TTL_MS = 15_000;

let memoryCache: Record<string, { at: number; data: PanelAlertCounts }> = {};
let inFlight: Record<string, Promise<PanelAlertCounts> | undefined> = {};

export function getAlertPermissions(role: string) {
  return {
    canSeeTaksit: ["YONETICI", "SUPERADMIN", "MUHASEBE", "BANKO"].includes(role),
    canSeeStok: ["YONETICI", "SUPERADMIN", "MUHASEBE"].includes(role),
    canSeeLab: ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN"].includes(role),
  };
}

function cacheKey(role: string) {
  return `panel-alerts:${role || "UNKNOWN"}`;
}

function readCached(role: string): PanelAlertCounts | null {
  const memory = memoryCache[role];
  if (memory && Date.now() - memory.at < CACHE_TTL_MS) return memory.data;

  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(role));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: Partial<PanelAlertCounts> };
    if (!parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return {
      taksit: Number(parsed.data?.taksit || 0),
      stok: Number(parsed.data?.stok || 0),
      lab: Number(parsed.data?.lab || 0),
    };
  } catch {
    return null;
  }
}

function writeCached(role: string, data: PanelAlertCounts) {
  memoryCache[role] = { at: Date.now(), data };
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(role), JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

async function loadAlerts(role: string): Promise<PanelAlertCounts> {
  const cached = readCached(role);
  if (cached) return cached;

  if (inFlight[role]) return inFlight[role]!;

  const { canSeeTaksit, canSeeStok, canSeeLab } = getAlertPermissions(role);

  inFlight[role] = Promise.allSettled([
    canSeeTaksit ? fetch("/api/taksit-plani?status=GECIKTI", { cache: "no-store" }) : Promise.resolve(null),
    canSeeStok ? fetch("/api/stock", { cache: "no-store" }) : Promise.resolve(null),
    canSeeLab ? fetch("/api/lab-orders?status=BEKLIYOR", { cache: "no-store" }) : Promise.resolve(null),
  ])
    .then(async ([tRes, sRes, lRes]) => {
      const tData =
        tRes.status === "fulfilled" && tRes.value?.ok ? await tRes.value.json() : null;
      const sData =
        sRes.status === "fulfilled" && sRes.value?.ok ? await sRes.value.json() : null;
      const lData =
        lRes.status === "fulfilled" && lRes.value?.ok ? await lRes.value.json() : null;

      const taksit = Array.isArray(tData)
        ? tData.reduce(
            (sum: number, plan: any) =>
              sum + (plan.taksitler || []).filter((t: any) => t.status === "GECIKTI").length,
            0,
          )
        : 0;
      const stok = Array.isArray(sData)
        ? sData.filter((item: any) => Number(item.quantity || 0) < Number(item.minQuantity || 0)).length
        : 0;
      const lab = Array.isArray(lData) ? lData.length : Number(lData?.total || 0);
      const data = { taksit, stok, lab };
      writeCached(role, data);
      return data;
    })
    .catch(() => EMPTY_ALERTS)
    .finally(() => {
      inFlight[role] = undefined;
    });

  return inFlight[role]!;
}

export function usePanelAlerts(role: string) {
  // Başlangıç değeri her zaman sabit (EMPTY_ALERTS) olmalı: sunucu tarafında
  // localStorage yok, istemci tarafında ise varsa önbellek farklı bir değer
  // dönebilir. Bu, ilk render'da sunucu/istemci HTML'inin uyuşmamasına
  // (hydration mismatch) ve tüm sayfanın gereksiz yere client-side yeniden
  // render edilmesine yol açıyordu. Önbellek artık yalnızca useEffect
  // içinde (hydration tamamlandıktan sonra) uygulanıyor.
  const [alerts, setAlerts] = useState<PanelAlertCounts>(EMPTY_ALERTS);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    const cached = readCached(role);
    if (cached) setAlerts(cached);

    const refresh = async (force = false) => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (force) {
        delete memoryCache[role];
        try {
          localStorage.removeItem(cacheKey(role));
        } catch {}
      }
      const data = await loadAlerts(role);
      if (!cancelled) setAlerts(data);
    };

    void refresh(false);

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) void refresh(false);
    };
    const onRealtime = () => void refresh(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("ks:realtime-sync", onRealtime);
    const timer = window.setInterval(() => void refresh(false), 180_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      window.clearInterval(timer);
    };
  }, [role]);

  return alerts;
}
