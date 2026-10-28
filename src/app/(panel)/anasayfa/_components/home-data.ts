"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeSummary } from "@/app/api/dashboard/today/home-summary-types";

// Ana sayfanın veri katmanı. Açılışta yalnız ekranda gösterilen veriler
// birbirini beklemeden (paralel) istenir; sayılar tek özet isteğinden gelir.
// Yenileme: başka personelin kaydı (gerçek zamanlı olay) 1,5 sn birleştirilip
// tek kez; sekme arka plandayken istek atılmaz, sekmeye dönülünce bir kez.
// Yenileme başarısız olursa eldeki veri ekranda kalır (yanında uyarı).

type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

export const CONNECTION_ERROR = "Bağlantı kurulamadı. Tekrar deneyin.";

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
  const text = body?.message ?? body?.error;
  return typeof text === "string" && text.trim() ? text : fallback;
}

/**
 * Tek uçtan veri: aynı anda tek istek sırası (eski yanıt yenisinin üstüne
 * yazılmaz); hata olursa eldeki veri korunur, hata ayrıca döner.
 */
function useApiResource<T>(url: string | null, fallbackError: string, parse: (body: unknown) => T) {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: Boolean(url), error: null });
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const seq = ++seqRef.current;
    setState((previous) => ({ ...previous, loading: true }));
    let response: Response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch {
      if (seq === seqRef.current) setState((previous) => ({ ...previous, loading: false, error: CONNECTION_ERROR }));
      return;
    }
    if (!response.ok) {
      const message = await readApiError(response, fallbackError);
      if (seq === seqRef.current) setState((previous) => ({ ...previous, loading: false, error: message }));
      return;
    }
    const body = await response.json().catch(() => undefined);
    if (seq !== seqRef.current) return;
    if (body === undefined) {
      setState((previous) => ({ ...previous, loading: false, error: fallbackError }));
      return;
    }
    setState({ data: parse(body), loading: false, error: null });
  }, [fallbackError, parse, url]);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    void load();
  }, [load, url]);

  const update = useCallback((updater: (current: T | null) => T | null) => {
    setState((previous) => ({ ...previous, data: updater(previous.data) }));
  }, []);

  return { ...state, reload: load, update };
}

const parseSummary = (body: unknown) => body as HomeSummary;

export function useHomeSummary() {
  return useApiResource("/api/dashboard/today?ozet=1", "Günlük özet yüklenemedi.", parseSummary);
}

/**
 * Başka personelin yaptığı değişiklikte (ks:realtime-sync) ekranı yeniler:
 * arka arkaya gelen olaylar tek yenilemede birleşir; sekme gizliyken istek
 * atılmaz, görünür olunca bir kez yenilenir. Sekme uzun süre (1 dk+) arka
 * planda kaldıysa olay gelmemiş olsa da bir kez yenilenir (bağlantı kopmuş
 * olabilir).
 */
export function useLiveRefresh(onRefresh: () => void, delayMs = 1500) {
  const callbackRef = useRef(onRefresh);
  useEffect(() => {
    callbackRef.current = onRefresh;
  });

  useEffect(() => {
    let timer: number | null = null;
    let pending = false;
    let hiddenAt = 0;
    const fire = () => {
      timer = null;
      pending = false;
      callbackRef.current();
    };
    const schedule = () => {
      if (document.hidden) {
        pending = true;
        return;
      }
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(fire, delayMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const longAway = hiddenAt > 0 && Date.now() - hiddenAt > 60_000;
      hiddenAt = 0;
      if (pending || longAway) schedule();
    };
    window.addEventListener("ks:realtime-sync", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs]);
}
