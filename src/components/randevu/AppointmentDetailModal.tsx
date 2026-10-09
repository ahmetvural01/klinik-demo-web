"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, Check, ClipboardPlus, FileText, Phone, RotateCcw, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Select, Textarea } from "@/components/ui/Input";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { canMarkNoShow } from "@/lib/appointment-status";
import { routes } from "@/lib/routes";
import type { FollowUpKey, TreatmentOption } from "@/lib/appointment-follow-up";
import { cancelAppointment, patchAppointment } from "@/components/randevu/appointment-api";
import {
  STATUS_ICON,
  buildNoteSafe,
  displayStatus,
  durationMinutes,
  followUpChoices,
  formatDayShort,
  formatPhoneDisplay,
  formatTimeRange,
  isUnresolvedPast,
  parseNoteFull,
  phoneHref,
  statusLabel,
  statusTone,
  treatmentMetaOf,
  type Appointment,
  type AppointmentPermissions,
} from "@/components/randevu/appointment-utils";

type AppointmentDetailModalProps = {
  appointment: Appointment;
  treatments: TreatmentOption[];
  permissions: AppointmentPermissions;
  multiBranch: boolean;
  onClose: () => void;
  /** Durum/not değişti — liste yenilensin; güncel kayıt verilir. */
  onChanged: (appointment: Appointment | null) => void;
  onEdit: (appointment: Appointment) => void;
  /** Aynı hasta ve doktorla yeni randevu formu. */
  onNextAppointment: (appointment: Appointment) => void;
};

type StatusAction = { status: string; label: string; icon: typeof Check };

const STATUS_ACTIONS: StatusAction[] = [
  { status: "GELDI", label: "Hasta geldi", icon: Check },
  { status: "TAMAMLANDI", label: "Tamamlandı", icon: Check },
  { status: "GELMEDI", label: "Gelmedi", icon: AlertTriangle },
];

/**
 * Randevu detayı: üstte kim/ne zaman/hangi doktor tek bakışta; altında
 * durumu değiştiren fiiller (Hasta geldi · Tamamlandı · Gelmedi) ve duruma
 * göre sonraki adım (Tedavi gir, Tahsilat al, Sonraki randevu). İptal ayrı ve
 * sonda. Önceden aynı pencerede iki birincil düğme, iki iptal yolu ve not ile
 * takip notunun aynı metni iki kez göstermesi vardı; durum değişince hiçbir
 * bildirim çıkmadan pencere kapanıyordu.
 */
