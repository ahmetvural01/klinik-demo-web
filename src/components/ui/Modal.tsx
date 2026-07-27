"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/55 px-2 pb-2 pt-3 backdrop-blur-[8px] sm:items-center sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      {...(closeOnBackdrop ? backdropClose(onClose) : {})}
    >
      <div className={`flex max-h-[calc(100dvh-20px)] w-full flex-col rounded-t-[1.25rem] border border-white/70 bg-[rgb(var(--app-surface))] shadow-[0_30px_80px_rgba(15,23,42,0.22)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[1.25rem] ${SIZE_CLASS[size]}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100/80 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="modal-title" className="font-display text-base font-extrabold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100/80 bg-slate-50/70 px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
