"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { formatDateText } from "@/components/ui/Money";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { canMarkNoShow, isStaleWaitingAppointment } from "@/lib/appointment-status";
import { parseAppointmentNote } from "@/lib/appointment-follow-up";
import { turkeyDateKey } from "@/lib/tz";
import { usePatientFile } from "./PatientFileContext";
import { appointmentStatusView, appointmentTypeLabel, errorMessageOf, type Appt } from "./patient-file-shared";

// Ham durum → ekrandaki ad. Ham BEKLIYOR "Planlandı", ham GELDI "Bekliyor"
// (hasta geldi, bekleme salonunda) yazar — kullanıcı geri bildirimiyle
// konmuş kural (bkz. src/lib/appointment-status.ts).
const STATUS_OPTIONS = [
  { value: "BEKLIYOR", label: "Planlandı" },
  { value: "GELDI", label: "Bekliyor" },
  { value: "TAMAMLANDI", label: "Tamamlandı" },
  { value: "GELMEDI", label: "Gelmedi" },
  { value: "IPTAL", label: "İptal" },
] as const;

const timeRange = (appointment: Appt) => `${formatDateText(appointment.startAt, "time")}–${formatDateText(appointment.endAt, "time")}`;

function StatusCell({ appointment }: { appointment: Appt }) {
  const view = appointmentStatusView(appointment.status);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={view.tone}>{view.label}</Badge>
      {isStaleWaitingAppointment(appointment.status, appointment.startAt) && (
        <Badge tone="warning" title="Randevu günü geçti ama geldi/gelmedi işaretlenmedi">İşaretlenmedi</Badge>
      )}
    </span>
  );
}

