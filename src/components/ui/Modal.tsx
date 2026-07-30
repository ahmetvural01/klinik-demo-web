"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { useEscapeClose, backdropClose } from "@/lib/use-modal-dismiss";

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
}: ModalProps) {
  useEscapeClose(onClose, open);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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
      className="ui-modal-backdrop fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/45 px-2 pb-2 pt-3 backdrop-blur-[3px] sm:items-center sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(closeOnBackdrop ? backdropClose(onClose) : {})}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`ui-modal-panel flex max-h-[calc(100dvh-20px)] w-full flex-col rounded-t-xl border border-slate-200 bg-[rgb(var(--app-surface))] shadow-[var(--shadow-floating)] outline-none sm:max-h-[calc(100dvh-32px)] sm:rounded-lg ${SIZE_CLASS[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-bold text-slate-900">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
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
          <div className="hidden shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
