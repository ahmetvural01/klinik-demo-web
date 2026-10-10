"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerConfirmProvider, type ConfirmOptions } from "@/lib/confirm-client";

type PendingConfirm = ConfirmOptions & { id: string };

// Yazılması istenen metin büyük/küçük harf ve kenar boşluğu gözetmeden karşılaştırılır.
// Noktalı/noktasız i aynı sayılır: "SİL" istenirken yazılan "SIL" ya da "sil" kabul edilir.
function normalizeTyped(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [typed, setTyped] = useState("");
  const [mounted, setMounted] = useState(false);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  const inputId = useId();

  useEffect(() => {
    setMounted(true);
    // confirmDialog sağlayıcı olmayan sayfada tarayıcı onayına düşer; burada kayıt olunur.
    const unregister = registerConfirmProvider();
    return () => {
      unregister();
      setMounted(false);
    };
  }, []);

  const finish = useCallback((id: string, confirmed: boolean) => {
    window.dispatchEvent(new CustomEvent("klinik-confirm-result", { detail: { id, confirmed } }));
  }, []);

  useEffect(() => {
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<PendingConfirm>).detail;
      if (!detail?.id || !detail.message) return;
      // Açık onay varken yenisi gelirse eskisi "hayır" sayılır: yanıtı hiç
      // gelmeyen söz, onu bekleyen işlemi (ör. pencere kapatma) kilitliyordu.
      const previous = pendingRef.current;
      if (previous) finish(previous.id, false);
      pendingRef.current = detail;
      setTyped("");
      setPending(detail);
    };
    window.addEventListener("klinik-show-confirm", onShow as EventListener);
    return () => window.removeEventListener("klinik-show-confirm", onShow as EventListener);
  }, [finish]);

  const respond = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    setTyped("");
    finish(current.id, confirmed);
  }, [finish]);

  const textOk = !pending?.requireText || normalizeTyped(typed) === normalizeTyped(pending.requireText);

  useEffect(() => {
    if (!pending) return;
    // Esc yalnız onayı kapatır. Yakalama evresinde, window'da ve ilk sırada
    // çalışır; olay hiçbir alt katmana (Modal, Drawer, menü, açık liste)
    // ulaşmaz. Önceden aynı Esc onayla birlikte alttaki form penceresini de
    // kapatıyor, yazılanlar kayboluyordu.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      respond(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
      const active = document.activeElement;
      if (!(active instanceof Node && dialog.contains(active))) {
        // Odak onay penceresinin dışına düştüyse geri getir.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, [pending]);

  // Başlık (soru) pencerenin adı, açıklama (sonuç) tanımıdır; başlık yoksa
  // ad mesajın kendisidir. Kimlikler benzersiz (sabit id iki sağlayıcıda çakışırdı).
  const dialog = pending && (
    <div
      className="ui-confirm-backdrop fixed inset-0 z-[var(--z-confirm)] flex items-center justify-center bg-slate-950/50 px-3 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={pending.title ? titleId : messageId}
      aria-describedby={pending.title ? messageId : undefined}
      onClick={() => respond(false)}
    >
      <div
        ref={dialogRef}
        className="ui-confirm-panel w-full max-w-sm animate-fade-in rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {pending.title && (
          <h2 id={titleId} className="mb-1.5 text-sm font-black text-slate-900">{pending.title}</h2>
        )}
        <p id={messageId} className="whitespace-pre-line text-sm text-slate-600">
          {pending.message}
        </p>
        {pending.requireText && (
          <div className="mt-4">
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-slate-800">
              {pending.requireTextLabel || `Onaylamak için "${pending.requireText}" yazın`}
            </label>
            <input
              id={inputId}
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (textOk) respond(true);
              }}
              autoComplete="off"
              spellCheck={false}
              className="ui-control w-full"
            />
          </div>
        )}
        <div className="ui-confirm-actions mt-5 flex justify-end gap-2">
          <button
            type="button"
            autoFocus={!pending.requireText}
            onClick={() => respond(false)}
            className="ui-confirm-cancel rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {pending.cancelText || "Vazgeç"}
          </button>
          <button
            type="button"
            disabled={!textOk}
            onClick={() => respond(true)}
            className={`ui-confirm-submit rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
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