export function AppointmentDetailModal({
  appointment,
  treatments,
  permissions,
  multiBranch,
  onClose,
  onChanged,
  onEdit,
  onNextAppointment,
}: AppointmentDetailModalProps) {
  const [current, setCurrent] = useState<Appointment>(appointment);
  const parsed = useMemo(() => parseNoteFull(current.note, treatments), [current.note, treatments]);
  const [followUp, setFollowUp] = useState<FollowUpKey>(parsed.followUp);
  const [noteText, setNoteText] = useState(parsed.detail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const display = displayStatus(current.status);
  const StatusIcon = STATUS_ICON[display];
  const treatment = treatmentMetaOf(parsed.treatment, treatments);
  const unresolved = isUnresolvedPast(current.status, current.startAt);
  const noShowAllowed = canMarkNoShow(current.startAt);
  const isCancelled = current.status === "IPTAL";
  const patientId = current.patient?.id || "";
  const phone = permissions.canSeePhone ? current.patient?.phone : null;
  const tel = phoneHref(phone);
  const noteDirty = followUp !== parsed.followUp || noteText.trim() !== parsed.detail.trim();
  const canCancel = (permissions.canDelete || permissions.canApprove) && !isCancelled;

  const changeStatus = async (status: string, label: string) => {
    if (busy) return;
    setError(null);
    setBusy(status);
    const result = await patchAppointment(current.id, { status });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const next = { ...current, status };
    setCurrent(next);
    onChanged(next);
    showToastSafe({ title: label, message: `${current.patient?.fullName || "Hasta"} · ${statusLabel(status)}`, type: "success" });
  };

  const cancel = async () => {
    if (busy) return;
    const confirmed = await confirmDialog({
      title: "Randevu iptal edilsin mi?",
      message: `${current.patient?.fullName || "Hasta"} · ${formatDayShort(new Date(current.startAt))} ${formatTimeRange(current.startAt, current.endAt)}. Kayıt silinmez; takvimde “İptal” olarak kalır. Hastaya otomatik mesaj gitmez.`,
      confirmText: "Randevuyu iptal et",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    setBusy("IPTAL");
    setError(null);
    const result = await cancelAppointment(current.id, permissions.canDelete);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const next = { ...current, status: "IPTAL" };
    setCurrent(next);
    onChanged(next);
    showToastSafe({ title: "Randevu iptal edildi", message: `${current.patient?.fullName || "Hasta"} · saat boşaldı. Bekleme listesindeki hastalara bakabilirsiniz.`, type: "success" });
  };

  const saveNote = async () => {
    if (busy) return;
    setBusy("NOTE");
    setError(null);
    const nextNote = buildNoteSafe(followUp, noteText, parsed.treatment);
    const result = await patchAppointment(current.id, { note: nextNote });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const next = { ...current, note: nextNote };
    setCurrent(next);
    onChanged(next);
    showToastSafe({ message: "Not ve takip durumu kaydedildi.", type: "success" });
  };

  // Duruma göre tek birincil "sonraki adım".
  const primaryStatus = isCancelled ? null : current.status === "GELDI" ? "TAMAMLANDI" : current.status === "TAMAMLANDI" || current.status === "GELMEDI" ? null : "GELDI";

  const footer = (
    <>
      {canCancel && (
        <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void cancel()} loading={busy === "IPTAL"}>
          Randevuyu iptal et
        </Button>
      )}
      {permissions.canCreate && !isCancelled && (
        <Button variant="secondary" onClick={() => onEdit(current)}>Düzenle / taşı</Button>
      )}
      <Button variant="secondary" onClick={onClose}>Kapat</Button>
    </>
  );

  return (
    <Modal
      open
      module="calendar"
      onClose={onClose}
      trackFormChanges={false}
      isDirty={noteDirty}
      title={current.patient?.fullName || "Randevu"}
      description={`${formatDayShort(new Date(current.startAt))} · ${formatTimeRange(current.startAt, current.endAt)} (${durationMinutes(current.startAt, current.endAt)} dk)`}
      footer={footer}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(current.status)} icon={StatusIcon} size="md">{statusLabel(current.status)}</Badge>
          {unresolved && <Badge tone="warning" icon={AlertTriangle}>Gün geçti, durum işaretlenmedi</Badge>}
          {current.patient?.hasContagiousDisease && (
            <Badge tone="critical" icon={AlertTriangle} title={current.patient.contagiousDiseaseNote || undefined}>
              Bulaşıcı hastalık{current.patient.contagiousDiseaseNote ? `: ${current.patient.contagiousDiseaseNote}` : ""}
            </Badge>
          )}
        </div>

        <FormErrorBanner message={error} />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Doktor</dt>
          <dd className="font-semibold text-slate-800">{current.doctor?.fullName || "—"}</dd>
          <dt className="text-slate-500">Tedavi</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-slate-800">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: treatment.color }} aria-hidden="true" />
            {treatment.label}
          </dd>
          {phone && (
            <>
              <dt className="text-slate-500">Telefon</dt>
              <dd>
                {tel ? (
                  <a href={tel} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {formatPhoneDisplay(phone)}
                  </a>
                ) : formatPhoneDisplay(phone)}
              </dd>
            </>
          )}
          {current.clinicUnit && (
            <>
              <dt className="text-slate-500">Tedavi alanı</dt>
              <dd className="text-slate-800">{current.clinicUnit.name}{current.clinicUnit.code ? ` · ${current.clinicUnit.code}` : ""}</dd>
            </>
          )}
          {multiBranch && current.branch?.name && (
            <>
              <dt className="text-slate-500">Şube</dt>
              <dd className="text-slate-800">{current.branch.name}</dd>
            </>
          )}
        </dl>

        {permissions.canCreate && !isCancelled && (
          <section aria-label="Durum" className="space-y-2">
            <p className="text-xs font-bold text-slate-800">Durumu işaretle</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS.map((action) => {
                const active = current.status === action.status;
                const blockedNoShow = action.status === "GELMEDI" && !noShowAllowed;
                return (
                  <Button
                    key={action.status}
                    size="sm"
                    variant={active ? "secondary" : primaryStatus === action.status ? "primary" : "secondary"}
                    icon={active ? Check : undefined}
                    aria-pressed={active}
                    disabled={active || blockedNoShow || Boolean(busy)}
                    loading={busy === action.status}
                    title={blockedNoShow ? "Randevu saati gelmeden “Gelmedi” işaretlenemez." : undefined}
                    onClick={() => void changeStatus(action.status, action.label)}
                  >
                    {active ? statusLabel(action.status) : action.label}
                  </Button>
                );
              })}
              {display !== "PLANLANDI" && (
                <Button size="sm" variant="ghost" icon={RotateCcw} disabled={Boolean(busy)} loading={busy === "BEKLIYOR"} onClick={() => void changeStatus("BEKLIYOR", "Planlandı'ya alındı")}>
                  Planlandı&apos;ya geri al
                </Button>
              )}
            </div>
          </section>
        )}

        {isCancelled && permissions.canCreate && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>Bu randevu iptal edildi.</span>
            <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === "BEKLIYOR"} onClick={() => void changeStatus("BEKLIYOR", "Randevu yeniden açıldı")}>Yeniden aç</Button>
          </div>
        )}

        {/* Sonraki adım: hasta dosyasındaki mevcut akışlara bağlanır. */}
        {patientId && (
          <section aria-label="Sonraki adım" className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {current.status === "GELDI" && (
              <>
                <Button size="sm" variant="secondary" icon={ClipboardPlus} href={routes.patient(patientId, "tedavi")}>Tedavi gir</Button>
                <Button size="sm" variant="secondary" icon={Wallet} href={routes.patient(patientId, "odeme")}>Tahsilat al</Button>
              </>
            )}
            {permissions.canCreate && (current.status === "TAMAMLANDI" || current.status === "GELMEDI" || isCancelled) && (
              <Button size="sm" variant={current.status === "TAMAMLANDI" || current.status === "GELMEDI" ? "primary" : "secondary"} icon={CalendarPlus} onClick={() => onNextAppointment(current)}>
                {current.status === "TAMAMLANDI" ? "Sonraki randevuyu ver" : "Yeni randevu ver"}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={FileText} href={routes.patient(patientId)}>Hasta dosyası</Button>
          </section>
        )}

        <section aria-label="Not ve takip" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          {permissions.canCreate ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
                <FormField label="Takip durumu" htmlFor="appt-followup" hint="Hasta Takip listesine düşer.">
                  <Select id="appt-followup" size="sm" value={followUp} onChange={(event) => setFollowUp(event.target.value as FollowUpKey)}>
                    {followUpChoices(followUp).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Randevu notu" htmlFor="appt-note-detail">
                  <Textarea id="appt-note-detail" rows={2} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Ör. 2 kez arandı, ulaşılamadı" />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" disabled={!noteDirty} loading={busy === "NOTE"} onClick={() => void saveNote()}>Notu kaydet</Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-line text-sm text-slate-700">{parsed.detail || <span className="text-slate-400">Not yok</span>}</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
