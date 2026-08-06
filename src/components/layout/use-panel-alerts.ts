"use client";

import { useEffect, useState } from "react";
import { hasPanelPermission } from "@/lib/panel-permissions";

export type WaitingPatient = { id: string; patientName: string; doctorName: string; startAt: string };
export type PanelAlertCounts = { taksit: number; stok: number; lab: number; tasks: number; waiting: number; waitingList: WaitingPatient[] };

const EMPTY_ALERTS: PanelAlertCounts = { taksit: 0, stok: 0, lab: 0, tasks: 0, waiting: 0, waitingList: [] };
const CACHE_TTL_MS = 15_000;

let memoryCache: Record<string, { at: number; data: PanelAlertCounts }> = {};
let inFlight: Record<string, Promise<PanelAlertCounts> | undefined> = {};

export function getAlertPermissions(role: string, permissions?: readonly string[]) {
  if (permissions) {
    return {
      canSeeTaksit: hasPanelPermission(permissions, "installments:read"),
      canSeeStok: hasPanelPermission(permissions, "stock:read"),
      canSeeLab: hasPanelPermission(permissions, "lab:read"),
      canSeeWaiting: hasPanelPermission(permissions, "appointments:read"),
      canSeeTasks: hasPanelPermission(permissions, "clinictasks:read"),
    };
  }
  return {
    canSeeTaksit: ["YONETICI", "SUPERADMIN", "MUHASEBE", "BANKO"].includes(role),
    canSeeStok: ["YONETICI", "SUPERADMIN", "MUHASEBE"].includes(role),
    canSeeLab: ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN"].includes(role),
    // Bir hasta "Geldi" olarak işaretlendiğinde, ön büro (Banko) dışındaki
    // katlarda/odalarda çalışan doktor ve asistanların da bunu fark etmesi
    // gerekir — bu yüzden klinik içi tüm operasyonel roller görebilir.
    canSeeWaiting: ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN", "BANKO"].includes(role),
    canSeeTasks: ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"].includes(role),
  };
}

