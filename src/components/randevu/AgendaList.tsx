"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import { patchAppointment } from "@/components/randevu/appointment-api";
import {
  STATUS_ICON,
  displayStatus,
  formatPhoneDisplay,
  formatTimeRange,
  isUnresolvedPast,
  parseNoteFull,
  phoneHref,
  statusLabel,
  statusTone,
  toDateKey,
  treatmentMetaOf,
  type Appointment,
} from "@/components/randevu/appointment-utils";

type AgendaListProps = {
  appointments: Appointment[];
  treatments: TreatmentOption[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  canCreate: boolean;
  canSeePhone: boolean;
  /** Doktor filtresi seçiliyse doktor sütunu gizlenir (her satırda aynı ad tekrar etmesin). */
  hideDoctor: boolean;
  onOpen: (appointment: Appointment) => void;
  onChanged: (appointment: Appointment) => void;
  emptyAction?: ReactNode;
};

/** Bugünün randevusu için tek dokunuşla sonraki durum (Planlandı → Geldi → Tamamlandı). */
export function nextQuickStatus(appointment: Appointment): { status: string; label: string } | null {
  const today = toDateKey(new Date());
  if (toDateKey(new Date(appointment.startAt)) !== today) return null;
  if (appointment.status === "BEKLIYOR" || appointment.status === "ONAYLANDI") return { status: "GELDI", label: "Geldi" };
  if (appointment.status === "GELDI") return { status: "TAMAMLANDI", label: "Tamamlandı" };
  return null;
}

export function QuickStatusButton({ appointment, onChanged }: { appointment: Appointment; onChanged: (appointment: Appointment) => void }) {
  const [busy, setBusy] = useState(false);
  const next = nextQuickStatus(appointment);
  if (!next) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={Check}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const result = await patchAppointment(appointment.id, { status: next.status });
        setBusy(false);
        if (!result.ok) {
          showToastSafe({ message: result.message, type: "error" });
          return;
        }
        onChanged({ ...appointment, status: next.status });
        showToastSafe({ message: `${appointment.patient?.fullName || "Hasta"} · ${statusLabel(next.status)}`, type: "success" });
      }}
    >
      {next.label}
    </Button>
  );
}

/**
 * Liste görünümü (telefonda varsayılan): seçili günün randevuları saat
 * sırasıyla. Satıra dokununca detay açılır; bugünün randevusunda tek
 * dokunuşla "Geldi"/"Tamamlandı" işaretlenir. Telefon (yetki varsa)
 * tıklanınca aranır.
 */
export function AgendaList({ appointments, treatments, loading, error, onRetry, canCreate, canSeePhone, hideDoctor, onOpen, onChanged, emptyAction }: AgendaListProps) {
  const rows = [...appointments].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const patientCell = (row: Appointment) => {
    const tel = canSeePhone ? phoneHref(row.patient?.phone) : null;
    return (
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-semibold text-slate-800">
          <span className="truncate">{row.patient?.fullName || "Hasta"}</span>
          {row.patient?.hasContagiousDisease && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Bulaşıcı hastalık uyarısı" />}
        </p>
        {tel && (
          <a href={tel} className="text-xs font-semibold text-primary hover:underline">{formatPhoneDisplay(row.patient?.phone)}</a>
        )}
      </div>
    );
  };

  const statusCell = (row: Appointment) => {
    const Icon = STATUS_ICON[displayStatus(row.status)];
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={statusTone(row.status)} icon={Icon}>{statusLabel(row.status)}</Badge>
        {isUnresolvedPast(row.status, row.startAt) && <Badge tone="warning">İşaretlenmedi</Badge>}
      </div>
    );
  };

  const treatmentCell = (row: Appointment) => {
    const meta = treatmentMetaOf(parseNoteFull(row.note, treatments).treatment, treatments);
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
        {meta.label}
      </span>
    );
  };

  const columns: ListTableColumn<Appointment>[] = [
    {
      key: "saat",
      header: "Saat",
      cellClassName: "whitespace-nowrap",
      render: (row) => <span className={`font-bold tabular-nums ${row.status === "IPTAL" ? "text-slate-400 line-through" : "text-slate-800"}`}>{formatTimeRange(row.startAt, row.endAt)}</span>,
    },
    { key: "hasta", header: "Hasta", render: patientCell },
    ...(hideDoctor ? [] : [{ key: "doktor", header: "Doktor", render: (row: Appointment) => row.doctor?.fullName || <EmptyValue /> }]),
    { key: "tedavi", header: "Tedavi", render: treatmentCell },
    { key: "durum", header: "Durum", render: statusCell },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (canCreate ? <QuickStatusButton appointment={row} onChanged={onChanged} /> : null),
    },
  ];

  return (
    <ListTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onRowClick={onOpen}
      getRowAriaLabel={(row) => `${formatTimeRange(row.startAt, row.endAt)} ${row.patient?.fullName || "Hasta"} — detayı aç`}
      rowClassName={(row) => (row.status === "IPTAL" ? "opacity-60" : "")}
      emptyText="Bu gün randevu yok"
      emptyDescription={canCreate ? "Yeni randevu vermek için sağ üstteki düğmeyi kullanın." : undefined}
      emptyAction={emptyAction}
      mobileCard={(row) => (
        <div className="flex items-start gap-3">
          <div className="w-14 shrink-0 pt-0.5 text-sm font-bold tabular-nums text-slate-800">{formatTimeRange(row.startAt, row.endAt).split("–")[0]}</div>
          <div className="min-w-0 flex-1 space-y-1">
            {patientCell(row)}
            <p className="text-xs text-slate-500">{[hideDoctor ? "" : row.doctor?.fullName || "", treatmentMetaOf(parseNoteFull(row.note, treatments).treatment, treatments).label].filter(Boolean).join(" · ")}</p>
            {statusCell(row)}
          </div>
          {canCreate && <div className="shrink-0"><QuickStatusButton appointment={row} onChanged={onChanged} /></div>}
        </div>
      )}
    />
  );
}
