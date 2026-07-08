"use client";

import { useLayoutEffect } from "react";

const WARMUP_KEY = "panel-route-warmup-v3";
const FAST_API_TIMEOUT_MS = 300;
const FAST_API_CACHE_PREFIX = "panel-fast-api:v1:";

const HOME_CACHE_KEY = "anasayfa:home:v1";
const AUTH_CACHE_KEY = "auth:me:v1";
const LAB_CACHE_KEY = "lab:orders:v1";

function getPanelCacheScope() {
  if (typeof window === "undefined") return "";
  const preview = sessionStorage.getItem("dev-preview-role");
  if (preview) return preview;
  const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
  if (!raw) return "";
  try {
    const cached = JSON.parse(raw) as { id?: string; role?: string };
    return `${cached.id || ""}:${cached.role || ""}`;
  } catch {
    return "";
  }
}

function getHomeCacheKey() {
  return `${HOME_CACHE_KEY}:${getPanelCacheScope()}`;
}

function getFastCacheKey(pathname: string, search: string) {
  return `${FAST_API_CACHE_PREFIX}${getPanelCacheScope()}:${pathname}${search}`;
}

function jsonFallback(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildFastFallback(pathname: string) {
  if (pathname === "/api/auth/me") return jsonFallback({});
  if (pathname.startsWith("/api/patients")) return jsonFallback({ patients: [], total: 0, skip: 0, take: 0 });
  if (pathname.startsWith("/api/firma")) return jsonFallback([]);
  if (pathname.startsWith("/api/clinic-tasks")) return jsonFallback([]);
  if (pathname.startsWith("/api/appointments")) return jsonFallback([]);
  if (pathname.startsWith("/api/messages")) return jsonFallback([]);
  if (pathname.startsWith("/api/announcements")) return jsonFallback([]);
  if (pathname.startsWith("/api/staff")) return jsonFallback([]);
  if (pathname.startsWith("/api/lab-orders")) return jsonFallback([]);
  if (pathname.startsWith("/api/patient-follow-ups")) return jsonFallback([]);
  if (pathname.startsWith("/api/profile")) return jsonFallback({});
  if (pathname.startsWith("/api/settings")) return jsonFallback({});
  if (pathname.startsWith("/api/dashboard")) return jsonFallback({});
  if (pathname.startsWith("/api/finance")) return jsonFallback([]);
  if (pathname.startsWith("/api/muhasebe")) return jsonFallback({});
  if (pathname.startsWith("/api/reports")) return jsonFallback({});
  if (pathname.startsWith("/api/support")) return jsonFallback([]);
  if (pathname.startsWith("/api/logs")) return jsonFallback([]);
  return null;
}

function installFastFetch() {
  if (typeof window === "undefined") return;
  const globalWindow = window as Window & {
    __ksFastFetchInstalled?: boolean;
    __ksOriginalFetch?: typeof fetch;
  };

  if (globalWindow.__ksFastFetchInstalled) return;
  globalWindow.__ksFastFetchInstalled = true;
  globalWindow.__ksOriginalFetch = globalWindow.fetch.bind(globalWindow);

  globalWindow.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = (request.method || "GET").toUpperCase();
    if (method !== "GET") {
      return globalWindow.__ksOriginalFetch!(request, init);
    }

    const url = new URL(request.url, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return globalWindow.__ksOriginalFetch!(request, init);
    }

    // Randevu verisi kritik ve rol değişiminde stale kalmamalı; bu endpoint cache'lenmez.
    if (url.pathname.startsWith("/api/appointments")) {
      return globalWindow.__ksOriginalFetch!(request, init);
    }

    const fallback = buildFastFallback(url.pathname);
    if (!fallback) {
      return globalWindow.__ksOriginalFetch!(request, init);
    }

    const cacheKey = getFastCacheKey(url.pathname, url.search);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return jsonFallback(JSON.parse(cached));
    }

    const inflight = globalWindow.__ksOriginalFetch!(request)
      .then(async (response) => {
        if (response.ok) {
          try {
            const text = await response.clone().text();
            sessionStorage.setItem(cacheKey, text);
          } catch {
            // Sessizce bırak: cache sadece hızlandırma amaçlı.
          }
        }
        return response;
      })
      .catch(() => null);

    const timeout = new Promise<Response>((resolve) => {
      window.setTimeout(() => resolve(fallback), FAST_API_TIMEOUT_MS);
    });

    const response = await Promise.race([inflight, timeout]);
    return response || fallback;
  };
}

function toTodayRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 90);
  const to = new Date(today);
  return { from, to };
}

