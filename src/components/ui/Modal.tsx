"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { backdropClose } from "@/lib/use-modal-dismiss";
import { confirmDialog, hasConfirmProvider } from "@/lib/confirm-client";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

export type ModalSize = "sm" | "md" | "lg" | "xl";

/**
 * Açık katmanlar (Modal, Drawer, onay penceresi) aria-modal taşır ve gövdeye
 * açılış sırasıyla eklenir; sonuncusu en üstteki katmandır. Esc ve Tab yalnız
 * onda işlenir.
 */
function isTopLayer(element: HTMLElement | null) {
  if (!element) return false;
  const layers = document.querySelectorAll('[aria-modal="true"]');
  return layers[layers.length - 1] === element;
}

/**
 * Otomatik "kirli" sayılmayan alanlar: arama kutuları ve aranabilir seçiciler
 * (yazılan metin bir arama terimidir, formun verisi değildir) ve
 * `data-dirty-ignore` ile işaretlenenler. Arama amaçlı pencere Esc'te onay sormaz.
 */
const DIRTY_IGNORE_SELECTOR = '[data-dirty-ignore], input[type="search"], [role="combobox"]';

// İlk odak: önce `data-autofocus` işaretli öğe, yoksa ilk yazılabilir alan.
// Tek seçicide ikisi birlikte aranınca DOM sırasındaki ilk eşleşme dönüyor,
// işaretli öğe sonda kalınca öncelik hiç çalışmıyordu.
const FIRST_FIELD_SELECTOR = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

const ModalCloseContext = createContext<(() => void) | null>(null);

/**
 * En yakın Modal'ın korumalı kapatması: kirli formda önce "Değişiklikler
 * kaybolsun mu?" diye sorar (bkz. Modal `confirmOnDirtyClose`). Footer'daki
 * "Vazgeç" gibi elle yazılan kapat düğmeleri de Esc ve × ile aynı korumayı
 * alsın diye kullanılır. Modal dışında null döner.
 */
