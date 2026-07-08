"use client";

import { useEffect } from "react";

const PANEL_CACHE_VERSION = "panel-cache-v4-demo-visible";

const CACHE_PREFIXES = [
  "patients:list:",
  "lab-orders:",
  "firma:",
  "stock:",
  "randevu:",
  "hasta-takip:",
  "muhasebe:",
  "clinic-tasks:",
];

const CACHE_KEYS = [
  "auth:me:v1",
  "firma:list:v1",
  "stock:list:v1",
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

    sessionStorage.setItem("panel-cache-version", PANEL_CACHE_VERSION);
  }, []);

  return null;
}
