"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog, type ConfirmOptions } from "@/lib/confirm-client";

const DEFAULT_CONFIRM: ConfirmOptions = {
  title: "Kaydedilmemiş değişiklik var",
  message: "Bu sayfadan çıkarsanız kaydetmediğiniz değişiklikler kaybolur.",
  confirmText: "Kaydetmeden çık",
  cancelText: "Sayfada kal",
  danger: true,
};

/** Tıklanan bağlantı bu sekmede başka bir panel sayfasına mı gidiyor? */
function internalTarget(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Aynı sayfanın sekmesi/çapası (ör. /ayar?tab=randevu) formu korur; uyarı gerekmez.
  if (url.pathname === window.location.pathname) return null;
  return url;
}

/** Geri düğmesi bekçisi: kirli formda aynı adrese eklenen geçmiş kaydının işareti. */
const BACK_GUARD_KEY = "__ksUnsavedGuard";

function isBackGuardState(state: unknown) {
  return typeof state === "object" && state !== null && BACK_GUARD_KEY in state;
}

/**
 * Form kirliyken sayfadan çıkışı korur: tarayıcı kapatma/yenilemede
 * `beforeunload`, uygulama içi bağlantılarda (menü, üst bar, sayfa içi
 * bağlantılar) ve tarayıcının Geri düğmesinde onay penceresi. Önceden yalnız
 * `beforeunload` vardı; menüden ya da Geri ile başka sayfaya geçince
 * değişiklikler uyarısız kayboluyordu.
 *
 * Tıklama belge düzeyinde yakalama evresinde durdurulur (kabuk bileşenlerine
 * dokunmadan); kullanıcı onaylarsa aynı adrese router.push ile gidilir.
 * Geri için form kirlenince aynı adrese bir bekçi kaydı eklenir: Geri önce
 * bu kaydı düşürür (sayfa değişmez) ve onay sorulur; kalınırsa bekçi yeniden
 * eklenir, çıkılırsa bir adım daha geri gidilir.
 */
export function useUnsavedChangesGuard(dirty: boolean, options?: Partial<ConfirmOptions>) {
  const router = useRouter();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!dirty) return;
    let asking = false;
    let leaving = false;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    // Mevcut kaydın Next.js durumu korunarak kopyalanır (popstate'te sayfa yeniden yüklenmesin).
    const pushBackGuard = () => {
      const current = typeof window.history.state === "object" && window.history.state !== null ? window.history.state : {};
      window.history.pushState({ ...current, [BACK_GUARD_KEY]: true }, "", window.location.href);
    };
    if (!isBackGuardState(window.history.state)) pushBackGuard();
    const onPopState = () => {
      if (leaving || asking) return;
      asking = true;
      void confirmDialog({ ...DEFAULT_CONFIRM, ...optionsRef.current })
        .then((leave) => {
          if (leave) {
            leaving = true;
            window.history.back();
          } else {
            pushBackGuard();
          }
        })
        .finally(() => {
          asking = false;
        });
    };
    const onClick = (event: MouseEvent) => {
      const url = internalTarget(event);
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      if (asking) return;
      asking = true;
      void confirmDialog({ ...DEFAULT_CONFIRM, ...optionsRef.current })
        .then((leave) => {
          if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
        })
        .finally(() => {
          asking = false;
        });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      // Form kaydedildi ya da temizlendi (sayfadayız): bekçi kaydı düşürülür ki
      // sonraki Geri bir kez basışta önceki sayfaya gitsin.
      if (!leaving && isBackGuardState(window.history.state)) window.history.back();
    };
  }, [dirty, router]);
}
