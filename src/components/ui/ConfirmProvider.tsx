"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ConfirmOptions } from "@/lib/confirm-client";

type PendingConfirm = ConfirmOptions & { id: string };

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<PendingConfirm>).detail;
      if (!detail?.id || !detail.message) return;
      setPending(detail);
    };
    window.addEventListener("klinik-show-confirm", onShow as EventListener);
    return () => window.removeEventListener("klinik-show-confirm", onShow as EventListener);
  }, []);

  const respond = useCallback((confirmed: boolean) => {
    setPending((current) => {
      if (current) {
        window.dispatchEvent(new CustomEvent("klinik-confirm-result", { detail: { id: current.id, confirmed } }));
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") respond(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, respond]);

  // Modal.tsx'teki focus trap + odak geri yükleme disiplini bu bileşende
  // yoktu — klavye kullanan biri onay diyaloğunda Tab'a basmaya devam
  // ederse odak arka plandaki sayfaya kaçabiliyordu, diyalog kapanınca da
  // odak işlemi başlatan butona geri dönmüyordu (bkz. denetim raporu).
  useEffect(() => {
    if (!pending) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (focusable.length === 0) return;
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
      document.removeEventListener("keydown", trapFocus);
      previousActiveElement?.focus();
    };
  }, [pending]);

  const dialog = pending && (
    <div
      className="ui-confirm-backdrop fixed inset-0 z-[350] flex items-center justify-center bg-slate-950/50 px-3 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-message"
      onClick={() => respond(false)}
    >
      <div
        ref={dialogRef}
        className="ui-confirm-panel w-full max-w-sm animate-fade-in rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {pending.title && (
          <h2 className="mb-1.5 text-sm font-black text-slate-900">{pending.title}</h2>
        )}
        <p id="confirm-dialog-message" className="whitespace-pre-line text-sm text-slate-600">
          {pending.message}
        </p>
        <div className="ui-confirm-actions mt-5 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => respond(false)}
            className="ui-confirm-cancel rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {pending.cancelText || "Vazgeç"}
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            className={`ui-confirm-submit rounded-lg px-4 py-2 text-sm font-bold text-white ${
              pending.danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {pending.confirmText || "Onayla"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {children}
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
};

export default ConfirmProvider;
