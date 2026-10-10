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
  isLateUnmarked,
  isUnresolvedPast,
  parseNoteFull,
  phoneHref,
  statusChipLabel,
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
  /** Sıkı görünüm (anasayfa): tedavi ayrı sütun yerine hastanın altında. */
  compact?: boolean;
  /** "Sıradaki" olarak vurgulanacak randevu. */
  highlightId?: string | null;
  /** Liste kartının üstünde (ör. durum süzgeci). */
  header?: ReactNode;
  /** Veri ekrandayken yenileme başarısız oldu: liste yerinde kalır, üstte ince uyarı. */
  staleError?: string | null;
  emptyText?: string;
};

const QUICK_ARIA: Record<string, string> = {
  GELDI: "geldi olarak işaretle",
  TAMAMLANDI: "tamamlandı olarak işaretle",
  GELMEDI: "gelmedi olarak işaretle",
};

/** Bugünün randevusu için tek dokunuşla sonraki durum (Planlandı → Geldi → Tamamlandı). */
export function nextQuickStatus(appointment: Appointment): { status: string; label: string } | null {
  const today = toDateKey(new Date());
  if (toDateKey(new Date(appointment.startAt)) !== today) return null;
  if (appointment.status === "BEKLIYOR" || appointment.status === "ONAYLANDI") return { status: "GELDI", label: "Geldi" };
  // Düğme fiil söyler ("Tamamla"); yanındaki rozet durumu ("Geldi (bekliyor)") — canlı-mobil U12.
  if (appointment.status === "GELDI") return { status: "TAMAMLANDI", label: "Tamamla" };
  return null;
}

/**
 * Satırdaki hızlı durum düğmeleri. Bugün: tek sonraki adım. Geçmiş günde
 * durumu işaretlenmemiş randevu: "Tamamla" (hasta gelmişse) ve henüz
 * gelişi işaretlenmemişse "Gelmedi" — gün sonu kapatma satırdan tek dokunuş
 * (önceden detay penceresinden üç adım; canlı test).
 */
export function quickStatusActions(appointment: Appointment): Array<{ status: string; label: string }> {
  const next = nextQuickStatus(appointment);
  if (next) return [next];
  if (!isUnresolvedPast(appointment.status, appointment.startAt)) return [];
  const actions = [{ status: "TAMAMLANDI", label: "Tamamla" }];
  if (appointment.status !== "GELDI") actions.push({ status: "GELMEDI", label: "Gelmedi" });
  return actions;
}

/**
 * Satırdaki TEK durum rozeti. Saati geçmiş ya da önceki günden açık kalmış
 * randevuda durum ve uyarı aynı rozette yazar ("Planlandı · saati geçti");
 * önceden yan yana iki rozet ("Planlandı" + "Saati geçti") satırı kalabalıklaştırıyordu.
 */
export function AppointmentStatusBadge({ appointment }: { appointment: Appointment }) {
  const Icon = STATUS_ICON[displayStatus(appointment.status)];
  const shortLabel = appointment.status === "GELDI" ? "Geldi" : statusChipLabel(appointment.status);
  // Telefonda yalnız uyarı yazar (simge durumu gösterir): rozet telefon numarasıyla aynı satıra sığsın.
  const warning = (text: string, title: string) => (
    <Badge tone="warning" icon={Icon} title={title}>
      <span className="sm:hidden">{text.charAt(0).toLocaleUpperCase("tr-TR")}{text.slice(1)}</span>
      <span className="max-sm:hidden">{shortLabel} · {text}</span>
    </Badge>
  );
  if (isUnresolvedPast(appointment.status, appointment.startAt)) {
    return warning("işaretlenmedi", `${statusChipLabel(appointment.status)} — durumu işaretlenmedi`);
  }
  if (isLateUnmarked(appointment.status, appointment.startAt)) {
    return warning("saati geçti", `${statusChipLabel(appointment.status)} — saati geçti, gelişi işaretlenmedi`);
  }
  return <Badge tone={statusTone(appointment.status)} icon={Icon}>{statusChipLabel(appointment.status)}</Badge>;
}

