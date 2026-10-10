"use client";

import { usePermissions } from "@/components/auth/PermissionProvider";
import { PaymentForm, type InstallmentPaymentTarget } from "@/components/finance/PaymentForm";
import type { Installment } from "@/components/muhasebe/installment-types";

type Props = {
  /** `planCreatedAt`: tahsilat tarihi planın oluşturulduğu günden önce seçilemez. */
  target: { planId: string; patientName: string; installment: Installment; planCreatedAt?: string } | null;
  onClose: () => void;
  onPaid: () => void;
};

// Pencere kapalıyken de bileşen yerinde durur (açılınca ilk odak tutar alanına
// gelsin diye); kapalıyken kullanılan boş hedef.
const CLOSED_TARGET: InstallmentPaymentTarget = {
  planId: "",
  patientName: "",
  installment: { id: "", siraNo: 0, vadeDate: "", tutar: 0, kalan: 0 },
};

/**
 * Tek taksidin tahsilatı — ortak tahsilat formunun "taksit" kipi (aynı
 * tutar alanı, yöntem düğmeleri, tek POS'un otomatik seçimi). Tutar taksidin
 * kalanıyla dolu gelir ve onu aşamaz; doktor planın doktorudur (sunucu
 * belirler). Tarih bugündür; geç girilen tahsilat için geçmiş gün seçilebilir
 * (plan öncesi ve ileri gün olmaz). Kayıt Gelir ve gider listesine tahsilat
 * olarak düşer.
 * Not: `target` her açılışta form sıfırlanır; çağıran taraf nesneyi useMemo ile sabit tutmalı.
 */
export function InstallmentPayModal({ target, onClose, onPaid }: Props) {
  const { can } = usePermissions();
  return (
    <PaymentForm
      mode="installment"
      open={Boolean(target)}
      onClose={onClose}
      onSaved={onPaid}
      target={target || CLOSED_TARGET}
      canManagePos={can("settings:write")}
    />
  );
}
