"use client";

import { useEffect, useRef, useState } from "react";
import { Callout } from "@/components/ui/Callout";

const DISCONNECTED_BADGE_DELAY_MS = 3000;
// Ard arda gelen değişiklikler (ör. bir kayıt + denetim izi + bakiye) tek
// "ks:realtime-sync" olayında birleşir; en geç MAX_WAIT_MS içinde yayınlanır.
const COALESCE_MS = 1200;
const MAX_WAIT_MS = 3000;

type ChangePayload = { key?: string; at?: string; initial?: boolean };

/**
 * Kurumdaki değişiklikleri (SSE) sayfalara "ks:realtime-sync" olayıyla duyurur.
 *
 * - Bağlantının İLK olayı (initial) yalnız taban çizgisidir: önceden her tam
 *   açılışta "değişiklik var" sayılıp sayfa verisi ve kabuk rozetleri ikinci
 *   kez yükleniyordu. Kopma sonrası anahtar değişmişse (kaçırılan değişiklik)
 *   bir kez yayınlanır.
 * - Olaylar 1,2 sn içinde birleştirilir (en fazla 3 sn bekleme).
 * - Sekme gizliyken yayın yapılmaz; "bekleyen var" işaretlenir ve sekme
 *   görünür olunca tek kez yayınlanır (arka plandaki sekmeler istek atmaz).
 */
export function PanelRealtimeSync() {
  const sourceRef = useRef<EventSource | null>(null);
  const lastKeyRef = useRef("");
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unmounted = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let firstQueuedAt = 0;
    let queued: ChangePayload | null = null;
    let hiddenPending: ChangePayload | null = null;

    const publish = (detail: ChangePayload) => {
      window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail }));
    };

    const flush = () => {
      flushTimer = null;
      firstQueuedAt = 0;
      const detail = queued;
      queued = null;
      if (!detail) return;
      if (document.visibilityState === "hidden") {
        hiddenPending = detail;
        return;
      }
      publish(detail);
    };

    const enqueue = (detail: ChangePayload) => {
      queued = detail;
      const now = Date.now();
      if (!firstQueuedAt) firstQueuedAt = now;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, Math.max(0, Math.min(COALESCE_MS, firstQueuedAt + MAX_WAIT_MS - now)));
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || !hiddenPending) return;
      const detail = hiddenPending;
      hiddenPending = null;
      publish(detail);
    };

    const clearDisconnectedTimer = () => {
      if (disconnectedTimerRef.current) {
        clearTimeout(disconnectedTimerRef.current);
        disconnectedTimerRef.current = null;
      }
    };

    const connect = () => {
      if (unmounted) return;

      const source = new EventSource("/api/realtime/stream");
      sourceRef.current = source;

      const onChange = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as ChangePayload;
          const key = payload?.key || "";
          if (!key) return;
          // İlk bağlantı: sayfa verisi zaten taze; yalnız taban çizgisi kaydedilir.
          if (!lastKeyRef.current) {
            lastKeyRef.current = key;
            return;
          }
          if (key === lastKeyRef.current) return;
          lastKeyRef.current = key;
          enqueue(payload);
        } catch {
          // bozuk olay yok sayılır
        }
      };

      source.addEventListener("change", onChange as EventListener);
      source.addEventListener("ping", (() => {}) as EventListener);

      source.onopen = () => {
        clearDisconnectedTimer();
        setShowDisconnected(false);
      };

      source.onerror = () => {
        // EventSource kendisi yeniden dener; kısa kopmalarda uyarı titreşmesin.
        if (!disconnectedTimerRef.current) {
          disconnectedTimerRef.current = setTimeout(() => {
            setShowDisconnected(true);
          }, DISCONNECTED_BADGE_DELAY_MS);
        }
      };
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      clearDisconnectedTimer();
      if (flushTimer) clearTimeout(flushTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  if (!showDisconnected) return null;

  // Ortak uyarı bileşeni (elle yazılmış sarı kutu yerine); ekranın altında, içeriği itmeden.
  return (
    <div className="fixed bottom-4 left-1/2 z-[240] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg shadow-lg">
      <Callout tone="warning" compact title="Bağlantı kesildi, yeniden bağlanılıyor…" />
    </div>
  );
}
