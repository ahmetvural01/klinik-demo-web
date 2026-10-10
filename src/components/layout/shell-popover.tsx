"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type ShellPopoverProps = {
  open: boolean;
  onClose: () => void;
  /** Pencerenin hizalandığı tetikleyici (kapanınca odak buraya döner). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Pencere başlığı; ekran okuyucu pencereyi bu adla duyurur. */
  title: string;
  id?: string;
  width?: number;
  /** "end": sağ kenar tetikleyiciyle hizalı (sağdaki düğmeler); "start": sol kenar. */
  align?: "start" | "end";
  children: ReactNode;
};

/**
 * Üst bardaki açılır pencere (Bekleyen işler, Bekleme salonu, şube seçimi).
 * Gövdeye taşınır (portal) ve tetikleyicinin altına, ekran içinde kalacak
 * biçimde hizalanır. Önceden bu pencereler kendi dış-tıklama dinleyicisinde
 * pencerenin içini "dışarısı" sayıyordu: bağlantıya dokunulduğu anda pencere
 * kapanıyor, tıklama hedefe ulaşmıyordu (canlı test Y2). Burada içerideki
 * tıklama yok sayılır; Esc kapatır ve odak tetikleyiciye döner.
 */
export function ShellPopover({ open, onClose, anchorRef, title, id, width = 320, align = "end", children }: ShellPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const place = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = Math.min(width, window.innerWidth - 16);
    const preferred = align === "start" ? rect.left : rect.right - panelWidth;
    const left = Math.max(8, Math.min(preferred, window.innerWidth - panelWidth - 8));
    setPosition({ top: Math.round(rect.bottom + 8), left: Math.round(left), width: panelWidth });
  }, [align, anchorRef, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-outside-click-ignore]")) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Üstte açık pencere (Modal/Drawer) varsa Esc onundur.
      if (document.querySelector('[aria-modal="true"]')) return;
      onCloseRef.current();
      anchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // Klavye kullanıcısı için odak pencerenin ilk bağlantısına geçer.
    // (Ekran genişliğine göre gizlenen bölümler atlanır: görünür ilk öğe.)
    const frame = window.requestAnimationFrame(() => {
      const candidates = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") || [];
      Array.from(candidates).find((element) => element.getClientRects().length > 0)?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, open, place]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={title}
      data-outside-click-ignore
      className="ui-popover fixed z-[260] flex max-h-[min(80vh,34rem)] flex-col overflow-hidden"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: position?.width ?? width }}
    >
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>,
    document.body,
  );
}
