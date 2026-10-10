"use client";

import { useEffect, useRef, type ReactNode } from "react";

type TooltipProps = {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
};

const POSITION = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  // Boşluk `left` ile verilir: globals.css `.ui-tooltip` margin-left'i
  // (--ui-tooltip-shift) taşma kaydırması için kullanır, ml-2'yi ezerdi.
  right: "left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2",
};

// Balonun ekran kenarına en yakın duracağı mesafe (px).
const EDGE = 8;

/**
 * Fareyle üzerine gelince ya da klavye odağında görünen kısa ipucu (yalnız
 * görsel). Ekran okuyucu adı tetikleyicinin kendi `aria-label`'ından gelir
 * (IconButton `title`'ı ikisine de verir); balon gizlenmezse göz atma
 * kipinde düğme adı iki kez okunuyordu ("Düzenle düğmesi, Düzenle").
 *
 * Kapalı balon yerleşime girmez (globals.css `.ui-tooltip` display:none):
 * önceden saydam balon sağ kenardaki ikon düğmesinde sayfayı yatay
 * taşırıyordu. Açılınca ekran dışına taşıyorsa içeri kaydırılır.
 */
export function Tooltip({ label, children, side = "top", className = "" }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const escListenerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  // Balon açıkken Esc onu kapatır (WCAG 1.4.13). Olay durdurulmaz: aynı Esc
  // açık pencereyi de kapatabilir. Fare ayrılınca / odak çıkınca sıfırlanır.
  const listenForEscape = () => {
    if (escListenerRef.current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") triggerRef.current?.setAttribute("data-tip-dismissed", "");
    };
    escListenerRef.current = onKeyDown;
    document.addEventListener("keydown", onKeyDown);
  };

  const reset = () => {
    const trigger = triggerRef.current;
    if (trigger?.matches(":hover") || trigger?.contains(document.activeElement)) return;
    trigger?.removeAttribute("data-tip-dismissed");
    if (escListenerRef.current) document.removeEventListener("keydown", escListenerRef.current);
    escListenerRef.current = null;
  };

  useEffect(() => () => {
    if (escListenerRef.current) document.removeEventListener("keydown", escListenerRef.current);
  }, []);

  const fitToViewport = () => {
    listenForEscape();
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.removeProperty("--ui-tooltip-shift");
    window.requestAnimationFrame(() => {
      const rect = tip.getBoundingClientRect();
      if (!rect.width) return;
      const viewport = document.documentElement.clientWidth;
      const shift = rect.right > viewport - EDGE ? viewport - EDGE - rect.right
        : rect.left < EDGE ? EDGE - rect.left : 0;
      if (shift) tip.style.setProperty("--ui-tooltip-shift", `${Math.round(shift)}px`);
    });
  };

  return (
    <span
      ref={triggerRef}
      className={`ui-tooltip-trigger relative inline-flex ${className}`}
      onMouseEnter={fitToViewport}
      onFocus={fitToViewport}
      // Ayrılma olayında :hover henüz düşmemiş olabilir; kontrol bir sonraki karede.
      onMouseLeave={() => window.requestAnimationFrame(reset)}
      onBlur={() => window.requestAnimationFrame(reset)}
    >
      {children}
      <span ref={tipRef} aria-hidden="true" className={`ui-tooltip ${POSITION[side]}`}>
        {label}
      </span>
    </span>
  );
}
