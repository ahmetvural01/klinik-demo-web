"use client";

import { useCallback, useMemo } from "react";
import { PaymentForm, type PaymentContext } from "@/components/finance/PaymentForm";
import { planInfoFromPlans, type PlanRow } from "@/components/finance/payment-context";
import { toMoneyValue } from "@/lib/money-input";
import type { StaffLike } from "@/lib/staff-roles";
import { turkeyDateKey } from "@/lib/tz";
import { usePatientFile } from "./PatientFileContext";
import { getItemDueDate, getItemRemaining, type Pay, type PatientBalance, type PatientDetailData } from "./patient-file-shared";

/**
 * Hasta dosyasının elindeki veriden tahsilat bağlamı (ek istek yok): borç,
 * açık taksit planı (planın doktoru dahil), son tedavi ve son tahsilat doktoru.
 * Borç yalnız doğru hesaplanabildiyse (balanceKnown) kullanılır: tedavileri
 * göremeyen rolde (ör. banko) hasta dosyası bakiyeyi sunucudan alır; o istek
 * başarısızsa borç bilinmez — "Açık borç yok" ya da yanlış avans uyarısı çıkmaz.
 * Tedavi eden doktorlar: verilirse dosya bağlamının kimlik listesi
 * (`treatingDoctorIds` — sunucu bakiyesi + iptal edilmemiş tedaviler; bankoda
 * da çalışır). Verilmezse eski yol: tedavilerden, tedavileri göremeyen rolde
 * sunucunun bildirdiği adlardan (treatingDoctorNames) doktor listesine eşleme.
 */
export function patientFilePaymentContext(
  data: PatientDetailData,
  balance: PatientBalance,
  balanceKnown: boolean,
  recentDoctorId: string,
  treatingDoctorNames: readonly string[] = [],
  doctors: readonly StaffLike[] = [],
  treatingDoctorIds?: readonly string[],
): PaymentContext {
  const debtKnown = balanceKnown;
  const plans: PlanRow[] = data.taksitPlanlari.map((plan) => {
    // API planın doktorunu kimliğiyle döndürür (api/patients/[id]); tipte yalnız ad var.
    const doctor: { id?: string; fullName: string } | null | undefined = plan.doctor;
    return {
      id: plan.id,
      status: plan.status,
      createdAt: plan.createdAt,
      doctor: doctor?.id ? { id: doctor.id, fullName: doctor.fullName } : null,
      taksitler: (plan.taksitler || []).map((item) => ({ id: item.id, vadeDate: getItemDueDate(item), kalan: getItemRemaining(item), status: item.status })),
    };
  });
  const { plan } = planInfoFromPlans(plans, turkeyDateKey());
  const lastPayment = [...data.payments]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .find((payment) => payment.doctorId);
  // Eski yol iptal edilen ve planlanan kayıtların hekimini de sayıyordu.
  const legacyTreatingIds = () => {
    const ids = Array.from(new Set(data.examinations.map((exam) => exam.doctorId).filter((id): id is string => Boolean(id))));
    return ids.length > 0 ? ids : doctors.filter((doctor) => treatingDoctorNames.includes(doctor.fullName)).map((doctor) => doctor.id);
  };
  return {
    debt: debtKnown ? toMoneyValue(balance.totalDebt) : null,
    plan,
    lastTreatmentDoctorId: recentDoctorId || null,
    lastPaymentDoctorId: lastPayment?.doctorId || null,
    treatingDoctorIds: treatingDoctorIds ?? legacyTreatingIds(),
  };
}

/**
 * Hastadan tahsilat alma / tahsilatı düzeltme — Muhasebe'deki "Tahsilat al"
 * ile AYNI form (components/finance/PaymentForm). Hasta dosyasının her
 * yerinden (üstteki "İşlem ekle", Özet'teki "Tahsilat bekliyor", Tahsilat
 * sekmesi) bu pencere açılır. Doktor önerisi açık taksit planının doktorundan
 * gelir: tahsilat taksitlere yalnız planın doktoru adına alınırsa işlenir.
 */
export function PaymentModal({ open, payment, onClose }: { open: boolean; payment: Pay | null; onClose: () => void }) {
  const { patientId, data, reload, doctors, doctorsLoaded, recentDoctorId, treatingDoctorNames, treatingDoctorIds, balance, balanceKnown, can } = usePatientFile();
  const context = useMemo(
    () => patientFilePaymentContext(data, balance, balanceKnown, recentDoctorId, treatingDoctorNames, doctors, treatingDoctorIds),
    [data, balance, balanceKnown, recentDoctorId, treatingDoctorNames, doctors, treatingDoctorIds],
  );
  const patient = useMemo(() => ({ id: patientId, fullName: data.fullName }), [patientId, data.fullName]);
  const handleSaved = useCallback(() => { void reload(true); }, [reload]);
  const canManagePos = can("settings:write");

  if (payment) {
    return (
      <PaymentForm
        mode="edit"
        open={open}
        onClose={onClose}
        onSaved={handleSaved}
        payment={payment}
        patientName={data.fullName}
        context={context}
        doctors={doctors}
        doctorsLoaded={doctorsLoaded}
        canManagePos={canManagePos}
        canAdjust={can("payments:refund")}
      />
    );
  }
  return (
    <PaymentForm
      mode="new"
      open={open}
      onClose={onClose}
      onSaved={handleSaved}
      patient={patient}
      patientLocked
      context={context}
      doctors={doctors}
      doctorsLoaded={doctorsLoaded}
      canManagePos={canManagePos}
    />
  );
}
