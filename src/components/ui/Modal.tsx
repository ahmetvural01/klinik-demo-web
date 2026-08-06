"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { backdropClose } from "@/lib/use-modal-dismiss";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

export type ModalSize = "sm" | "md" | "lg" | "xl";

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
   * Form kaydedilmemiş değişiklik içeriyorsa true verin. true iken:
   * - backdrop tıklaması modalı KAPATMAZ, kalıcı bir "kaydedilmemiş değişiklik"
   *   uyarısı gösterir.
   * - ESC / X / footer iptal aksiyonları onay istemeden modalı kapatır.
   * Verilmezse (varsayılan false) davranış tamamen eskisiyle aynıdır — mevcut
   * çağıran kodlar hiçbir değişiklik yapmadan çalışmaya devam eder.
   */
  isDirty?: boolean;
  /** Modal içindeki input/select/textarea değişikliklerini otomatik olarak
   * kaydedilmemiş değişiklik sayar. Salt-okunur veya yalnızca arama amaçlı
   * modallarda false verilebilir. */
  trackFormChanges?: boolean;
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
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [attention, setAttention] = useState(false);
  const [dirtyDismissWarning, setDirtyDismissWarning] = useState(false);
  const [autoDirty, setAutoDirty] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const effectiveDirty = isDirty || autoDirty;
  const isDirtyRef = useRef(effectiveDirty);
  isDirtyRef.current = effectiveDirty;

  const triggerAttention = () => {
    setDirtyDismissWarning(true);
    setAttention(true);
    window.setTimeout(() => setAttention(false), 220);
  };

  // ESC/X her zaman kapatır. Dirty formu yalnızca backdrop tıklaması korur ve
  // kullanıcıya form içinde kalıcı bir uyarı gösterir.
  const requestCloseRef = useRef<() => void | Promise<void>>(() => {});
  requestCloseRef.current = () => onClose();
  const requestClose = () => requestCloseRef.current();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const preferred = dialog?.querySelector<HTMLElement>("[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      (preferred || dialog)?.focus();
    });

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="ui-modal-backdrop fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/40 px-2 pb-2 pt-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(closeOnBackdrop
        ? backdropClose(() => {
            // Kaydedilmemiş değişiklik varken backdrop tıklaması modalı
            // kapatmaz; form içinde kalıcı bir uyarı gösterir.
            if (isDirtyRef.current) {
              triggerAttention();
              return;
            }
            onClose();
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
          setAutoDirty(true);
        }}
        className={`ui-modal-panel flex max-h-[calc(100dvh-20px)] w-full flex-col rounded-t-xl border border-slate-200 bg-[rgb(var(--app-surface))] shadow-[var(--shadow-floating)] outline-none sm:max-h-[calc(100dvh-32px)] sm:rounded-xl ${SIZE_CLASS[size]} ${attention ? "ui-modal-panel-attention" : ""}`}
      >
        <div className="ui-modal-header flex shrink-0 items-start justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-transparent px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {module && <span className="ui-modal-module-icon"><ModuleIcon module={module} size="md" className="shrink-0" /></span>}
            <div className="min-w-0">
              <span className="ui-page-header-eyebrow">Klinik işlemi</span>
              <h2 id={titleId} className="mt-0.5 font-display text-[17px] font-bold text-slate-900">{title}</h2>
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
            className="ui-modal-close flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5">
          {children}
          {footer && (
            <div className="ui-modal-footer mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 sm:hidden">
              {footer}
            </div>
          )}
        </div>
        {footer && (
          <div className="ui-modal-footer hidden shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/75 px-4 py-3 sm:flex sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
