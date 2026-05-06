"use client";

import { useEffect, useRef } from "react";

export function PanelRealtimeSync() {
  const sourceRef = useRef<EventSource | null>(null);
  const lastKeyRef = useRef("");

  useEffect(() => {
    let unmounted = false;

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

      source.onerror = () => {
        // EventSource has built-in retry behavior.
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  return null;
}
