"use client";

import { useEffect } from "react";

const PANEL_CACHE_VERSION = "panel-cache-v6-live-all";

const CACHE_PREFIXES = [
  "panel-fast-api:v1:",
  "anasayfa:home:v1",
  "patients:list:",
  "lab-orders:",
  "lab:orders:",
  "firma:",
  "stock:",
  "randevu:",
  "hasta-takip:",
  "muhasebe:",
  "clinic-tasks:",
  "panel-alerts:",
];

const CACHE_KEYS = [
  "panel-route-warmup-v3",
  "auth:me:v1",
  "firma:list:v1",
  "stock:list:v1",
  "lab:orders:v1",
  "hasta-takip:dashboard:90",
  "muhasebe:center:v1",
];

export function PanelCacheReset() {
  useEffect(() => {
    const current = sessionStorage.getItem("panel-cache-version");
    if (current === PANEL_CACHE_VERSION) return;

    for (const key of CACHE_KEYS) {
      sessionStorage.removeItem(key);
    }

    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        sessionStorage.removeItem(key);
      }
    }

    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith("panel-alerts:")) localStorage.removeItem(key);
      }
    } catch {}

    sessionStorage.setItem("panel-cache-version", PANEL_CACHE_VERSION);
  }, []);

  return null;
}
