"use client";

import { useEffect, useRef, useState } from "react";

const DISCONNECTED_BADGE_DELAY_MS = 3000;

export function PanelRealtimeSync() {
  const sourceRef = useRef<EventSource | null>(null);
  const lastKeyRef = useRef("");
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unmounted = false;

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
          const payload = JSON.parse(event.data) as { key?: string; at?: string };
          const key = payload?.key || "";
          if (!key || key === lastKeyRef.current) return;

          lastKeyRef.current = key;
          window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail: payload }));
        } catch {
          // ignore malformed event payloads
        }
      };

      source.addEventListener("change", onChange as EventListener);
      source.addEventListener("ping", (() => {}) as EventListener);

      source.onopen = () => {
        // Bağlantı kurulduğunda (ilk kez veya kopma sonrası) rozet varsa kaldır.
        clearDisconnectedTimer();
        setShowDisconnected(false);
      };

      source.onerror = () => {
        // EventSource kendi kendine yeniden dener; kısa kopmalarda titreşim
        // olmasın diye rozeti sadece birkaç saniye sürerse gösteriyoruz.
        if (!disconnectedTimerRef.current) {
          disconnectedTimerRef.current = setTimeout(() => {
            setShowDisconnected(true);
          }, DISCONNECTED_BADGE_DELAY_MS);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      clearDisconnectedTimer();
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  if (!showDisconnected) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 shadow-lg">
      <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500 align-middle" />
      Bağlantı kesildi, yeniden bağlanılıyor…
    </div>
  );
}
