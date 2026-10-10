"use client";

import { useCallback } from "react";
import { ExpenseForm } from "@/components/finance/ExpenseForm";
import { VENDOR_PAYMENT_METHODS, paymentMethodLabel as methodLabel, paymentMethodOptions } from "@/lib/payment-methods";

/** Tedarikçi ödeme yöntemleri (tek sözlükten; en sık kullanılan Havale/EFT önde). */
export const PAYMENT_METHODS = paymentMethodOptions(VENDOR_PAYMENT_METHODS);

export function paymentMethodLabel(value?: string | null) {
  return methodLabel(value);
}

export type FirmaPaymentTarget = { id: string; name: string; bakiye: number };

type FirmaPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  firma: FirmaPaymentTarget | null;
  /** Önerilen tutar (ör. bir satın almanın kalanı). Verilmezse tutar boş gelir; "Borcun tamamı" ile doldurulur. */
  suggestedAmount?: number;
  /** Ödemenin karşılığı olan belge (ör. "Fatura DENEME-001"); açıklama boşsa kullanılır. */
  reference?: string;
  /** Ödeme önce bu satın almanın (faturanın) borcuna düşsün; verilmezse en eski açık borçtan düşer. */
  purchaseId?: string;
  onSaved: () => void | Promise<void>;
};

/**
 * Firmaya (tedarikçi/laboratuvar) yapılan ödeme — Muhasebe > Gider / ödeme >
 * Firma ödemesi ile AYNI form (components/finance/ExpenseForm, firma sabit).
 * Kayıt aynı uç noktaya (POST /api/firma/[id]/islemler, ODEME) ve aynı
 * Idempotency-Key korumasıyla gider; tutar firmanın kalan borcunu aşamaz.
 * Ödeme en eski açık borçtan düşülür ve Muhasebe'de "Firma Ödemesi" gideri
 * olarak görünür. Firma listesinden açılınca tutar boş gelir (tüm borcu
 * yanlışlıkla ödenmiş saymayı önler); faturadan açılınca faturanın kalanı önerilir.
 */
export function FirmaPaymentModal({ open, onClose, firma, suggestedAmount, reference, purchaseId, onSaved }: FirmaPaymentModalProps) {
  const handleSaved = useCallback(() => {
    void Promise.resolve(onSaved()).catch(() => undefined);
  }, [onSaved]);
  return (
    <ExpenseForm
      mode="new"
      open={open && Boolean(firma)}
      kind="firma"
      firma={firma}
      suggestedAmount={suggestedAmount}
      reference={reference}
      purchaseId={purchaseId}
      onClose={onClose}
      onSaved={handleSaved}
    />
  );
}
