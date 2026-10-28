"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { AppointmentStatusBadge } from "@/components/randevu/AgendaList";
import type { Appointment } from "@/components/randevu/appointment-utils";
import { usePatientFile } from "./PatientFileContext";
import { appointmentTypeLabel, sharedName, type Appt, type PatientDetailData } from "./patient-file-shared";

// Randevu penceresi (takvimle aynı pencere ve form) yalnız satıra tıklanınca yüklenir.
const AppointmentWindows = dynamic(() => import("./AppointmentWindows").then((module) => module.AppointmentWindows), { ssr: false });

const PAST_PREVIEW = 10;

const timeRange = (appointment: Appt) => `${formatDateText(appointment.startAt, "time")}–${formatDateText(appointment.endAt, "time")}`;

/**
 * Dosyadaki randevu kaydı → takvimin randevu kaydı. Hasta bilgisi dosyanın
 * kendisinden gelir (ek istek ve ek KVKK erişim kaydı yok); telefonu ve TC'yi
 * göremeyen rolde bu alanlar boş kalır.
 */
function toCalendarAppointment(appointment: Appt, patient: PatientDetailData, hidePhone: boolean): Appointment {
  return {
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    type: appointment.type,
    status: appointment.status,
    note: appointment.note ?? null,
    smsInfo: appointment.smsInfo,
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      phone: hidePhone || patient.phone === "***" ? null : patient.phone,
      tcNo: patient.tcNo && patient.tcNo !== "***" ? patient.tcNo : null,
      hasContagiousDisease: patient.hasContagiousDisease,
      contagiousDiseaseNote: patient.contagiousDiseaseNote ?? null,
    },
    doctor: appointment.doctor?.id ? { id: appointment.doctor.id, fullName: appointment.doctor.fullName } : null,
    clinicUnit: appointment.clinicUnit?.id ? { id: appointment.clinicUnit.id, name: appointment.clinicUnit.name, code: appointment.clinicUnit.code ?? null } : null,
  };
}

/**
 * Hastanın randevuları. Satıra tıklayınca takvimdekiyle aynı randevu penceresi
 * açılır (durum, not, düzenle / taşı, iptal, sonraki randevu); durum rozeti de
 * takvim listesindekiyle aynıdır. Yeni randevu Randevular sayfasında bu hasta
 * seçili açılır (takvimde boş saat görülerek verilir).
 */
export function AppointmentsTab() {
  const { data, reload, can, appointmentHref, hidePatientPhone, startIntent, openPayment } = usePatientFile();
  // Pencere açılırken kayıt bir kez kurulur: dosya arkada yenilense de açık
  // pencere baştan kurulmaz (değişikliği pencere kendisi gösterir).
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);
  const canWrite = can("appointments:write");

  const { upcoming, past, noShowCount } = useMemo(() => {
    const now = Date.now();
    const sorted = [...data.appointments].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const pastList = sorted.filter((appointment) => new Date(appointment.endAt || appointment.startAt).getTime() < now).reverse();
    return {
      upcoming: sorted.filter((appointment) => new Date(appointment.endAt || appointment.startAt).getTime() >= now),
      past: pastList,
      noShowCount: pastList.filter((appointment) => appointment.status === "GELMEDI").length,
    };
  }, [data.appointments]);

  const statusBadge = (appointment: Appt) => (
    <AppointmentStatusBadge appointment={{ id: appointment.id, startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status }} />
  );

  // Bütün satırlar aynı hekimdeyse ad başlık altında bir kez (sütun kalkar).
  const columns = (sameDoctor: string | null): ListTableColumn<Appt>[] => [
    {
      key: "date",
      header: "Tarih",
      render: (appointment) => (
        <span className="whitespace-nowrap">
          <span className="font-semibold tabular-nums text-slate-800">{formatDateText(appointment.startAt)}</span>
          <span className="ml-2 tabular-nums text-slate-500">{timeRange(appointment)}</span>
        </span>
      ),
    },
    ...(sameDoctor ? [] : [{ key: "doctor", header: "Hekim", render: (appointment: Appt) => appointment.doctor?.fullName || null }]),
    { key: "type", header: "Tür", render: (appointment) => appointmentTypeLabel(appointment.type) },
    { key: "status", header: "Durum", render: statusBadge },
  ];

  const renderMobileCard = (appointment: Appt, sameDoctor: string | null) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800"><span className="tabular-nums">{formatDateText(appointment.startAt)}</span> · <span className="tabular-nums">{timeRange(appointment)}</span></p>
        <p className="mt-0.5 text-xs text-slate-500">{[sameDoctor ? "" : appointment.doctor?.fullName, appointmentTypeLabel(appointment.type)].filter(Boolean).join(" · ")}</p>
      </div>
      {statusBadge(appointment)}
    </div>
  );

  const shownPast = showAllPast ? past : past.slice(0, PAST_PREVIEW);
  const upcomingDoctor = sharedName(upcoming, (appointment) => appointment.doctor?.fullName);
  const pastDoctor = sharedName(shownPast, (appointment) => appointment.doctor?.fullName);
  const open = (appointment: Appt) => setSelected(toCalendarAppointment(appointment, data, hidePatientPhone));

  return (
    <div className="space-y-4">
      <ListTable
        title="Yaklaşan randevular"
        subtitle={upcomingDoctor ? `Hekim: ${upcomingDoctor}` : undefined}
        actions={canWrite ? <Button size="sm" variant="secondary" icon={CalendarPlus} href={appointmentHref}>Yeni randevu</Button> : undefined}
        columns={columns(upcomingDoctor)}
        rows={upcoming}
        rowKey={(appointment) => appointment.id}
        onRowClick={open}
        getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunu aç`}
        mobileCard={(appointment) => renderMobileCard(appointment, upcomingDoctor)}
        emptyIcon={CalendarDays}
        emptyText="Yaklaşan randevu yok"
      />

      {past.length > 0 && (
        <div className="space-y-2">
          <ListTable
            title="Geçmiş randevular"
            subtitle={[noShowCount > 0 ? `${noShowCount} kez gelmedi` : "", pastDoctor ? `Hekim: ${pastDoctor}` : ""].filter(Boolean).join(" · ") || undefined}
            columns={columns(pastDoctor)}
            rows={shownPast}
            rowKey={(appointment) => appointment.id}
            onRowClick={open}
            getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunu aç`}
            mobileCard={(appointment) => renderMobileCard(appointment, pastDoctor)}
          />
          {past.length > PAST_PREVIEW && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllPast((current) => !current)} aria-expanded={showAllPast}>
              {showAllPast ? `Son ${PAST_PREVIEW} randevuyu göster` : `Tüm geçmiş randevular (${past.length})`}
            </Button>
          )}
        </div>
      )}

      {selected && (
        <AppointmentWindows
          key={selected.id}
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void reload(true)}
          onEnterTreatment={() => { setSelected(null); startIntent("tedavi", "treatment"); }}
          onTakePayment={() => { setSelected(null); openPayment(); }}
        />
      )}
    </div>
  );
}
