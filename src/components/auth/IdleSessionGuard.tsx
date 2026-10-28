"use client";

import { useEffect } from "react";

const ACTIVITY_KEY = "ks:last-activity";
const LOGOUT_KEY = "ks:idle-logout";
const REFRESH_EVERY_MS = 10 * 60_000;
const WRITE_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 30_000;
const LOGIN_PATH = "/klinik/giris?neden=zaman-asimi";

function readShared(key: string) {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Gizli sekme / depolama kapalı: sekme kendi sayacıyla devam eder.
  }
}

/**
 * "Oturumu açık tut" işaretlenmeden girilen oturumlarda: 2 saat boyunca
 * fare, klavye ya da dokunma olmazsa oturum kapanır ve giriş ekranı açılır
 * (hasta bilgisi açık ekranda kalmaz). Son işlem zamanı açık sekmeler
 * arasında paylaşılır: bir sekmede çalışan kullanıcı diğerinden de atılmaz.
 * Kullanıcı çalıştıkça sunucu oturumu da uzatılır (/api/auth/refresh).
 */
export function IdleSessionGuard({ timeoutMinutes }: { timeoutMinutes: number }) {
  useEffect(() => {
    const timeoutMs = timeoutMinutes * 60_000;
    let lastWrite = 0;
    // Sayfa açılışı da işlemdir: ilk hareket oturumu hemen uzatır.
    let lastRefresh = 0;
    let loggingOut = false;

    const logout = () => {
      if (loggingOut) return;
      loggingOut = true;
      writeShared(LOGOUT_KEY, Date.now());
      void fetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => window.location.replace(LOGIN_PATH));
    };

    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite >= WRITE_EVERY_MS) {
        lastWrite = now;
        writeShared(ACTIVITY_KEY, now);
      }
      if (now - lastRefresh >= REFRESH_EVERY_MS) {
        lastRefresh = now;
        void fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
      }
    };

    const check = () => {
      const last = Math.max(readShared(ACTIVITY_KEY), lastWrite);
      if (last > 0 && Date.now() - last >= timeoutMs) logout();
    };

    const onStorage = (event: StorageEvent) => {
      // Başka sekmede süre doldu: bu sekme de giriş ekranına geçer.
      if (event.key === LOGOUT_KEY && event.newValue && !loggingOut) {
        loggingOut = true;
        window.location.replace(LOGIN_PATH);
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };

    // Sayfanın açılması bir işlemdir (yeni girişte eski sekmenin zamanı kullanılmaz).
    // Uykudan uyanan açık sayfayı aralıklı denetim ve görünürlük olayı yakalar.
    markActivity();

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"];
    events.forEach((name) => window.addEventListener(name, markActivity, { passive: true, capture: true }));
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      events.forEach((name) => window.removeEventListener(name, markActivity, { capture: true }));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [timeoutMinutes]);

  return null;
}