function cacheKey(accessKey: string) {
  return `panel-alerts:${accessKey || "UNKNOWN"}`;
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
      tasks: Number(parsed.data?.tasks || 0),
      waiting: Number(parsed.data?.waiting || 0),
      waitingList: Array.isArray(parsed.data?.waitingList) ? parsed.data!.waitingList! : [],
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

async function loadAlerts(role: string, permissions: readonly string[] | undefined, accessKey: string): Promise<PanelAlertCounts> {
  const cached = readCached(accessKey);
  if (cached) return cached;

  if (inFlight[accessKey]) return inFlight[accessKey]!;

  const { canSeeTaksit, canSeeStok, canSeeLab, canSeeWaiting, canSeeTasks } = getAlertPermissions(role, permissions);
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

  inFlight[accessKey] = Promise.allSettled([
    canSeeTaksit ? fetch("/api/taksit-plani?status=GECIKTI", { cache: "no-store" }) : Promise.resolve(null),
    canSeeStok ? fetch("/api/stock", { cache: "no-store" }) : Promise.resolve(null),
    canSeeLab ? fetch("/api/lab-orders?status=BEKLIYOR", { cache: "no-store" }) : Promise.resolve(null),
    canSeeWaiting ? fetch(`/api/appointments?date=${todayKey}`, { cache: "no-store" }) : Promise.resolve(null),
    canSeeTasks ? fetch("/api/clinic-tasks?scope=mine&take=500", { cache: "no-store" }) : Promise.resolve(null),
  ])
    .then(async ([tRes, sRes, lRes, aRes, taskRes]) => {
      const tData =
        tRes.status === "fulfilled" && tRes.value?.ok ? await tRes.value.json() : null;
      const sData =
        sRes.status === "fulfilled" && sRes.value?.ok ? await sRes.value.json() : null;
      const lData =
        lRes.status === "fulfilled" && lRes.value?.ok ? await lRes.value.json() : null;
      const aData =
        aRes.status === "fulfilled" && aRes.value?.ok ? await aRes.value.json() : null;
      const taskData =
        taskRes.status === "fulfilled" && taskRes.value?.ok ? await taskRes.value.json() : null;

      const taksit = Array.isArray(tData)
        ? tData.reduce(
            (sum: number, plan: any) =>
              sum + (plan.taksitler || []).filter((t: any) => t.status === "GECIKTI").length,
            0,
          )
        : 0;
      const stok = Array.isArray(sData)
        // "<=" kullanılır: anasayfa'daki aynı KPI ile tutarlı olsun diye, ve
        // minQuantity ayarlanmamış/0 olan bir kalem miktarı da 0'a düştüğünde
        // hâlâ uyarabilsin diye ("<" ile bu asla tetiklenmiyordu — bkz.
        // denetim raporu).
        ? sData.filter((item: any) => Number(item.quantity || 0) <= Number(item.minQuantity || 0)).length
        : 0;
      const lab = Array.isArray(lData) ? lData.length : Number(lData?.total || 0);
      const now = Date.now();
      const tasks = Array.isArray(taskData)
        ? taskData.filter((task: any) => {
            if (!["ACIK", "BEKLEMEDE"].includes(task.status)) return false;
            const alertAt = task.remindAt || task.dueAt;
            return alertAt && new Date(alertAt).getTime() <= now;
          }).length
        : 0;
      const waitingList: WaitingPatient[] = Array.isArray(aData)
        ? aData
            .filter((a: any) => a.status === "GELDI")
            .sort((a: any, b: any) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
            .map((a: any) => ({
              id: a.id,
              patientName: a.patient?.fullName || "Hasta",
              doctorName: a.doctor?.fullName || "-",
              startAt: a.startAt,
            }))
        : [];
      const data = { taksit, stok, lab, tasks, waiting: waitingList.length, waitingList };
      writeCached(accessKey, data);
      return data;
    })
    .catch(() => EMPTY_ALERTS)
    .finally(() => {
      inFlight[accessKey] = undefined;
    });

  return inFlight[accessKey]!;
}

export function usePanelAlerts(role: string, permissions?: readonly string[]) {
  // Başlangıç değeri her zaman sabit (EMPTY_ALERTS) olmalı: sunucu tarafında
  // localStorage yok, istemci tarafında ise varsa önbellek farklı bir değer
  // dönebilir. Bu, ilk render'da sunucu/istemci HTML'inin uyuşmamasına
  // (hydration mismatch) ve tüm sayfanın gereksiz yere client-side yeniden
  // render edilmesine yol açıyordu. Önbellek artık yalnızca useEffect
  // içinde (hydration tamamlandıktan sonra) uygulanıyor.
  const [alerts, setAlerts] = useState<PanelAlertCounts>(EMPTY_ALERTS);
  const permissionKey = permissions ? [...permissions].sort().join(",") : "";
  const accessKey = `${role}:${permissionKey}`;

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    const cached = readCached(accessKey);
    if (cached) setAlerts(cached);

    const refresh = async (force = false) => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (force) {
        delete memoryCache[accessKey];
        try {
          localStorage.removeItem(cacheKey(accessKey));
        } catch {}
      }
      const resolvedPermissions = permissionKey ? permissionKey.split(",") : undefined;
      const data = await loadAlerts(role, resolvedPermissions, accessKey);
      if (!cancelled) setAlerts(data);
    };

    // Rozetler ilk görünümün önceliği değildir. Takvim ve hasta listesi
    // etkileşime hazır olduktan sonra yüklenir; requestIdleCallback bazı
    // tarayıcılarda çok erken çalışabildiğinden ilk rota derlemesiyle yine
    // yarışıyordu. Bu yüzden ilk sorgu bilinçli olarak geciktirilir.
    const startInitialRefresh = () => void refresh(false);
    const initialTimer = setTimeout(startInitialRefresh, 15_000);

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
      if (initialTimer) clearTimeout(initialTimer);
    };
  }, [accessKey, permissionKey, role]);

  return alerts;
}
