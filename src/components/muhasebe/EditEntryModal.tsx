"use client";

import { useCallback } from "react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { useFinanceDoctors } from "@/components/muhasebe/useFinanceDoctors";
import { PaymentForm } from "@/components/finance/PaymentForm";
import { ExpenseForm } from "@/components/finance/ExpenseForm";

export type LedgerPayment = {
  id: string; createdAt: string; amount: number | string; method: string;
  description?: string | null; posId?: string | null;
  /** Kartlı tahsilatın POS cihazı (api/muhasebe/defter). */
  posName?: string | null;
  patient?: { id: string; fullName: string } | null;
  doctorId?: string | null;
  doctor?: { id: string; fullName: string } | null;
};
export type LedgerExpense = {
  id: string; tarih: string; category: string; categoryId?: string | null; description?: string | null;
  tutar: number | string; yontem?: string | null;
  doctorId?: string | null; doctor?: { id: string; fullName: string } | null;
  periodYear?: number | null; periodMonth?: number | null;
  sourceType?: string | null;
  /** Firma ödemesinde kaynak tedarikçi işlemi (FirmaIslem). */
  sourceId?: string | null;
};

export type EditTarget = { kind: "TAHSILAT"; payment: LedgerPayment } | { kind: "GIDER"; expense: LedgerExpense };

// Pencereler kapalıyken de yerinde durur (açılınca ilk odak doğru alana gelsin
// diye); kapalıyken kullanılan boş kayıtlar.
const CLOSED_PAYMENT: LedgerPayment = { id: "", createdAt: "", amount: 0, method: "NAKIT" };
const CLOSED_EXPENSE: LedgerExpense = { id: "", tarih: "", category: "", tutar: 0 };

type Props = {
  target: EditTarget | null;
  onClose: () => void;
  onSaved: (kind: "TAHSILAT" | "GIDER") => void;
};

/**
 * Tahsilat / gider düzeltme. Ekleme formlarının aynısı "düzeltme" kipinde
 * açılır (aynı alanlar, aynı sıra): tahsilat → ortak tahsilat formu, gider
 * ve hakediş ödemesi → "Gider / ödeme" formu. Yalnız DEĞİŞEN alanlar
 * gönderilir: önceden her kayıtta tutar+tarih+doktor da gönderildiği için
 * hakedişi ödenmiş bir aydaki tahsilatın yalnız açıklaması bile düzeltilemiyordu
 * (sunucu dönem kilidi bu alanlara bakar). Hakediş ödemesinde ay ve doktor
 * sonradan değişmez (form bu alanları göstermez).
 */
export function EditEntryModal({ target, onClose, onSaved }: Props) {
  const { can } = usePermissions();
  const { doctors, loaded, error: doctorsError } = useFinanceDoctors(target?.kind === "TAHSILAT");
  const payment = target?.kind === "TAHSILAT" ? target.payment : null;
  const expense = target?.kind === "GIDER" ? target.expense : null;
  const handlePaymentSaved = useCallback(() => onSaved("TAHSILAT"), [onSaved]);
  const handleExpenseSaved = useCallback(() => onSaved("GIDER"), [onSaved]);

  return (
    <>
      <PaymentForm
        mode="edit"
        open={Boolean(payment)}
        onClose={onClose}
        onSaved={handlePaymentSaved}
        payment={payment || CLOSED_PAYMENT}
        patientName={payment?.patient?.fullName || "Hasta"}
        doctors={doctors}
        doctorsLoaded={loaded}
        doctorsError={doctorsError}
        canManagePos={can("settings:write")}
        // Tutar, tarih ve doktor yalnız iade izniyle (tutarı düşürmek iade sayılır).
        canAdjust={can("payments:refund")}
      />
      <ExpenseForm mode="edit" open={Boolean(expense)} onClose={onClose} onSaved={handleExpenseSaved} expense={expense || CLOSED_EXPENSE} />
    </>
  );
}
