"use client";

import { useCallback } from "react";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { useFinanceDoctors } from "@/components/muhasebe/useFinanceDoctors";
import { InstallmentPlanForm } from "@/components/finance/InstallmentPlanForm";
import { loadPatientDebtSummary } from "@/components/finance/payment-context";
import { turkeyDateKey } from "@/lib/tz";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (patientName: string) => void;
  initialPatient?: PickedPatient | null;
  canWritePayments: boolean;
  canReadFinance: boolean;
};

/**
 * Muhasebe > Yeni taksit planı — hasta dosyasındaki "Taksit planı yap" ile
 * AYNI form (ortak InstallmentPlanForm). Hastanın borcu biliniyorsa
 * (finance:read) tutar taksitte olmayan borçla dolar ve borcu aşamaz; hasta
 * bağlamıyla açılırsa (initialPatient) hasta sabittir.
 */
export function NewPlanModal({ open, onClose, onCreated, initialPatient, canWritePayments, canReadFinance }: Props) {
  const { can } = usePermissions();
  const canReadInstallments = can("installments:read");
  const canReadPayments = can("payments:read");
  const { doctors, loaded, error: doctorsError } = useFinanceDoctors(open);

  const loadBalance = useCallback(async (patientId: string) => {
    const summary = await loadPatientDebtSummary(patientId, { canReadFinance, canReadInstallments, canReadPayments }, turkeyDateKey());
    return summary ? { debt: summary.debt, planRemaining: summary.planRemaining, context: summary.context } : null;
  }, [canReadFinance, canReadInstallments, canReadPayments]);

  return (
    <InstallmentPlanForm
      open={open}
      onClose={onClose}
      onCreated={({ patientName }) => onCreated(patientName)}
      patient={initialPatient || null}
      patientLocked={Boolean(initialPatient)}
      loadBalance={loadBalance}
      doctors={doctors}
      doctorsLoaded={loaded}
      doctorsError={doctorsError}
      canCollect={canWritePayments}
      canManagePos={can("settings:write")}
      canCancelPlans={can("installments:delete")}
    />
  );
}
