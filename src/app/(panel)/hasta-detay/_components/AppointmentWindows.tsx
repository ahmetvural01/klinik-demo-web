"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { useCalendarSettings } from "@/components/randevu/useCalendarSettings";
import { nextVisitDateKey, parseNoteFull, type Appointment, type AppointmentPermissions } from "@/components/randevu/appointment-utils";
import type { AppointmentFormInitial, AppointmentFormSaved } from "@/components/randevu/AppointmentFormModal";
import { showToastSafe } from "@/lib/toast-client";
import { STATUS_ACTION_ICON } from "@/lib/status-actions";
import { turkeyDateKey } from "@/lib/tz";

const AppointmentDetailModal = dynamic(() => import("@/components/randevu/AppointmentDetailModal").then((module) => module.AppointmentDetailModal), { ssr: false });
const AppointmentFormModal = dynamic(() => import("@/components/randevu/AppointmentFormModal").then((module) => module.AppointmentFormModal), { ssr: false });

type OpenWindow =
  | { kind: "detail" }
  | { kind: "edit"; appointment: Appointment }
  | { kind: "create"; initial: AppointmentFormInitial };

/**
 * Hasta dosyasındaki randevu penceresi: takvimle AYNI pencere
 * (AppointmentDetailModal: Geldi · Tamamla · Gelmedi, not, iptal, sonraki
 * randevu) ve aynı form (AppointmentFormModal: düzenle / taşı, yeni randevu).
 * Önceden dosyada yalnız "Durumu değiştir" ve "Takvimde aç" olan ayrı, kısıtlı
 * bir pencere vardı; aynı işi takvimde başka düğmelerle yapmak gerekiyordu.
 * Takvim ayarları (tedavi türleri, çalışma saatleri) yalnız pencere açılınca okunur.
 */
export function AppointmentWindows({
  appointment,
  onClose,
  onChanged,
  onEnterTreatment,
  onTakePayment,
}: {
  appointment: Appointment;
  onClose: () => void;
  /** Randevu değişti: hasta dosyası sessizce yenilenir. */
  onChanged: () => void;
  /** "Tedavi gir": Tedavi sekmesi, tedavi araması odaklı. */
  onEnterTreatment: () => void;
  /** "Tahsilat al": dosyadaki tahsilat penceresi. */
  onTakePayment: () => void;
}) {
  const { can } = usePermissions();
  const canCreate = can("appointments:write");
  const canDelete = can("appointments:delete");
  const canApprove = can("appointments:approve");
  const canSeePhone = can("patients:phone");
  const permissions = useMemo<AppointmentPermissions>(
    () => ({ canCreate, canDelete, canApprove, canSeePhone, canManageBlocks: false }),
    [canCreate, canDelete, canApprove, canSeePhone],
  );
  const { settings, doctors, treatments, clinicUnits, slotInterval } = useCalendarSettings();
  const [open, setOpen] = useState<OpenWindow>({ kind: "detail" });

  // Takvimdeki "Sonraki randevu" ile aynı öneri: tamamlanan randevudan sonra
  // bir hafta sonrası (+1 hafta / +2 hafta / +1 ay), gelmeyen/iptalde bugünden.
  const nextAppointmentFor = (current: Appointment) => {
    const followUpVisit = current.status === "TAMAMLANDI";
    const todayKey = turkeyDateKey();
    setOpen({
      kind: "create",
      initial: {
        patient: current.patient ? { id: current.patient.id, fullName: current.patient.fullName, phone: current.patient.phone || null, tcNo: current.patient.tcNo || null } : null,
        doctorId: current.doctor?.id,
        treatment: parseNoteFull(current.note, treatments).treatment,
        dateKey: followUpVisit ? nextVisitDateKey(settings?.dailySchedules, todayKey) : todayKey,
        quickDates: followUpVisit ? "sonraki" : "yakin",
      },
    });
  };

  const afterSaved = (result: AppointmentFormSaved, mode: "edit" | "create") => {
    showToastSafe({
      title: mode === "edit" ? "Randevu güncellendi" : "Randevu oluşturuldu",
      message: result.message,
      type: result.tone,
      icon: STATUS_ACTION_ICON[mode === "edit" ? "appointment-rescheduled" : "appointment-created"],
      duration: result.tone !== "success" ? 7000 : 4000,
    });
    onChanged();
    onClose();
  };

  if (open.kind === "detail") {
    return (
      <AppointmentDetailModal
        appointment={appointment}
        treatments={treatments}
        permissions={permissions}
        multiBranch={Boolean(settings?.multiBranch)}
        settings={settings}
        onClose={onClose}
        onChanged={() => onChanged()}
        onEdit={(current) => setOpen({ kind: "edit", appointment: current })}
        onNextAppointment={nextAppointmentFor}
        inPatientFile={{ onEnterTreatment, onTakePayment }}
      />
    );
  }

  return (
    <AppointmentFormModal
      mode={open.kind}
      appointment={open.kind === "edit" ? open.appointment : null}
      initial={open.kind === "create" ? open.initial : undefined}
      settings={settings}
      doctors={doctors}
      treatments={treatments}
      clinicUnits={clinicUnits}
      slotInterval={slotInterval}
      canSeePhone={canSeePhone}
      lockPatient
      onClose={onClose}
      onSaved={(result) => afterSaved(result, open.kind === "edit" ? "edit" : "create")}
    />
  );
}
