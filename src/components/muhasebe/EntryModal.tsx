"use client";

import { useCallback, useMemo } from "react";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { useFinanceDoctors } from "@/components/muhasebe/useFinanceDoctors";
import { PaymentForm } from "@/components/finance/PaymentForm";
import { ExpenseForm, type OutgoingKind } from "@/components/finance/ExpenseForm";
import { loadAppointmentDoctorId, loadPatientDebtSummary } from "@/components/finance/payment-context";
import { turkeyDateKey } from "@/lib/tz";

export type EntryKind = "gelir" | "gider" | "firma" | "hakedis";

/** Formu belirli bir bağlamla açmak için (ör. Alacaklar'dan hasta seçili, Hakediş'ten dönem seçili). */
export type EntryRequest = {
  kind: EntryKind;
  patient?: PickedPatient | null;
  doctorId?: string;
  payout?: { doctorId: string; year: number; month: number; kalan: number };
};

type Props = {
  request: EntryRequest | null;
  onClose: () => void;
  onSaved: (kind: EntryKind) => void;
  canWritePayments: boolean;
  canWriteFinance: boolean;
  canReadFinance: boolean;
};

/**
 * Muhasebe'nin kayıt penceresi. Para GİRİŞİ (tahsilat) ile ÇIKIŞI (gider,
 * firma ödemesi, hakediş ödemesi) artık iki ayrı pencere: önceden dört tür tek
 * pencerede sekmeyle seçiliyordu ve banko rolü üç pasif sekme görüyordu.
 * - "gelir" → ortak tahsilat formu (hasta dosyasıyla aynı form).
 * - "gider" | "firma" | "hakedis" → "Gider / ödeme" formu; izinli türler
 *   üstte seçilir (tek tür ya da hakediş/firma bağlamıyla açılınca seçici yok).
 * Dışa açık ad ve prop'lar aynı kaldı (Muhasebe sayfası, üst bar ve derin
 * bağlantılar değişmeden çalışır).
 */
export function EntryModal({ request, onClose, onSaved, canWritePayments, canWriteFinance, canReadFinance }: Props) {
  const { can } = usePermissions();
  const canReadInstallments = can("installments:read");
  const canReadPayments = can("payments:read");
  const canManagePos = can("settings:write");
  const canReadPatients = can("patients:read");
  const canUseAppointmentContext = can("appointments:write");

  const outgoingKinds = useMemo<OutgoingKind[]>(() => {
    if (!canWriteFinance) return [];
    return canReadFinance ? ["gider", "firma", "hakedis"] : ["gider", "hakedis"];
  }, [canWriteFinance, canReadFinance]);

  // İzinsiz tür istenirse izinli olana düşer (ör. ?islem=gider ile gelen banko → tahsilat).
  const kind: EntryKind | null = (() => {
    if (!request) return null;
    if (request.kind === "gelir") return canWritePayments ? "gelir" : outgoingKinds[0] || null;
    if ((outgoingKinds as string[]).includes(request.kind)) return request.kind;
    return outgoingKinds[0] || (canWritePayments ? "gelir" : null);
  })();

  const { doctors, loaded, error: doctorsError } = useFinanceDoctors(kind === "gelir");

  const loadContext = useCallback(async (patientId: string) => {
    const summary = await loadPatientDebtSummary(patientId, { canReadFinance, canReadInstallments, canReadPayments }, turkeyDateKey());
    const context = summary?.context ?? null;
    // Ücrete yansıyan tedavi ya da açık plan yoksa hekim önerisi randevudan
    // (banko; yalnız gerektiğinde ek istek).
    if (!canUseAppointmentContext || context?.plan?.doctorId || context?.lastTreatmentDoctorId) return context;
    const appointmentDoctorId = await loadAppointmentDoctorId(patientId);
    return appointmentDoctorId ? { ...(context ?? { debt: null, plan: null }), appointmentDoctorId } : context;
  }, [canReadFinance, canReadInstallments, canReadPayments, canUseAppointmentContext]);

  const patient = request?.patient || null;
  // Satırdan (ör. Alacaklar) gelen hasta, hasta listesini göremeyen rolde
  // değiştirilemez: başlıkta adı yazar, seçici çıkmaz.
  const patientLocked = Boolean(patient) && !canReadPatients;
  const handlePaymentSaved = useCallback(() => onSaved("gelir"), [onSaved]);

  return (
    <>
      <PaymentForm
        mode="new"
        open={kind === "gelir"}
        onClose={onClose}
        onSaved={handlePaymentSaved}
        patient={patient}
        patientLocked={patientLocked}
        suggestedDoctorId={request?.doctorId}
        loadContext={loadContext}
        doctors={doctors}
        doctorsLoaded={loaded}
        doctorsError={doctorsError}
        canManagePos={canManagePos}
      />
      <ExpenseForm
        mode="new"
        open={kind !== null && kind !== "gelir"}
        kind={kind && kind !== "gelir" ? kind : "gider"}
        kinds={outgoingKinds}
        payout={request?.kind === "hakedis" ? request.payout || null : null}
        reference="Muhasebeden firma ödemesi"
        onClose={onClose}
        onSaved={(saved) => onSaved(saved)}
      />
    </>
  );
}
