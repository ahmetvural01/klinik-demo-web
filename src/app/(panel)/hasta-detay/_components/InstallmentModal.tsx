"use client";

import { useCallback, useMemo } from "react";
import { InstallmentPlanForm, type PlanPatientBalance } from "@/components/finance/InstallmentPlanForm";
import { sumMoney } from "@/components/finance/finance-money";
import { usePatientFile } from "./PatientFileContext";
import { patientFilePaymentContext } from "./PaymentModal";
import { getPlanRemaining } from "./patient-file-shared";

/**
 * Hasta dosyası > Taksit planı yap — Muhasebe'deki "Yeni taksit planı" ile
 * AYNI form (components/finance/InstallmentPlanForm). Tutar, taksitte olmayan
 * borçla dolu gelir ve kalan borcu aşamaz; taksit sayısı sunucuyla aynı
 * sınırda (1–100); peşinat istenirse plan ile aynı işlemde tahsil edilir.
 */
export function InstallmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { patientId, data, reload, doctors, doctorsLoaded, recentDoctorId, treatingDoctorNames, treatingDoctorIds, balance, balanceKnown, can } = usePatientFile();
  const context = useMemo(
    () => patientFilePaymentContext(data, balance, balanceKnown, recentDoctorId, treatingDoctorNames, doctors, treatingDoctorIds),
    [data, balance, balanceKnown, recentDoctorId, treatingDoctorNames, doctors, treatingDoctorIds],
  );
  const planBalance = useMemo<PlanPatientBalance>(() => ({
    debt: context.debt,
    // Açık planların kalanı zaten borcun parçası (Tahsilat sekmesindeki "Taksit planı yap" kuralıyla aynı).
    planRemaining: sumMoney(data.taksitPlanlari.filter((plan) => plan.status !== "IPTAL").map((plan) => getPlanRemaining(plan))),
    context,
  }), [context, data.taksitPlanlari]);
  const patient = useMemo(() => ({ id: patientId, fullName: data.fullName }), [patientId, data.fullName]);
  const handleCreated = useCallback(() => { void reload(true); }, [reload]);

  return (
    <InstallmentPlanForm
      open={open}
      onClose={onClose}
      onCreated={handleCreated}
      patient={patient}
      patientLocked
      balance={planBalance}
      doctors={doctors}
      doctorsLoaded={doctorsLoaded}
      canCollect={can("payments:write")}
      canManagePos={can("settings:write")}
      canCancelPlans={can("installments:delete")}
    />
  );
}
