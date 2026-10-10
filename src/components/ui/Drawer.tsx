"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type DrawerSide = "right" | "left";
export type DrawerSize = "sm" | "md" | "lg";

// sm: dar menü — mobilde ekranın %86'sı; kenarda arka plan görünür kalır ki
// dokunarak kapatılabilsin. md/lg: mobilde tam genişlik, geniş ekranda sabit.
const SIZE_CLASS: Record<DrawerSize, string> = {
  sm: "w-[min(86vw,20rem)]",
  md: "w-full sm:w-[28rem]",
  lg: "w-full sm:w-[40rem]",
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => element.tabIndex >= 0 && !element.hasAttribute("hidden") && element.getClientRects().length > 0);
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Panel başlığı (Modal ile aynı ölçü). Ekran okuyucu paneli bu adla duyurur. */
  title: ReactNode;
  /** Başlık altında tek satır açıklama — gerekmedikçe verme. */
  description?: ReactNode;
  /** Açıldığı kenar. Varsayılan "right"; mobil menü "left". */
  side?: DrawerSide;
  /** sm 320px (menü) · md 448px (liste/ayrıntı, varsayılan) · lg 640px (geniş liste/ayrıntı). Form taşımaz: form her zaman FormModal'dır. */
  size?: DrawerSize;
  /** Altta sabit eylem şeridi: genelde tek "Kapat"; listeye ait tek birincil eylem (ör. "Tümünü onayla") olabilir. */
  footer?: ReactNode;
  /** Arka plana tıklayınca kapansın mı (varsayılan true). */
  closeOnBackdrop?: boolean;
  /** "md": iç boşluklu içerik. "none": kenara dayalı liste/menü (kendi boşluğunu verir). */
  padding?: "md" | "none";
  /** Panel kimliği — tetikleyici düğmede aria-controls için. */
  id?: string;
  children: ReactNode;
}

/**
 * Yandan açılan katman: mobil menü, "Bekleyenler" gibi sayfayı kapatmadan
 * bakılan listeler, art arda bakılan kayıtların ayrıntısı. Form taşımaz (form,
 * kısa ya da uzun, FormModal'dır: Enter, çift gönderim ve kayıt sürerken
 * kapanmama koruması orada). Modal'ın başlık/footer dilini kullanır; farkı
 * ekranın kenarına yapışması ve tam boy olmasıdır.
 *
 * Erişilebilirlik: role="dialog" + aria-modal, başlık/açıklama bağlı; açılınca
 * odak panele (ya da içindeki [data-autofocus] öğeye) gider — mobilde klavye
 * kendiliğinden açılmasın diye ilk giriş alanına otomatik odaklanmaz. Tab
 * panel içinde döner, Esc ve arka plan tıklaması kapatır, kapanınca odak
 * açan düğmeye döner, arkadaki sayfa kaymaz. Üstte başka pencere (Modal,
 * onay) ya da açık menü varken Esc/Tab onlarındır.
 *
 *   <Drawer open={open} onClose={() => setOpen(false)} title="Bekleyenler"
 *     footer={<Button variant="secondary" onClick={() => setOpen(false)}>Kapat</Button>}>
 *     ...
 *   </Drawer>
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  size = "md",
  footer,
  closeOnBackdrop = true,
  padding = "md",
  id,
  children,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Kapatma/kenar her render'da değişebilir; dinleyiciler yeniden kurulmadan güncel değeri okusun.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sideRef = useRef(side);
  sideRef.current = side;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      // Tek seferlik kısa kayma (sürekli animasyon değil); globals.css'e yeni keyframe gerekmez.
      panel?.animate?.(
        [{ transform: sideRef.current === "right" ? "translateX(100%)" : "translateX(-100%)" }, { transform: "translateX(0)" }],
        { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
      backdropRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "linear" });
    }

    const frame = window.requestAnimationFrame(() => {
      const current = panelRef.current;
      const preferred = current?.querySelector<HTMLElement>("[data-autofocus]");
      (preferred || current)?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      const current = panelRef.current;
      if (!current) return;
      // Yalnız en üstteki katman tepki verir: panelden sonra açılan Modal / onay penceresi varsa olay onundur.
      const layers = document.querySelectorAll('[aria-modal="true"]');
      if (layers[layers.length - 1] !== current) return;
      const active = document.activeElement;
      const inside = active instanceof Node && current.contains(active);
      // Odak paneldeki bir açılır menüdeyse (gövdeye çizilen ActionMenu vb.) tuşu menü işler.
      if (!inside && active instanceof Element && active.closest('[role="menu"], [role="listbox"]')) return;

      if (event.key === "Escape") {
        // İç bileşen Esc'i kendisi kullandıysa (ör. açık liste kapandı) panel kapanmaz.
        if (event.defaultPrevented) return;
        // Alttaki bir Modal da aynı Esc ile kapanmasın.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      const focusable = focusableIn(current);
      if (!inside || focusable.length === 0) {
        event.preventDefault();
        (focusable[0] || current).focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (active === first || active === current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousActive?.isConnected) previousActive.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={`ui-drawer fixed inset-0 z-[var(--z-drawer)] flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`ui-drawer-panel relative flex h-full max-w-full flex-col bg-[rgb(var(--app-surface))] pt-[env(safe-area-inset-top)] shadow-[var(--shadow-floating)] outline-none ${side === "right" ? "border-l" : "border-r"} border-slate-200 ${SIZE_CLASS[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 pt-1">
            <h2 id={titleId} className="font-display text-[17px] font-bold leading-6 text-slate-900">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Kapat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${padding === "none" ? "" : "px-4 py-4 sm:px-5"} ${footer ? "" : "pb-[max(1rem,env(safe-area-inset-bottom))]"}`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/75 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
