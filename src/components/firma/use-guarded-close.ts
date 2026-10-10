"use client";

import { useCallback, useRef } from "react";
import { confirmDialog } from "@/lib/confirm-client";

/**
 * Uzun formlarda (satın alma, teslim alma) Esc / ✕ / Vazgeç girilen bilgiyi
 * sormadan siliyordu (ortak pencere Esc'te her zaman kapanır). Form
 * kirliyse kapatmadan önce onay istenir. Onay penceresi açıkken gelen ikinci
 * kapatma isteği (ör. Esc) yok sayılır.
 */
export function useGuardedClose(dirty: boolean, onClose: () => void) {
  const pendingRef = useRef(false);
  return useCallback(async () => {
    if (pendingRef.current) return;
    if (!dirty) {
      onClose();
      return;
    }
    pendingRef.current = true;
    try {
      const confirmed = await confirmDialog({
        title: "Girdiğiniz bilgiler silinsin mi?",
        message: "Bu form kaydedilmedi. Kapatırsanız yazdıklarınız kaybolur.",
        confirmText: "Kapat",
        cancelText: "Forma dön",
        danger: true,
      });
      if (confirmed) onClose();
    } finally {
      pendingRef.current = false;
    }
  }, [dirty, onClose]);
}
