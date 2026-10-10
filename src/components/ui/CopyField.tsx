"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";

type CopyFieldProps = {
  /** Kopyalanacak metin (bağlantı, kod). */
  value: string;
  /** Alanın adı ("Online randevu bağlantısı"). Ekran okuyucu her zaman duyar. */
  label: string;
  /**
   * Ad görsel olarak gizlenir — bölüm başlığı zaten aynı şeyi söylüyorsa
   * (aynı bilgi iki kez yazılmasın). `label` yine zorunludur.
   */
  labelHidden?: boolean;
  /** Alanın altında kısa açıklama ("Hastalarınız bu bağlantıdan randevu talebi gönderir."). */
  hint?: ReactNode;
  /**
   * Yanında "Aç" bağlantısı (yeni sekmede). `true` değerin kendisini açar;
   * metin verilirse o adres açılır. Bağlantı olmayan değerlerde (kod) vermeyin.
   */
  openHref?: string | boolean;
  /** Başarılı kopyalamadan sonra (ör. analitik); geri bildirim zaten alanda gösterilir. */
  onCopy?: () => void;
  className?: string;
};

/**
 * Salt okunur metin + "Kopyala" (+ isteğe bağlı "Aç") — TEK görünüm. Online
 * randevu bağlantısı, klinik kodu gibi paylaşılacak değerler için. Kopyalama
 * sonucu düğmenin üzerinde görünür ("Kopyalandı"), ayrıca bildirim balonu
 * açılmaz. Pano izni yoksa (http üzerinden yerel ağ, eski tarayıcı) metin
 * seçilir ve elle kopyalama söylenir.
 *
 *   <CopyField label="Online randevu bağlantısı" labelHidden value={bookingLink} openHref />
 */
export function CopyField({ value, label, labelHidden = false, hint, openHref, onCopy, className = "" }: CopyFieldProps) {
  const inputId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Değer değişince eski "Kopyalandı/Kopyalanamadı" durumu yeni değere ait sanılmasın.
  useEffect(() => {
    setState("idle");
  }, [value]);

  const selectText = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  };

  const copy = async () => {
    let copied = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      // Güvenli olmayan bağlamda (http://192.168…) pano API'si yoktur; seçili metni eski yolla kopyala.
      const pressed = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      selectText();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      // Klavye kullanıcısının odağı bastığı düğmede kalsın.
      if (copied) pressed?.focus();
    }
    if (copied) {
      setState("copied");
      onCopy?.();
    } else {
      selectText();
      setState("failed");
    }
  };

  const openUrl = typeof openHref === "string" ? openHref : openHref ? value : "";

  return (
    <div className={`ui-copy-field ${className}`}>
      {!labelHidden && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-slate-800">{label}</label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          value={value}
          aria-label={labelHidden ? label : undefined}
          aria-describedby={state === "failed" || hint ? messageId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          className="ui-control min-w-0 !bg-slate-50 text-slate-700 sm:flex-1"
        />
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            icon={state === "copied" ? Check : Copy}
            onClick={() => void copy()}
            className="min-w-[8.25rem] flex-1 sm:flex-none"
          >
            {state === "copied" ? "Kopyalandı" : "Kopyala"}
          </Button>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              Aç
              <span className="sr-only">(yeni sekmede açılır)</span>
            </a>
          )}
        </div>
      </div>
      {state === "failed" ? (
        <p id={messageId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">Kopyalanamadı. Metin seçildi; elle kopyalayın.</p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>
      ) : null}
      {/* Kopyalandı geri bildirimi ekran okuyucuya da ulaşsın (düğme metni değişimi duyurulmaz). */}
      <span className="sr-only" aria-live="polite">{state === "copied" ? "Kopyalandı" : ""}</span>
    </div>
  );
}
