"use client";

import { useEffect } from "react";
import { ROLE_PREVIEW_STORAGE } from "@/lib/role-preview";

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

export function PanelCacheReset({ scopeKey, rolePreviewSession = false }: { scopeKey: string; rolePreviewSession?: boolean }) {
  // Rol önizlemesi yalnız sistem sahibi oturumunda geçerlidir. Aynı sekmede
  // önce sistem sahibi sonra klinik personeli oturum açarsa eski önizleme
  // yazısı (bazı ekranlar sessionStorage'dan okur) yanlış rol gösteriyordu.
  useEffect(() => {
    if (rolePreviewSession) return;
    try {
      sessionStorage.removeItem(ROLE_PREVIEW_STORAGE);
    } catch {
      // depolama kapalı olabilir
    }
  }, [rolePreviewSession]);

  useEffect(() => {
    const expected = `${PANEL_CACHE_VERSION}:${scopeKey}`;
    // Depolama kapalıysa (gizli pencere, engellenmiş site verisi) temizlenecek
    // önbellek de yoktur; hata panelin tamamını hata ekranına düşürmesin.
    try {
      const current = sessionStorage.getItem("panel-cache-version");
      if (current === expected) return;

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

      // "clinic-messages-last-seen:" (ekip mesajlarını en son ne zaman gördüm)
      // önbellek değil, kullanıcının okundu işaretidir ve anahtarı zaten
      // kullanıcı/kurum/şube kapsamlıdır. Önceden her yeni tarayıcı oturumunda
      // (sessionStorage boş) silindiği için zil ve sekme başlığı son 7 günün
      // tüm mesajlarını "yeni" sayıyordu.
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith("panel-alerts:")
          || key.startsWith("clinic-unread-messages:")
          || key.startsWith("klinikcep-active-price-list:")
        ) localStorage.removeItem(key);
      }

      sessionStorage.setItem("panel-cache-version", expected);
    } catch {
      // depolama kapalı olabilir
    }
  }, [scopeKey]);

  return null;
}
