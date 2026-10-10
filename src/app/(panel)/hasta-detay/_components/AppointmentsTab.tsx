"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { formatDateText } from "@/components/ui/Money";
import { patchAppointment } from "@/components/randevu/appointment-api";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { canMarkNoShow, isStaleWaitingAppointment } from "@/lib/appointment-status";
import { parseAppointmentNote } from "@/lib/appointment-follow-up";
import { turkeyDateKey } from "@/lib/tz";
import { usePatientFile } from "./PatientFileContext";
import { appointmentStatusView, appointmentTypeLabel, type Appt } from "./patient-file-shared";

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

const PAST_PREVIEW = 10;

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

/**
 * Hastanın randevuları. Yeni randevu Randevular sayfasında bu hasta seçili
 * açılır; durum (geldi/gelmedi) satıra tıklayınca açılan pencereden değişir.
 */
export function AppointmentsTab() {
  const { data, reload, can, appointmentHref } = usePatientFile();
  const [selected, setSelected] = useState<Appt | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const canWrite = can("appointments:write");
  const canCancel = can("appointments:approve");

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
    if (status === "IPTAL" && !(await confirmDialog({ title: "Randevu iptal edilsin mi?", message: "Kayıt geçmişte görünmeye devam eder.", danger: true, confirmText: "Randevuyu iptal et" }))) return;
    setSaving(true);
    try {
      // Takvimle aynı uç: iptal/Gelmedi randevu yeniden açılırken hekimin aynı
      // saatte başka randevusu varsa sunucu onay ister (409); ileti hata gibi
      // görünüyordu, artık "Yine de yeniden aç" diye sorulur.
      const result = await patchAppointment(selected.id, { status });
      if (!result.ok) {
        // Boş ileti: kullanıcı çakışma onayını reddetti.
        if (result.message) showToastSafe({ type: "error", message: result.message });
        return;
      }
      setSelected((current) => (current ? { ...current, status } : current));
      showToastSafe({ type: "success", icon: "calendar", message: `Randevu durumu: ${appointmentStatusView(status).label}.` });
      void reload(true);
    } finally {
      setSaving(false);
    }
  };

  const detailNote = selected ? (parseAppointmentNote(selected.note).detail || selected.note || "") : "";
  // Randevu ileri bir günde mi (bugün değil)? Erken gelen hasta aynı gün
  // "Bekliyor" yapılabilir; ileri günde "geldi" ya da "tamamlandı" denemez.
  const futureDay = selected ? turkeyDateKey(new Date(selected.startAt)) > turkeyDateKey(new Date()) : false;
  const statusOptions = selected
    ? STATUS_OPTIONS.map((option) => {
        const futureNoShow = option.value === "GELMEDI" && !canMarkNoShow(selected.startAt);
        const futureVisit = futureDay && (option.value === "GELDI" || option.value === "TAMAMLANDI");
        const fromCancelled = selected.status === "IPTAL" && option.value !== "IPTAL" && option.value !== "BEKLIYOR";
        // İptal ayrı yetkidir (sunucu appointments:approve ister); seçenek
        // yetkisiz kişide gerekçesiyle pasif görünür, onaydan sonra 403 almaz.
        const cancelForbidden = option.value === "IPTAL" && selected.status !== "IPTAL" && !canCancel;
        return {
          value: option.value as string,
          label: option.label,
          disabled: !canWrite || saving || futureNoShow || futureVisit || fromCancelled || cancelForbidden,
          disabledReason: futureNoShow
            ? "Randevu saati henüz gelmedi"
            : futureVisit
              ? "Randevu günü henüz gelmedi"
              : fromCancelled
                ? "İptal edilen randevu önce Planlandı yapılmalı"
                : cancelForbidden
                  ? "Randevu iptali için yetkiniz yok"
                  : undefined,
        };
      })
    : [];
  const shownPast = showAllPast ? past : past.slice(0, PAST_PREVIEW);

  return (
    <div className="space-y-4">
      <ListTable
        title="Yaklaşan randevular"
        actions={canWrite ? <Button size="sm" variant="secondary" icon={CalendarPlus} href={appointmentHref}>Yeni randevu</Button> : undefined}
        columns={columns}
        rows={upcoming}
        rowKey={(appointment) => appointment.id}
        onRowClick={setSelected}
        getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunun ayrıntısı`}
        mobileCard={mobileCard}
        emptyIcon={CalendarDays}
        emptyText="Yaklaşan randevu yok"
      />

      {past.length > 0 && (
        <div className="space-y-2">
          <ListTable
            title="Geçmiş randevular"
            subtitle={noShowCount > 0 ? `${noShowCount} kez gelmedi` : undefined}
            columns={columns}
            rows={shownPast}
            rowKey={(appointment) => appointment.id}
            onRowClick={setSelected}
            getRowAriaLabel={(appointment) => `${formatDateText(appointment.startAt, "datetime")} randevusunun ayrıntısı`}
            mobileCard={mobileCard}
          />
          {past.length > PAST_PREVIEW && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllPast((current) => !current)} aria-expanded={showAllPast}>
              {showAllPast ? `Son ${PAST_PREVIEW} randevuyu göster` : `Tüm geçmiş randevular (${past.length})`}
            </Button>
          )}
        </div>
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
          <Button variant="secondary" icon={ExternalLink} href={`/randevu?date=${turkeyDateKey(new Date(selected.startAt))}&focusAppointmentId=${selected.id}`}>Takvimde aç</Button>
        ) : undefined}
      >
        {selected && (
          <div className="space-y-4">
            <DescriptionList
              layout="rows"
              items={[
                { key: "doctor", label: "Hekim", value: selected.doctor?.fullName },
                { key: "type", label: "Tür", value: appointmentTypeLabel(selected.type) },
                { key: "unit", label: "Ünite", value: selected.clinicUnit ? `${selected.clinicUnit.name}${selected.clinicUnit.code ? ` · ${selected.clinicUnit.code}` : ""}` : null, hidden: !selected.clinicUnit },
                { key: "note", label: "Not", value: detailNote ? <span className="whitespace-pre-wrap">{detailNote}</span> : null, hidden: !detailNote },
              ]}
            />
            <ChoiceCards
              label={canWrite ? "Durumu değiştir" : "Durum"}
              variant="pills"
              options={statusOptions}
              value={selected.status}
              onChange={(value) => void changeStatus(value)}
              hint="Bekliyor: hasta geldi, bekleme salonunda. Saat ya da hekim değişikliği takvimden yapılır."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
