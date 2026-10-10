"use client";

import { useCallback, useEffect, useRef } from "react";

// Klinikte bir kayıt değişince gelen gerçek zamanlı olaylar art arda
// gelebilir (ör. görüşme + arama güncellemesi); tek yenilemede birleştirilir.
const REALTIME_DEBOUNCE_MS = 1_200;
const REALTIME_MAX_WAIT_MS = 4_000;
// Olay kaçtıysa (bağlantı koptu) sekmeye dönüşte en geç bu kadar eski veri yenilenir.
const IDLE_REFRESH_MS = 5 * 60_000;

/**
 * İki listenin (Hasta aramaları, Ekip görevleri) ortak yenileme kuralı:
 * - Gerçek zamanlı olay birleştirilir (1,2 sn; en çok 4 sn bekler).
 * - Tarayıcı sekmesi gizliyken ya da liste görünmüyorken istek atılmaz;
 *   "bayat" işaretlenir ve görünür olunca bir kez yenilenir.
 * - Sekmeye dönüşte yalnız bayatsa (ya da 5 dakikadan eskiyse) yenilenir.
 * Önceden her olayda 300-400 ms sonra ve her sekme dönüşünde koşulsuz yeniden
 * yükleniyordu; Hasta Takip ayrıca izin yoklaması yüzünden 15 sn'de bir üç
 * ağır isteği tekrarlıyordu (hız raporu TG1, G4).
 *
 * Dönen `refresh` hemen yükler (ilk açılış, süzgeç değişimi, "Yeniden dene").
 */
export function useWorkListRefresh(load: () => void, active: boolean) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const activeRef = useRef(active);
  activeRef.current = active;
  // Liste açılışta kendisi yükler; "son yükleme" o an sayılır (dönüşte gereksiz ikinci istek olmasın).
  const state = useRef<{ stale: boolean; lastAt: number; timer: number | null; firstEventAt: number }>({ stale: false, lastAt: Date.now(), timer: null, firstEventAt: 0 });

  const refresh = useCallback(() => {
    const current = state.current;
    if (current.timer) window.clearTimeout(current.timer);
    current.timer = null;
    current.firstEventAt = 0;
    current.stale = false;
    current.lastAt = Date.now();
    loadRef.current();
  }, []);

  useEffect(() => {
    const current = state.current;
    const onRealtime = () => {
      if (document.hidden || !activeRef.current) {
        current.stale = true;
        return;
      }
      const now = Date.now();
      if (!current.firstEventAt) current.firstEventAt = now;
      if (current.timer) window.clearTimeout(current.timer);
      const wait = Math.max(0, Math.min(REALTIME_DEBOUNCE_MS, REALTIME_MAX_WAIT_MS - (now - current.firstEventAt)));
      current.timer = window.setTimeout(refresh, wait);
    };
    const onVisibility = () => {
      if (document.hidden || !activeRef.current) return;
      if (current.stale || Date.now() - current.lastAt > IDLE_REFRESH_MS) refresh();
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("ks:realtime-sync", onRealtime);
      document.removeEventListener("visibilitychange", onVisibility);
      if (current.timer) window.clearTimeout(current.timer);
      current.timer = null;
    };
  }, [refresh]);

  // Liste yeniden görünür olunca (sekme değişimi) arada değişiklik olduysa bir kez yenile.
  useEffect(() => {
    if (active && state.current.stale && !document.hidden) refresh();
  }, [active, refresh]);

  return refresh;
}