export function useModalClose(): (() => void) | null {
  return useContext(ModalCloseContext);
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  children: ReactNode;
  /**
   * Form kaydedilmemiş değişiklik içeriyorsa true verin. Kirli formda
   * (isDirty ya da otomatik algılanan değişiklik):
   * - arka plan tıklaması pencereyi KAPATMAZ, kalıcı bir "kaydedilmemiş
   *   değişiklik" uyarısı gösterir;
   * - Esc, × ve FormModal "Vazgeç" önce "Değişiklikler kaybolsun mu?" diye
   *   sorar ("Forma dön" / "Kapat"); bkz. `confirmOnDirtyClose`.
   * Temiz formda hepsi doğrudan kapatır.
   */
  isDirty?: boolean;
  /** Modal içindeki input/select/textarea değişikliklerini otomatik olarak
   * kaydedilmemiş değişiklik sayar (arama kutuları ve aranabilir seçiciler
   * hariç). Salt-okunur veya yalnızca arama amaçlı modallarda false verilebilir. */
  trackFormChanges?: boolean;
  /**
   * Kirli formda Esc / × / "Vazgeç" kapatmadan önce onay sorsun (varsayılan
   * true). Kapatma onayını kendisi soran pencere false verir; iki kez sorulmaz.
   */
  confirmOnDirtyClose?: boolean;
  /**
   * true iken Esc, × ve arka plan tıklaması pencereyi kapatmaz (ör. kayıt
   * sürerken). FormModal `submitting` sırasında bunu kendisi verir.
   */
  closeDisabled?: boolean;
  /** Başlığın yanında ilgili modülün görselini gösterir (bkz. ModuleIcon) —
   * opsiyonel, verilmezse eskisi gibi yalnızca metin başlık görünür. */
  module?: ModuleKey;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  closeOnBackdrop = true,
  children,
  isDirty = false,
  trackFormChanges = true,
  module,
  confirmOnDirtyClose = true,
  closeDisabled = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [attention, setAttention] = useState(false);
  const [dirtyDismissWarning, setDirtyDismissWarning] = useState(false);
  const [autoDirty, setAutoDirty] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const effectiveDirty = isDirty || autoDirty;
  const isDirtyRef = useRef(effectiveDirty);
  isDirtyRef.current = effectiveDirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const confirmOnDirtyCloseRef = useRef(confirmOnDirtyClose);
  confirmOnDirtyCloseRef.current = confirmOnDirtyClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;
  const confirmingRef = useRef(false);

  const triggerAttention = () => {
    setDirtyDismissWarning(true);
    setAttention(true);
    window.setTimeout(() => setAttention(false), 220);
  };

  // Esc, × ve "Vazgeç" (useModalClose) buradan geçer. Kirli formda önce onay
  // sorulur: Esc ile uzun formlar uyarısız siliniyordu (canlı H8, H10, H17,
  // H18, O3). Arka plan tıklaması kirli formu hiç kapatmaz (aşağıda).
  const requestClose = useCallback(async () => {
    if (closeDisabledRef.current || confirmingRef.current) return;
    if (confirmOnDirtyCloseRef.current && isDirtyRef.current && hasConfirmProvider()) {
      confirmingRef.current = true;
      let discard = false;
      try {
        discard = await confirmDialog({
          title: "Kaydedilmemiş değişiklikler",
          message: "Değişiklikler kaybolsun mu?",
          confirmText: "Kapat",
          cancelText: "Forma dön",
          danger: true,
        });
      } finally {
        confirmingRef.current = false;
      }
      // Onay beklenirken pencere başka yoldan kapandıysa ikinci kez kapatılmaz.
      if (!discard || !openRef.current) return;
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      // İç bileşen Esc'i kendisi kullandıysa (açık liste/menü kapandı) pencere kapanmaz.
      if (e.defaultPrevented) return;
      // Yalnız en üstteki katman kapanır: üstte onay penceresi (confirmDialog)
      // ya da başka bir pencere varken aynı Esc bu pencereyi de kapatıyordu.
      if (!isTopLayer(backdropRef.current)) return;
      void requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDirtyDismissWarning(false);
    setAutoDirty(false);
  }, [open]);

  useEffect(() => {
    if (!effectiveDirty) setDirtyDismissWarning(false);
  }, [effectiveDirty]);

  useEffect(() => {
    // open=true ile ilk kez bağlanan pencerede portal henüz çizilmemiştir
    // (mounted=false). Odak ancak portal varken verilebilir; yoksa ilk alan
    // odak almıyor, yazılanlar arkadaki sayfaya gidiyordu (stokta ara → miktar).
    if (!open || !mounted) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const preferred = dialog?.querySelector<HTMLElement>("[data-autofocus]")
        || dialog?.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR);
      (preferred || dialog)?.focus();
    });

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (!isTopLayer(backdropRef.current)) return;
      // tabIndex -1 öğeler (seçili olmayan sekme/radyo, menü öğesi) Tab sırasında
      // değildir; listede kalırsa "son öğe" yanlış seçilir ve odak pencereden kaçar.
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.tabIndex >= 0 && !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Odak pencerenin dışındaysa (gövdeye düştü) Tab arkadaki sayfaya gitmesin.
      // Gövdeye çizilen açık liste/menü kendi Tab davranışını yönetir.
      if (!(active instanceof Node && dialog.contains(active))) {
        if (active instanceof Element && active.closest('[role="menu"], [role="listbox"], [data-outside-click-ignore]')) return;
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="ui-modal-backdrop fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-slate-950/40 px-2 pb-2 pt-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(closeOnBackdrop
        ? backdropClose(() => {
            // Kaydedilmemiş değişiklik varken backdrop tıklaması modalı
            // kapatmaz; form içinde kalıcı bir uyarı gösterir.
            if (closeDisabledRef.current) return;
            if (isDirtyRef.current) {
              triggerAttention();
              return;
            }
            onCloseRef.current();
          })
        : {})}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onChangeCapture={(event) => {
          if (!trackFormChanges) return;
          const target = event.target;
          if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
          if (target.disabled || ("readOnly" in target && target.readOnly)) return;
          if (target.closest(DIRTY_IGNORE_SELECTOR)) return;
          setAutoDirty(true);
        }}
        className={`ui-modal-panel flex max-h-[calc(100dvh-20px)] w-full flex-col rounded-t-xl border border-slate-200 bg-[rgb(var(--app-surface))] shadow-[var(--shadow-floating)] outline-none sm:max-h-[calc(100dvh-32px)] sm:rounded-xl ${SIZE_CLASS[size]} ${attention ? "ui-modal-panel-attention" : ""}`}
      >
        <div className="ui-modal-header flex shrink-0 items-start justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-transparent px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {module && <span className="ui-modal-module-icon"><ModuleIcon module={module} size="md" className="shrink-0" /></span>}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-[17px] font-bold text-slate-900">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
              {dirtyDismissWarning && effectiveDirty && (
                <p role="status" aria-live="polite" className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  Kaydedilmemiş değişiklik var. Form açık tutuldu.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="Kapat"
            // Telefonda 40px dokunma alanı (Drawer'ın kapat düğmesiyle aynı); geniş ekranda 32px.
            className="ui-modal-close flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <ModalCloseContext.Provider value={requestClose}>
          {/* Telefonda footer kaydırma alanının içinde yapışık durur; alanın alt
              dolgusu sıfırlanır, yoksa footer dolgu kadar yukarıda kalıyor ve
              içerik altından görünüyordu (canlı D4). scroll-padding: odaklanan
              alan yapışık footer'ın altında kalmasın. */}
          <div className={`min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 pt-4 sm:px-5 sm:pb-4 ${footer ? "pb-0 scroll-pb-24 sm:scroll-pb-0" : "pb-4"}`}>
            {children}
            {footer && (
              // Mobilde Kaydet/Vazgeç uzun formun en altında kayboluyordu; kaydırma
              // alanının altına yapışık durur (klavye açıkken de erişilebilir).
              <div className="ui-modal-footer sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-[rgb(var(--app-surface))] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
                {footer}
              </div>
            )}
          </div>
          {footer && (
            <div className="ui-modal-footer hidden shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/75 px-4 py-3 sm:flex sm:px-5">
              {footer}
            </div>
          )}
        </ModalCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
