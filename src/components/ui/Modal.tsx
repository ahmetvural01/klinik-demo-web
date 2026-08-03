"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { backdropClose } from "@/lib/use-modal-dismiss";
import { confirmDialog } from "@/lib/confirm-client";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/** Dirty-form kapanma onay metni — modal içeriğinden (ör. footer'daki İptal
 * butonu) da aynı akışı tetiklemek isteyen çağıranlar için dışa açılır, tek
 * kaynak burasıdır (bkz. PatientFormModal Vazgeç butonu). */
export const DIRTY_CONFIRM_MESSAGE = "Kaydedilmemiş değişiklikleriniz var. Çıkarsanız yaptığınız değişiklikler kaybolacak.";
export const DIRTY_CONFIRM_CANCEL_TEXT = "Düzenlemeye Devam Et";
export const DIRTY_CONFIRM_CONFIRM_TEXT = "Değişiklikleri Sil ve Çık";

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
   * - backdrop tıklaması modalı KAPATMAZ, yalnızca hafif bir "dikkat" vurgusu gösterir.
   * - ESC / X butonu, ConfirmProvider üzerinden onay ister ("Değişiklikleri Sil ve
   *   Çık" onaylanırsa gerçekten kapatılır).
   * Verilmezse (varsayılan false) davranış tamamen eskisiyle aynıdır — mevcut
   * çağıran kodlar hiçbir değişiklik yapmadan çalışmaya devam eder.
   */
  isDirty?: boolean;
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
  module,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [attention, setAttention] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const confirmingRef = useRef(false);

  const triggerAttention = () => {
    setAttention(true);
    window.setTimeout(() => setAttention(false), 220);
  };

  // Kaydedilmemiş değişiklik varken ESC/X: doğrudan kapatma yerine onay iste.
  // Onaylanmazsa (ya da zaten bir onay diyaloğu açıksa) modal açık kalır ve
  // odak/form verisi korunur. Ref üzerinden çağrılır (aşağıdaki ESC
  // listener'ı yalnızca `open` değiştiğinde yeniden bağlanır) ki her render'da
  // yeni bir onClose referansı gelse bile ESC her zaman GÜNCEL onClose'u kullansın.
  const requestCloseRef = useRef<() => void | Promise<void>>(() => {});
  requestCloseRef.current = async () => {
    if (!isDirtyRef.current) {
      onClose();
      return;
    }
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    try {
      const confirmed = await confirmDialog({
        message: DIRTY_CONFIRM_MESSAGE,
        danger: true,
        cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
        confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
      });
      if (confirmed) onClose();
    } finally {
      confirmingRef.current = false;
    }
  };
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
            // KAPATMAZ — sessizce yok saymak yerine kısa bir "dikkat"
            // vurgusuyla kullanıcıya formda olduğunu hatırlatır. Onay
            // diyaloğu burada AÇILMAZ (yalnızca ESC/X için) — aksi halde
            // yanlışlıkla dışarı her tıklandığında bir onay penceresi
            // açılması da kendi başına rahatsız edici olurdu.
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
        className={`ui-modal-panel flex max-h-[calc(100dvh-20px)] w-full flex-col rounded-t-xl border border-slate-200 bg-[rgb(var(--app-surface))] shadow-[var(--shadow-floating)] outline-none sm:max-h-[calc(100dvh-32px)] sm:rounded-xl ${SIZE_CLASS[size]} ${attention ? "ui-modal-panel-attention" : ""}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-transparent px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {module && <ModuleIcon module={module} size="md" className="mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-[17px] font-bold text-slate-900">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
              {attention && (
                <p role="status" className="mt-1 text-xs font-semibold text-amber-600">Kaydedilmemiş değişiklikleriniz var.</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5">
          {children}
          {footer && (
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 sm:hidden">
              {footer}
            </div>
          )}
        </div>
        {footer && (
          <div className="hidden shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/75 px-4 py-3 sm:flex sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
