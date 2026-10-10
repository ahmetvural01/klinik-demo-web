"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Sunucuda useLayoutEffect uyarı verir; tarayıcıda boyamadan önce çalışır.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Pencere her açıldığında (ya da başka kayıtla açıldığında) formu BOYAMADAN
 * önce sıfırlar — önceki açılışın değerleri bir an bile görünmez. Döndürülen
 * `ready`, sıfırlama bittikten sonra true olur: veri istekleri buna bağlanır,
 * böylece açılıştaki ilk çizimde önceki hastanın/türün verisi istenmez.
 * `initKey` boşken pencere kapalıdır.
 */
export function useOpenReset(initKey: string, reset: () => void): boolean {
  const [readyKey, setReadyKey] = useState("");
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useIsomorphicLayoutEffect(() => {
    if (!initKey) {
      setReadyKey("");
      return;
    }
    resetRef.current();
    setReadyKey(initKey);
  }, [initKey]);

  return Boolean(initKey) && readyKey === initKey;
}

/**
 * Pencere açık olarak İLK KEZ oluşturulduğunda (ör. sayfa onu tembel yükleyip
 * yalnız açılınca çiziyorsa) ortak Modal'ın ilk odağı pencere henüz gövdeye
 * eklenmeden çalışıp kaçabiliyor; kullanıcı tutarı yazmadan önce alana
 * tıklamak zorunda kalıyordu. Form hazır olunca odak hâlâ bir pencerenin
 * içinde değilse verilen alana taşınır (yarım saniye kadar dener).
 */
export function useFocusWhenReady(ready: boolean, getTarget: () => HTMLElement | null) {
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active.closest(".ui-modal-panel")) return;
      const target = getTargetRef.current();
      // Pasif alan (ör. doktor listesi henüz yükleniyor) odak almaz: biraz sonra yeniden denenir.
      if (target && !target.matches(":disabled")) {
        target.focus();
        return;
      }
      if (tries < 30) {
        tries += 1;
        frame = window.requestAnimationFrame(attempt);
      }
    };
    frame = window.requestAnimationFrame(attempt);
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);
}