export function QuickStatusButton({ appointment, onChanged }: { appointment: Appointment; onChanged: (appointment: Appointment) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const actions = quickStatusActions(appointment);
  if (actions.length === 0) return null;
  const run = async (next: { status: string; label: string }) => {
    setBusy(next.status);
    const result = await patchAppointment(appointment.id, { status: next.status });
    setBusy(null);
    if (!result.ok) {
      if (result.message) showToastSafe({ message: result.message, type: "error" });
      return;
    }
    onChanged({ ...appointment, status: next.status });
    // "Geldi"den sonra bildirim de geldiğini söyler (önceden "Bekliyor" yazıyordu — K3).
    const resultText = next.status === "GELDI" ? "Geldi · bekleme salonunda" : statusChipLabel(next.status);
    showToastSafe({ message: `${appointment.patient?.fullName || "Hasta"} · ${resultText}`, type: "success" });
  };
  return (
    <div className="flex flex-col items-end gap-1.5 md:flex-row md:justify-end">
      {actions.map((next) => (
        <Button
          key={next.status}
          size="sm"
          variant="secondary"
          icon={next.status === "GELMEDI" ? undefined : Check}
          loading={busy === next.status}
          disabled={Boolean(busy) && busy !== next.status}
          aria-label={`${appointment.patient?.fullName || "Hasta"} — ${QUICK_ARIA[next.status] || next.label}`}
          onClick={() => void run(next)}
        >
          {next.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Liste görünümü (telefonda varsayılan; anasayfada "Bugünkü randevular"):
 * seçili günün randevuları saat sırasıyla. Satıra dokununca detay açılır;
 * bugünün randevusunda tek dokunuşla "Geldi"/"Tamamla".
 * Saati geçtiği halde gelişi işaretlenmemiş randevuda "Saati geçti" yazar.
 */
export function AgendaList({
  appointments,
  treatments,
  loading,
  error,
  onRetry,
  canCreate,
  canSeePhone,
  hideDoctor,
  onOpen,
  onChanged,
  emptyAction,
  compact = false,
  highlightId = null,
  header,
  staleError = null,
  emptyText = "Bu gün randevu yok",
}: AgendaListProps) {
  const rows = [...appointments].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const treatmentOf = (row: Appointment) => treatmentMetaOf(parseNoteFull(row.note, treatments).treatment, treatments);

  const nameLine = (row: Appointment) => (
    <p className="flex items-center gap-1.5 font-semibold text-slate-800">
      <span className="truncate">{row.patient?.fullName || "Hasta"}</span>
      {row.patient?.hasContagiousDisease && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Bulaşıcı hastalık uyarısı" />}
      {highlightId === row.id && <Badge tone="info" solid>Sıradaki</Badge>}
    </p>
  );

  const phoneLink = (row: Appointment) => {
    const tel = canSeePhone ? phoneHref(row.patient?.phone) : null;
    return tel ? <a href={tel} className="whitespace-nowrap font-semibold tabular-nums text-primary hover:underline">{formatPhoneDisplay(row.patient?.phone)}</a> : null;
  };

  // Hücre en çok iki satır: ad + (sıkı görünümde tedavi ·) telefon. Önceden
  // anasayfada ad, tedavi ve telefon üç ayrı satırdı.
  const patientCell = (row: Appointment) => {
    const tel = phoneLink(row);
    const treatment = compact ? treatmentOf(row).label : "";
    return (
      <div className="min-w-0">
        {nameLine(row)}
        {(treatment || tel) && (
          <p className="text-xs text-slate-500">
            {treatment}
            {treatment && tel && <span aria-hidden="true"> · </span>}
            {tel}
          </p>
        )}
      </div>
    );
  };

  const statusCell = (row: Appointment) => <AppointmentStatusBadge appointment={row} />;

  const treatmentCell = (row: Appointment) => {
    const meta = treatmentOf(row);
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
    ...(compact ? [] : [{ key: "tedavi", header: "Tedavi", render: treatmentCell }]),
    { key: "durum", header: "Durum", render: statusCell },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (canCreate ? <QuickStatusButton appointment={row} onChanged={onChanged} /> : null),
    },
  ];

  const table = (
    <ListTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={loading}
      error={error}
      staleError={staleError}
      onRetry={onRetry}
      onRowClick={onOpen}
      header={header}
      getRowAriaLabel={(row) => `${formatTimeRange(row.startAt, row.endAt)} ${row.patient?.fullName || "Hasta"} — detayı aç`}
      rowClassName={(row) => (row.status === "IPTAL" ? "opacity-60" : highlightId === row.id ? "bg-primary/[0.04]" : "")}
      emptyText={emptyText}
      emptyAction={emptyAction}
      // Telefonda kart üç satır: ad · tedavi (ve doktor) · durum + telefon. Eylem
      // düğmesi sağda, ayrı bir sıra oluşturmaz.
      mobileCard={(row) => {
        const meta = [treatmentOf(row).label, hideDoctor ? "" : row.doctor?.fullName || ""].filter(Boolean).join(" · ");
        const tel = phoneLink(row);
        return (
          <div className="flex items-start gap-3">
            <div className="w-12 shrink-0 pt-0.5 text-sm font-bold tabular-nums text-slate-800">{formatTimeRange(row.startAt, row.endAt).split("–")[0]}</div>
            <div className="min-w-0 flex-1 space-y-1">
              {nameLine(row)}
              {meta && <p className="truncate text-xs text-slate-500">{meta}</p>}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {statusCell(row)}
                {tel}
              </div>
            </div>
            {canCreate && <div className="shrink-0"><QuickStatusButton appointment={row} onChanged={onChanged} /></div>}
          </div>
        );
      }}
    />
  );

  // Sıkı görünümde (anasayfa) sütun başlıkları yalnız ekran okuyucuya kalır:
  // saat, hasta ve durum kendini anlatıyor; durum süzgeci şeridinin altında
  // ikinci bir başlık şeridi oluşmasın.
  return compact ? <div className="[&_thead]:sr-only">{table}</div> : table;
}
