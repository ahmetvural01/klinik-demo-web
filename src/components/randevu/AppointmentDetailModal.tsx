"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, Check, ClipboardPlus, FileText, ListChecks, Pencil, Phone, RotateCcw, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Select, Textarea } from "@/components/ui/Input";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { canMarkNoShow } from "@/lib/appointment-status";
import { getFollowUpMeta, type FollowUpKey, type TreatmentOption } from "@/lib/appointment-follow-up";
import { routes } from "@/lib/routes";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { cancelAppointment, fetchPatientContext, patchAppointment } from "@/components/randevu/appointment-api";
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
  patientNoticeText,
  phoneHref,
  statusChipLabel,
  statusTone,
  toDateKey,
  treatmentMetaOf,
  type Appointment,
  type AppointmentPermissions,
  type CalendarSettings,
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
  /** Kurum bildirim anahtarları (iptal onayında "mesaj gider mi" metni için). */
  settings?: CalendarSettings | null;
  /** İptalden sonra boşalan saati doldurmak için bekleme listesi (sayı > 0 ise düğme görünür). */
  waitlistCount?: number;
  onOpenWaitlist?: () => void;
};

type StatusAction = { status: string; label: string; doneTitle: string; icon: typeof Check };

// Düğme fiili söyler ("Geldi", "Tamamla"), üstteki rozet durumu ("Geldi
// (bekliyor)" = hasta geldi, bekleme salonunda). Fiiller Liste görünümündeki
// hızlı düğmelerle aynıdır (önceden listede "Tamamla", burada "Tamamlandı").
const STATUS_ACTIONS: StatusAction[] = [
  { status: "GELDI", label: "Geldi", doneTitle: "Geldi", icon: Check },
  { status: "TAMAMLANDI", label: "Tamamla", doneTitle: "Tamamlandı", icon: Check },
  { status: "GELMEDI", label: "Gelmedi", doneTitle: "Gelmedi", icon: AlertTriangle },
];

const FUTURE_DAY_REASON = "Randevu günü henüz gelmedi.";