async function warmHome() {
  try {
    const [messagesRes, appointmentsRes, announcementsRes, authRes] = await Promise.all([
      fetch("/api/messages", { cache: "no-store" }),
      fetch("/api/appointments?date=" + new Date().toISOString().split("T")[0], { cache: "no-store" }),
      fetch("/api/announcements", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ]);

    const [messagesData, appointmentsData, announcementsData, authData] = await Promise.all([
      messagesRes.json().catch(() => []),
      appointmentsRes.json().catch(() => []),
      announcementsRes.json().catch(() => []),
      authRes.json().catch(() => ({})),
    ]);

    const role = String(authData?.role || "");

    sessionStorage.setItem(getHomeCacheKey(), JSON.stringify({
      announcements: Array.isArray(announcementsData) ? announcementsData : [],
      messages: Array.isArray(messagesData) ? messagesData : [],
      role,
      currentUserId: String(authData?.id || ""),
      appts: Array.isArray(appointmentsData) ? appointmentsData : [],
      dateOffset: 0,
      crossStats: { pendingLabOrders: 0, overdueInstallments: 0, todayInstallments: 0 },
      installmentAgenda: { overdue: [], upcoming: [] },
      todayCiro: 0,
      liveLogs: [],
      lastSyncAt: new Date().toISOString(),
    }));
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      id: String(authData?.id || ""),
      fullName: String(authData?.fullName || ""),
      role,
    }));
  } catch {
    // Sessizce bırak: warmup kritik akışı engellememeli.
  }
}

async function warmPatients() {
  try {
    const res = await fetch("/api/patients?q=", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.patients) ? data.patients : []);
    sessionStorage.setItem("patients:list:", JSON.stringify(rows));
  } catch {
    // Sessizce bırak: warmup kritik akışı engellememeli.
  }
}

async function warmTasks() {
  try {
    const res = await fetch("/api/clinic-tasks?take=300&scope=mine&status=ACIK", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    sessionStorage.setItem("clinic-tasks:list:mine:ACIK", JSON.stringify({ tasks: rows }));
  } catch {
    // Sessizce bırak: warmup kritik akışı engellememeli.
  }
}

async function warmLab() {
  try {
    const [ordersRes, patientsRes, staffRes] = await Promise.all([
      fetch("/api/lab-orders", { cache: "no-store" }),
      fetch("/api/patients?limit=200", { cache: "no-store" }),
      fetch("/api/staff", { cache: "no-store" }),
    ]);

    const [ordersData, patientsData, staffData] = await Promise.all([
      ordersRes.json().catch(() => []),
      patientsRes.json().catch(() => ({})),
      staffRes.json().catch(() => []),
    ]);

    const orders = Array.isArray(ordersData) ? ordersData : [];
    const patients = Array.isArray(patientsData) ? patientsData : (patientsData?.patients || []);
    const doctors = (Array.isArray(staffData) ? staffData : []).filter((staff) => staff?.role === "DOKTOR");

    sessionStorage.setItem(LAB_CACHE_KEY, JSON.stringify({ orders, patients, doctors }));
  } catch {
    // Sessizce bırak: warmup kritik akışı engellememeli.
  }
}

async function warmDashboard() {
  try {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 90);
    const to = new Date(today);
    const [meRes, apptRes, followRes, staffRes, taskRes] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }),
      fetch(`/api/patient-follow-ups?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }),
      fetch("/api/staff", { cache: "no-store" }),
      fetch("/api/clinic-tasks?take=200", { cache: "no-store" }),
    ]);

    const [meData, apptData, followData, staffData, taskData] = await Promise.all([
      meRes.json().catch(() => ({})),
      apptRes.json().catch(() => []),
      followRes.json().catch(() => []),
      staffRes.json().catch(() => []),
      taskRes.json().catch(() => []),
    ]);

    sessionStorage.setItem("hasta-takip:dashboard:90", JSON.stringify({
      userRole: String(meData?.role || ""),
      appointments: Array.isArray(apptData) ? apptData : [],
      followUps: Array.isArray(followData) ? followData : [],
      staff: Array.isArray(staffData) ? staffData : [],
      clinicTasks: Array.isArray(taskData) ? taskData : [],
    }));
  } catch {
    // Sessizce bırak: warmup kritik akışı engellememeli.
  }
}

export function PanelRouteWarmup() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    installFastFetch();
    if (sessionStorage.getItem(WARMUP_KEY) === "1") return;
    sessionStorage.setItem(WARMUP_KEY, "1");

    void Promise.allSettled([
      warmPatients(),
      warmTasks(),
      warmDashboard(),
      warmHome(),
      warmLab(),
    ]);
  }, []);

  return null;
}