export function AppointmentsTab() {
  const { data, reload, can, appointmentHref } = usePatientFile();
  const [selected, setSelected] = useState<Appt | null>(null);
  const [saving, setSaving] = useState(false);
  const canWrite = can("appointments:write");

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...data.appointments].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return {
      upcoming: sorted.filter((appointment) => new Date(appointment.endAt || appointment.startAt).getTime() >= now),
      past: sorted.filter((appointment) => new Date(appointment.endAt || appointment.startAt).getTime() < now).reverse(),
    };
  }, [data.appointments]);

  const columns: ListTableColumn<Appt>[] = [
    {
      key: "date",
      header: "Tarih",
      render: (appointment) => (
        <span className="whitespace-nowrap">
          <span className="font-semibold text-slate-800">{formatDateText(appointment.startAt, "long")}</span>
          <span className="ml-2 tabular-nums text-slate-500">{timeRange(appointment)}</span>
        </span>
      ),
    },
    { key: "doctor", header: "Hekim", render: (appointment) => appointment.doctor?.fullName || <EmptyValue /> },
    { key: "type", header: "Tür", render: (appointment) => appointmentTypeLabel(appointment.type) },
    { key: "status", header: "Durum", render: (appointment) => <StatusCell appointment={appointment} /> },
  ];

  const mobileCard = (appointment: Appt) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{formatDateText(appointment.startAt, "long")} · <span className="tabular-nums">{timeRange(appointment)}</span></p>
        <p className="mt-0.5 text-xs text-slate-500">{[appointment.doctor?.fullName, appointmentTypeLabel(appointment.type)].filter(Boolean).join(" · ")}</p>
      </div>
      <StatusCell appointment={appointment} />
    </div>
  );

  const changeStatus = async (status: string) => {
    if (!selected || saving || status === selected.status) return;
    if (status === "IPTAL" && !(await confirmDialog({ message: "Randevu iptal edilsin mi? Kayıt geçmişte görünmeye devam eder.", danger: true, confirmText: "Randevuyu iptal et" }))) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/appointments/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Randevu durumu güncellenemedi."));
      setSelected((current) => (current ? { ...current, status } : current));
      showToastSafe({ type: "success", icon: "calendar", message: `Randevu durumu: ${appointmentStatusView(status).label}.` });
      void reload(true);
    } catch (saveError) {
      showToastSafe({ type: "error", message: saveError instanceof Error ? saveError.message : "Randevu durumu güncellenemedi." });
    } finally {
      setSaving(false);
    }
  };

  const detailNote = selected ? (parseAppointmentNote(selected.note).detail || selected.note || "") : "";
  const statusOptions = selected
    ? STATUS_OPTIONS.map((option) => {
        const futureNoShow = option.value === "GELMEDI" && !canMarkNoShow(selected.startAt);
        const fromCancelled = selected.status === "IPTAL" && option.value !== "IPTAL" && option.value !== "BEKLIYOR";
        return {
          value: option.value as string,
          label: option.label,
          disabled: !canWrite || saving || futureNoShow || fromCancelled,
          disabledReason: futureNoShow ? "Randevu saati henüz gelmedi" : fromCancelled ? "İptal edilen randevu önce Planlandı yapılmalı" : undefined,
        };
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {upcoming.length > 0 ? `${upcoming.length} yaklaşan, ${past.length} geçmiş randevu.` : past.length > 0 ? `İleri tarihli randevu yok · ${past.length} geçmiş randevu.` : "Bu hastanın randevusu yok."}
        </p>
        {canWrite && <Button variant="secondary" icon={CalendarPlus} href={appointmentHref}>Randevu ver</Button>}
      </div>

      <ListTable
        header={<h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Yaklaşan randevular</h2>}
        columns={columns}
        rows={upcoming}
        rowKey={(appointment) => appointment.id}
        onRowClick={setSelected}
        getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunun ayrıntısı`}
        mobileCard={mobileCard}
        emptyIcon={CalendarDays}
        emptyText="Yaklaşan randevu yok"
        emptyDescription={canWrite ? "Kontrol veya tedavi için randevu verebilirsiniz." : undefined}
        emptyAction={canWrite ? <Button size="sm" variant="secondary" icon={CalendarPlus} href={appointmentHref}>Randevu ver</Button> : undefined}
      />

      {past.length > 0 && (
        <ListTable
          header={<h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Geçmiş randevular</h2>}
          columns={columns}
          rows={past}
          rowKey={(appointment) => appointment.id}
          onRowClick={setSelected}
          getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunun ayrıntısı`}
          mobileCard={mobileCard}
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        module="calendar"
        title="Randevu"
        description={selected ? `${data.fullName} · ${formatDateText(selected.startAt, "long")} ${timeRange(selected)}` : undefined}
        size="md"
        trackFormChanges={false}
        footer={selected ? (
          <>
            <Button variant="secondary" href={`/randevu?date=${turkeyDateKey(new Date(selected.startAt))}&focusAppointmentId=${selected.id}`}>Takvimde aç</Button>
            <Button variant="secondary" onClick={() => setSelected(null)}>Kapat</Button>
          </>
        ) : undefined}
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Hekim</dt><dd className="font-semibold text-slate-800">{selected.doctor?.fullName || "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Tür</dt><dd className="font-semibold text-slate-800">{appointmentTypeLabel(selected.type)}</dd></div>
              {selected.clinicUnit && (
                <div><dt className="text-xs text-slate-500">Ünite</dt><dd className="font-semibold text-slate-800">{selected.clinicUnit.name}{selected.clinicUnit.code ? ` · ${selected.clinicUnit.code}` : ""}</dd></div>
              )}
              {detailNote && (
                <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Not</dt><dd className="whitespace-pre-wrap text-slate-700">{detailNote}</dd></div>
              )}
            </dl>
            <ChoiceCards
              label={canWrite ? "Durumu değiştir" : "Durum"}
              variant="pills"
              options={statusOptions}
              value={selected.status}
              onChange={(value) => void changeStatus(value)}
            />
            <p className="text-xs text-slate-500">
              Hasta kliniğe geldiğinde <b>Bekliyor</b> seçin (hasta bekleme salonunda demektir). Saati veya hekimi değiştirmek için <b>Takvimde aç</b>.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
