"use client";

import { useCallback, useEffect, useRef } from "react";

export type LatestRequest = {
  signal: AbortSignal;
  isLatest: () => boolean;
};

// Arama, filtre, sayfalama ve sekme değişimlerinde eski ağ yanıtlarının
// yeni seçimi ezmesini engelleyen ortak istemci sözleşmesi.
export function useLatestRequest() {
  const state = useRef<{ sequence: number; controller: AbortController | null }>({
    sequence: 0,
    controller: null,
  });

  useEffect(() => () => state.current.controller?.abort(), []);

  return useCallback((): LatestRequest => {
    state.current.controller?.abort();
    const controller = new AbortController();
    const sequence = state.current.sequence + 1;
    state.current = { sequence, controller };
    return {
      signal: controller.signal,
      isLatest: () => state.current.sequence === sequence && !controller.signal.aborted,
    };
  }, []);
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