/**
 * Randevu detayı: üstte kim/ne zaman/hangi doktor tek bakışta; altında
 * durumu değiştiren fiiller (Geldi · Tamamlandı · Gelmedi) ve duruma göre
 * sonraki adım (Tedavi gir, Tahsilat al, Sonraki randevu). Not okunur durur,
 * "Düzenle" ile açılır. İptal ayrı ve solda; pencereyi X/Esc kapatır.
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
  settings = null,
  waitlistCount = 0,
  onOpenWaitlist,
}: AppointmentDetailModalProps) {
  const [current, setCurrent] = useState<Appointment>(appointment);
  const parsed = useMemo(() => parseNoteFull(current.note, treatments), [current.note, treatments]);
  const [editingNote, setEditingNote] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpKey>(parsed.followUp);
  const [noteText, setNoteText] = useState(parsed.detail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const display = displayStatus(current.status);
  const StatusIcon = STATUS_ICON[display];
  const treatment = treatmentMetaOf(parsed.treatment, treatments);
  const unresolved = isUnresolvedPast(current.status, current.startAt);
  const noShowAllowed = canMarkNoShow(current.startAt);
  // Gelecek gündeki randevuya "Geldi"/"Tamamla" basılamaz (yalnız "Gelmedi"
  // kısıtlıydı; ileri tarihli randevu yanlışlıkla tamamlanabiliyordu — H8).
  const futureDay = toDateKey(new Date(current.startAt)) > toDateKey(new Date());
  const isCancelled = current.status === "IPTAL";
  const patientId = current.patient?.id || "";
  const phone = permissions.canSeePhone ? current.patient?.phone : null;
  const tel = phoneHref(phone);
  const noteDirty = editingNote && (followUp !== parsed.followUp || noteText.trim() !== parsed.detail.trim());
  const canCancel = (permissions.canDelete || permissions.canApprove) && !isCancelled;
  // Sonraki adım düğmeleri yalnız işi yapabilecek role: bankoya "Tedavi gir"
  // çıkıyor, tıklayınca Tedavi sekmesi olmadığı için Özet açılıyordu.
  const { can } = usePermissions();
  const canEnterTreatment = can("examinations:write");
  const canTakePayment = can("payments:write");
  const followUpMeta = getFollowUpMeta(parsed.followUp);

  const changeStatus = async (status: string, label: string) => {
    if (busy) return;
    setError(null);
    setBusy(status);
    const result = await patchAppointment(current.id, { status });
    setBusy(null);
    if (!result.ok) {
      if (result.message) setError(result.message);
      return;
    }
    const next = { ...current, status };
    setCurrent(next);
    onChanged(next);
    // "Geldi"den sonra bildirim de hastanın geldiğini söyler (önceden "Bekliyor" — K3).
    const resultText = status === "GELDI" ? "bekleme salonunda" : statusChipLabel(status);
    showToastSafe({ title: label, message: `${current.patient?.fullName || "Hasta"} · ${resultText}`, type: "success" });
  };

  /**
   * İptal onayında mesaj cümlesi kesin olsun: hastanın iletişim izni randevu
   * formundaki uçtan (patient-context) okunur. Okunamazsa (yetki/ağ) eski
   * "izni varsa" cümlesi kalır; onay penceresi en çok 2,5 sn bekler.
   */
  const loadNotify = async () => {
    if (!patientId || !permissions.canCreate || current.smsInfo === false) return null;
    if (new Date(current.startAt).getTime() <= Date.now() || settings?.notify?.cancel === false) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      return (await fetchPatientContext(patientId, current.id, controller.signal))?.notify ?? null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy("IPTAL");
    const notify = await loadNotify();
    setBusy(null);
    const confirmed = await confirmDialog({
      title: "Randevu iptal edilsin mi?",
      message: `${current.patient?.fullName || "Hasta"} · ${formatDayShort(new Date(current.startAt))} ${formatTimeRange(current.startAt, current.endAt)}. ${patientNoticeText("cancel", current, settings, { notify })} Kayıt silinmez; Liste görünümünde “İptal” süzgecinde görünür.`,
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
      if (result.message) setError(result.message);
      return;
    }
    const next = { ...current, status: "IPTAL" };
    setCurrent(next);
    onChanged(next);
    showToastSafe({ title: "Randevu iptal edildi", message: `${current.patient?.fullName || "Hasta"} · saat boşaldı.`, type: "success" });
  };

  const saveNote = async () => {
    if (busy) return;
    setBusy("NOTE");
    setError(null);
    const nextNote = buildNoteSafe(followUp, noteText, parsed.treatment);
    const result = await patchAppointment(current.id, { note: nextNote });
    setBusy(null);
    if (!result.ok) {
      if (result.message) setError(result.message);
      return;
    }
    const next = { ...current, note: nextNote };
    setCurrent(next);
    setEditingNote(false);
    onChanged(next);
    showToastSafe({ message: "Not kaydedildi.", type: "success" });
  };

  const startNoteEdit = () => {
    setFollowUp(parsed.followUp);
    setNoteText(parsed.detail);
    setEditingNote(true);
  };

  // Duruma göre tek birincil "sonraki adım" (gelecek günde yok: düğmeler pasif).
  const primaryStatus = isCancelled || futureDay ? null : current.status === "GELDI" ? "TAMAMLANDI" : current.status === "TAMAMLANDI" || current.status === "GELMEDI" ? null : "GELDI";

  const footer = (permissions.canCreate && !isCancelled) || canCancel ? (
    <>
      {canCancel && (
        <Button variant="danger-ghost" className="mr-auto" onClick={() => void cancel()} loading={busy === "IPTAL"} disabled={Boolean(busy) && busy !== "IPTAL"}>
          Randevuyu iptal et
        </Button>
      )}
      {permissions.canCreate && !isCancelled && (
        // İstek sürerken pasif: önceden "Planlandı'ya geri al" yanıtı gelmeden
        // açılan düzenleme formu eski durumu geri yazıyordu (canlı test H2).
        <Button variant="secondary" icon={Pencil} disabled={Boolean(busy)} onClick={() => onEdit(current)}>Düzenle / taşı</Button>
      )}
    </>
  ) : undefined;

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
          <Badge tone={statusTone(current.status)} icon={StatusIcon} size="md">{statusChipLabel(current.status)}</Badge>
          {unresolved && <Badge tone="warning" icon={AlertTriangle}>Gün geçti, durum işaretlenmedi</Badge>}
        </div>

        {current.patient?.hasContagiousDisease && (
          <Callout tone="critical" compact title="Bulaşıcı hastalık">{current.patient.contagiousDiseaseNote || "Hasta kartında işaretli."}</Callout>
        )}

        <FormErrorBanner message={error} />

        <DescriptionList
          layout="rows"
          items={[
            { key: "doktor", label: "Doktor", value: current.doctor?.fullName },
            {
              key: "tedavi",
              label: "Tedavi",
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: treatment.color }} aria-hidden="true" />
                  {treatment.label}
                </span>
              ),
            },
            {
              key: "telefon",
              label: "Telefon",
              hidden: !phone,
              value: tel ? (
                <a href={tel} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {formatPhoneDisplay(phone)}
                </a>
              ) : formatPhoneDisplay(phone),
            },
            {
              key: "alan",
              label: "Tedavi alanı",
              hidden: !current.clinicUnit,
              value: current.clinicUnit ? `${current.clinicUnit.name}${current.clinicUnit.code ? ` · ${current.clinicUnit.code}` : ""}` : null,
            },
            { key: "sube", label: "Şube", hidden: !(multiBranch && current.branch?.name), value: current.branch?.name },
          ]}
        />

        {permissions.canCreate && !isCancelled && (
          <section aria-label="Durum" className="flex flex-wrap items-center gap-2">
            {STATUS_ACTIONS.map((action) => {
              const active = current.status === action.status;
              const blockedNoShow = action.status === "GELMEDI" && !noShowAllowed;
              const blockedFuture = futureDay && action.status !== "GELMEDI";
              return (
                <Button
                  key={action.status}
                  size="sm"
                  variant={!active && primaryStatus === action.status ? "primary" : "secondary"}
                  icon={active ? Check : undefined}
                  aria-pressed={active}
                  disabled={active || blockedNoShow || blockedFuture || Boolean(busy)}
                  loading={busy === action.status}
                  title={blockedFuture ? FUTURE_DAY_REASON : blockedNoShow ? "Randevu saati gelmeden “Gelmedi” işaretlenemez." : undefined}
                  onClick={() => void changeStatus(action.status, action.doneTitle)}
                >
                  {action.label}
                </Button>
              );
            })}
            {display !== "PLANLANDI" && (
              <Button size="sm" variant="ghost" icon={RotateCcw} disabled={Boolean(busy)} loading={busy === "BEKLIYOR"} onClick={() => void changeStatus("BEKLIYOR", "Planlandı'ya alındı")}>
                Planlandı&apos;ya geri al
              </Button>
            )}
            {/* Pasif düğmenin ipucu dokunmatikte görünmez; neden satırda yazar. */}
            {futureDay && display === "PLANLANDI" && <p className="w-full text-xs text-slate-500">{FUTURE_DAY_REASON} Geliş ve tamamlama o gün işaretlenir.</p>}
          </section>
        )}

        {isCancelled && permissions.canCreate && (
          <Callout
            tone="neutral"
            compact
            action={(
              <>
                {waitlistCount > 0 && onOpenWaitlist && (
                  <Button size="sm" variant="secondary" icon={ListChecks} count={waitlistCount} countTone="warning" countLabel="bekleyen hasta" onClick={onOpenWaitlist}>Bekleme listesi</Button>
                )}
                <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === "BEKLIYOR"} onClick={() => void changeStatus("BEKLIYOR", "Randevu yeniden açıldı")}>Yeniden aç</Button>
              </>
            )}
          >
            Bu randevu iptal edildi.
          </Callout>
        )}

        {/* Sonraki adım: hasta dosyasındaki mevcut akışlara bağlanır. */}
        {patientId && (
          <section aria-label="Sonraki adım" className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {current.status === "GELDI" && (
              <>
                {canEnterTreatment && <Button size="sm" variant="secondary" icon={ClipboardPlus} href={routes.patient(patientId, "tedavi")}>Tedavi gir</Button>}
                {canTakePayment && <Button size="sm" variant="secondary" icon={Wallet} href={routes.patient(patientId, "odeme")}>Tahsilat al</Button>}
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

        <section aria-label="Not" className="rounded-lg border border-slate-200 p-3">
          {editingNote ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_1fr]">
                <FormField label="Takip durumu" htmlFor="appt-followup" hint="Hasta aramalarına düşer.">
                  <Select id="appt-followup" size="sm" value={followUp} onChange={(event) => setFollowUp(event.target.value as FollowUpKey)}>
                    {followUpChoices(followUp).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Randevu notu" htmlFor="appt-note-detail">
                  <Textarea id="appt-note-detail" rows={2} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Ör. 2 kez arandı, ulaşılamadı" />
                </FormField>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={busy === "NOTE"} onClick={() => setEditingNote(false)}>Vazgeç</Button>
                <Button size="sm" disabled={!noteDirty} loading={busy === "NOTE"} onClick={() => void saveNote()}>Kaydet</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-bold text-slate-800">Not</p>
                <p className="whitespace-pre-line text-sm text-slate-700">{parsed.detail || <span className="text-slate-400">Not yok</span>}</p>
                {parsed.followUp !== "YOK" && <Badge tone={followUpMeta.needsAction ? "warning" : "neutral"}>{followUpMeta.label}</Badge>}
              </div>
              {permissions.canCreate && (
                // "Notu düzenle": alttaki "Düzenle / taşı" (randevu formu) ile karışmasın.
                <Button size="sm" variant="ghost" icon={Pencil} onClick={startNoteEdit} className="shrink-0">Notu düzenle</Button>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
