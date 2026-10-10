"use client";

import { useCallback, useEffect, useRef } from "react";

type RealtimeOptions = {
  /** İlk olaydan sonra en az bu kadar beklenir (art arda gelen olaylar tek yenilemede birleşir). */
  debounceMs?: number;
  /** İki gerçek zamanlı yenileme arasında en az bu kadar süre olur. */
  minIntervalMs?: number;
  /** Sekme bu süreden uzun gizli kaldıysa (bağlantı uyumuş olabilir) dönüşte bir kez yenilenir. */
  staleAfterHiddenMs?: number;
};

/**
 * Başka personelin kaydı geldiğinde (SSE → `ks:realtime-sync`) ekranı yeniler.
 * Önceden her olayda 500 ms sonra ve her pencere odağında koşulsuz yeniden
 * yükleniyordu; arka plandaki sekme de istek atıyordu (klinik tek dış IP'yi
 * paylaştığı için istek sınırına yaklaşıyordu).
 * - Olaylar birleştirilir: planlı bir yenileme varken gelen olay yeni istek doğurmaz.
 * - Sekme gizliyken istek atılmaz; görünür olunca bekleyen değişiklik bir kez yüklenir.
 * Dönen `markRefreshed`, kullanıcının kendi kaydından hemen sonra çağrılır: aynı
 * kaydın yankısı olan olay yeni bir istekle hemen ardından yarışmaz.
 */
export function useRealtimeRefresh(onRefresh: () => void, options: RealtimeOptions = {}) {
  const { debounceMs = 600, minIntervalMs = 5_000, staleAfterHiddenMs = 120_000 } = options;
  const callbackRef = useRef(onRefresh);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let hiddenAt = document.hidden ? Date.now() : 0;

    const run = () => {
      timer = null;
      if (document.hidden) {
        pending = true;
        return;
      }
      pending = false;
      lastRunAtRef.current = Date.now();
      callbackRef.current();
    };
    const schedule = () => {
      if (document.hidden) {
        pending = true;
        return;
      }
      // Planlı yenileme bu değişikliği de getirir.
      if (timer) return;
      timer = setTimeout(run, Math.max(debounceMs, lastRunAtRef.current + minIntervalMs - Date.now()));
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (!hiddenAt) hiddenAt = Date.now();
        return;
      }
      const longHidden = hiddenAt > 0 && Date.now() - hiddenAt > staleAfterHiddenMs;
      hiddenAt = 0;
      if (pending || longHidden) schedule();
    };

    window.addEventListener("ks:realtime-sync", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [debounceMs, minIntervalMs, staleAfterHiddenMs]);

  return useCallback(() => {
    lastRunAtRef.current = Date.now();
  }, []);
}

/**
 * Sekme/görünüm verisini yalnız ekrandayken yükler. `signature` (filtreler +
 * yenileme sayacı) son yüklemeden beri değiştiyse görünür olunca BİR kez
 * yükler: sekmeler arasında gidip gelmek aynı veriyi yeniden istemez, gizli
 * sekme başka personelin kaydında istek atmaz.
 */
export function useLoadWhenActive(active: boolean, signature: string, load: () => void) {
  const loadedRef = useRef<string | null>(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!active || loadedRef.current === signature) return;
    loadedRef.current = signature;
    loadRef.current();
  }, [active, signature]);
}
