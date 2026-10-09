"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarPlus, FileDown, FolderOpen, MessageCircle, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatPhoneNumber } from "@/lib/format";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { DueLabel, priorityLabel } from "@/components/takip/takip-labels";
import {
  appointmentLink,
  phoneDigitsForTel,
  whatsappHref,
  type ApiFollowUp,
  type ApiFollowUpType,
  type FollowItem,
  type FollowUpEvent,
  type PatientVisit,
} from "./follow-up-model";

type OutcomeKey = "ULASILAMADI" | "GERI_ARA" | "DONUS_BEKLENIYOR" | "RANDEVU" | "ISTEMIYOR" | "TAMAM";

type Outcome = { key: OutcomeKey; label: string; close: boolean; days?: number; type?: ApiFollowUpType; hint: string };

// Görüşmenin sonucu: açık kalanlar sonraki arama tarihini kendiliğinden
// doldurur (değiştirilebilir); kapatanlar takibi bitirir.
const OUTCOMES: Outcome[] = [
  { key: "ULASILAMADI", label: "Ulaşılamadı", close: false, days: 2, type: "ULASILAMADI", hint: "2 gün sonra tekrar aranır" },
  { key: "GERI_ARA", label: "Tekrar aranacak", close: false, days: 1, type: "GERI_ARA", hint: "Yarın tekrar aranır" },
  { key: "DONUS_BEKLENIYOR", label: "Hasta dönüş yapacak", close: false, days: 3, type: "DONUS_BEKLENIYOR", hint: "3 gün sonra hatırlatılır" },
  { key: "RANDEVU", label: "Randevu verildi", close: true, hint: "Takip kapanır" },
  { key: "ISTEMIYOR", label: "İstemiyor / vazgeçti", close: true, hint: "Takip kapanır" },
  { key: "TAMAM", label: "Görüşüldü, iş bitti", close: true, hint: "Takip kapanır" },
];

const CHANNELS = ["Telefon", "WhatsApp", "Yüz yüze", "SMS", "E-posta", "Diğer"] as const;

function inDays(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(0, 0, 0);
  return turkeyDateTimeLocalValue(date);
}

function localToIso(value: string) {
  return turkeyLocalDateTimeToUtc(value.slice(0, 10), value.slice(11, 16)).toISOString();
}

type Props = {
  /** Çağıran her takip için key ile yeniden kurar; pencere her seferinde temiz açılır. */
  item: FollowItem;
  onClose: () => void;
  /** Kayıt değişti: güncel takip (varsa) ile liste yenilenir. */
  onChanged: (followUp: ApiFollowUp | null, message: string) => void;
  canWrite: boolean;
  canUseWhatsapp: boolean;
  canBookAppointments: boolean;
  hidePhone: boolean;
  visit?: PatientVisit;
  /** Aynı hastanın diğer açık takip sayısı. */
  otherOpenCount: number;
};

/**
 * Takip penceresi: üstte hasta ve iletişim, ortada TEK "Görüşme kaydet"
 * formu (sonuç + not + sonraki arama), altta salt okunur görüşme geçmişi.
 * Önceden aynı görüşme iki ayrı yerden (sonuç düğmeleri ve "Hasta Notu Ekle")
 * giriliyor, ikisi de yarım kalıyordu (denetim HL-02, HL-14).
 */
export function FollowUpDetailModal({ item, onClose, onChanged, canWrite, canUseWhatsapp, canBookAppointments, hidePhone, visit, otherOpenCount }: Props) {
  const [events, setEvents] = useState<FollowUpEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [outcome, setOutcome] = useState<OutcomeKey | "">("");
  const [note, setNote] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [channel, setChannel] = useState<string>("Telefon");
  const [occurredAt, setOccurredAt] = useState(() => turkeyDateTimeLocalValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingEvent, setEditingEvent] = useState<{ id: string; summary: string; detail: string } | null>(null);

  const followUpId = item.followUpId;

  const loadEvents = useCallback(async (id: string) => {
    setEventsLoading(true);
    setEventsError("");
    try {
      const response = await fetch(`/api/patient-follow-ups/${id}/events`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Görüşme geçmişi yüklenemedi.");
      setEvents(Array.isArray(data) ? (data as FollowUpEvent[]) : []);
    } catch (loadError) {
      setEvents([]);
      setEventsError(loadError instanceof Error ? loadError.message : "Görüşme geçmişi yüklenemedi.");
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (followUpId) void loadEvents(followUpId);
  }, [followUpId, loadEvents]);

  const selectedOutcome = OUTCOMES.find((option) => option.key === outcome) || null;
  const dirty = Boolean(outcome || note.trim() || editingEvent);
  const channelOptions = canUseWhatsapp ? CHANNELS : CHANNELS.filter((option) => option !== "WhatsApp");
  // Özel nedenli (DIGER) ve lab takiplerinde sonuç türü değiştirmez; neden korunur (HL-V01).
  const keepsType = item.type === "DIGER" || Boolean(item.labContext);

  const chooseOutcome = (key: OutcomeKey) => {
    setOutcome(key);
    const option = OUTCOMES.find((candidate) => candidate.key === key);
    setNextActionAt(option && !option.close && option.days ? inDays(option.days) : "");
    setError("");
  };

  /** Randevudan türeyen satırda önce kalıcı takip kaydı açılır. */
  const ensureFollowUp = async (type: ApiFollowUpType): Promise<string> => {
    if (item.followUpId) return item.followUpId;
    const response = await fetch("/api/patient-follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: item.patientId,
        appointmentId: item.appointmentId,
        doctorId: item.doctorId,
        type,
        priority: item.priority,
        note: item.noteText || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "Takip kaydı açılamadı.");
    return (data as ApiFollowUp).id;
  };

  const saveOutcome = async (override?: { outcome: Outcome; note: string }) => {
    const chosen = override?.outcome || selectedOutcome;
    const text = (override ? override.note : note).trim();
    if (!chosen) {
      setError("Önce görüşmenin sonucunu seçin.");
      return;
    }
    if (!chosen.close && !nextActionAt && !override) {
      setError("Sonraki arama tarihini seçin.");
      return;
    }
    if (!occurredAt) {
      setError("Görüşme zamanını seçin.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await ensureFollowUp(chosen.type || "GERI_ARA");
      const summary = text ? `${chosen.label}: ${text}` : chosen.label;
      const response = await fetch(`/api/patient-follow-ups/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurredAt: localToIso(occurredAt),
          channel,
          summary: summary.length > 300 ? `${summary.slice(0, 297)}…` : summary,
          detail: summary.length > 300 ? text : undefined,
          outcome: {
            type: keepsType ? undefined : chosen.type,
            nextActionAt: chosen.close ? null : localToIso(nextActionAt),
            close: chosen.close,
            resolutionNote: chosen.close ? summary.slice(0, 2000) : undefined,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görüşme kaydedilemedi.");
      onChanged((data as { followUp?: ApiFollowUp | null }).followUp || null, chosen.close ? "Görüşme kaydedildi, takip kapatıldı." : "Görüşme kaydedildi.");
    } catch (saveError) {
      // Hata pencerenin içinde gösterilir; yazılanlar korunur (HL-V03).
      setError(saveError instanceof Error ? saveError.message : "Görüşme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const closeWithAppointment = () => {
    if (!visit?.nextAppointment) return;
    const when = formatDateText(visit.nextAppointment.startAt, "datetime");
    const randevu = OUTCOMES.find((option) => option.key === "RANDEVU")!;
    void saveOutcome({ outcome: randevu, note: `${when}${visit.nextAppointment.doctorName ? ` · ${visit.nextAppointment.doctorName}` : ""}` });
  };

  const reopen = async () => {
    if (!item.followUpId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/patient-follow-ups/${item.followUpId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACIK", nextActionAt: localToIso(inDays(1)) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Takip yeniden açılamadı.");
      onChanged(data as ApiFollowUp, "Takip yeniden açıldı; yarın aranacaklar listesinde.");
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : "Takip yeniden açılamadı.");
    } finally {
      setSaving(false);
    }
  };

  const saveEventEdit = async () => {
    if (!editingEvent || !item.followUpId) return;
    if (editingEvent.summary.trim().length < 2) {
      setError("Görüşme özeti boş olamaz.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/patient-follow-ups/${item.followUpId}/events/${editingEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: editingEvent.summary.trim(), detail: editingEvent.detail.trim() || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görüşme kaydı güncellenemedi.");
      setEditingEvent(null);
      showToastSafe({ title: "Güncellendi", message: "Görüşme kaydı düzeltildi.", type: "success" });
      await loadEvents(item.followUpId);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Görüşme kaydı güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (event: FollowUpEvent) => {
    if (!item.followUpId) return;
    const confirmed = await confirmDialog({
      title: "Görüşme kaydı kaldırılsın mı?",
      message: "Kayıt bu listeden kalkar; işlem kayıtlarında saklanmaya devam eder.",
      danger: true,
      confirmText: "Kaldır",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/patient-follow-ups/${item.followUpId}/events/${event.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görüşme kaydı kaldırılamadı.");
      await loadEvents(item.followUpId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Görüşme kaydı kaldırılamadı.");
    }
  };

  const downloadHistory = async () => {
    const { createPdfDoc, addPdfTitle, addPdfSection } = await import("@/lib/pdf-export");
    const doc = createPdfDoc("l");
    addPdfTitle(doc, `Hasta takip geçmişi — ${item.patientName}`, `${item.reasonLabel} · ${item.isOpen ? "Açık" : "Kapalı"} · ${formatDateText(new Date(), "datetime")}`);
    addPdfSection(doc, 30, "Görüşmeler", ["Tarih", "Kanal", "Sonuç / not", "Kaydeden"], events.map((event) => [
      formatDateText(event.occurredAt, "datetime"),
      event.channel || "—",
      [event.summary, event.patientResponse, event.nextStep, event.detail].filter(Boolean).join(" — "),
      event.createdBy?.fullName || "—",
    ]));
    doc.save(`hasta-takip-${item.patientName.replace(/\s+/g, "-")}.pdf`);
  };

  const phone = !hidePhone && item.patientPhone ? item.patientPhone : null;
  const telHref = phone ? `tel:${phoneDigitsForTel(phone, item.phoneCountryCode)}` : "";
  const waHref = phone && canUseWhatsapp && item.whatsappConsent ? whatsappHref(phone, item.phoneCountryCode) : "";

  return (
    <Modal
      open
      onClose={onClose}
      isDirty={dirty}
      title={item.patientName}
      description={[item.reasonLabel, item.doctorName, item.isOpen ? null : "Kapalı"].filter(Boolean).join(" · ")}
      module="follow"
      size="lg"
      footer={canWrite && item.isOpen ? (
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void saveOutcome()} loading={saving}>Kaydet</Button>
        </>
      ) : (
        <Button variant="secondary" onClick={onClose}>Kapat</Button>
      )}
    >
      <div className="space-y-4">
        {/* İletişim ve gezinme: tek satır, ikincil düğmeler */}
        <div className="flex flex-wrap items-center gap-2">
          {phone ? (
            <a href={telHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-primary hover:bg-slate-50">
              <Phone className="h-4 w-4" aria-hidden="true" />
              {formatPhoneNumber(phone)}
            </a>
          ) : (
            <span className="text-sm text-slate-400">{hidePhone ? "Telefonu görme yetkiniz yok" : "Kayıtlı telefon yok"}</span>
          )}
          {phone && canUseWhatsapp && (waHref ? (
            <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
          ) : (
            // Hasta WhatsApp iznini vermemişse bağlantı açılmaz (KVKK/izin).
            <span title="Bu hasta WhatsApp ile iletişim için izin vermemiş" className="inline-flex min-h-9 cursor-not-allowed items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
              WhatsApp izni yok
            </span>
          ))}
          <span className="flex-1" />
          {canBookAppointments && (
            <Button size="sm" variant="secondary" icon={CalendarPlus} href={appointmentLink(item.patientId, item.patientName)}>Randevu ver</Button>
          )}
          <Button size="sm" variant="ghost" icon={FolderOpen} href={`/hasta-detay?id=${item.patientId}`}>Hasta dosyası</Button>
        </div>

        {visit?.nextAppointment && item.isOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Randevusu var: <strong className="tabular-nums">{formatDateText(visit.nextAppointment.startAt, "datetime")}</strong>
              {visit.nextAppointment.doctorName ? ` · ${visit.nextAppointment.doctorName}` : ""}
            </span>
            {canWrite && (
              <Button size="sm" variant="secondary" className="ml-auto" disabled={saving} onClick={closeWithAppointment}>Randevu verildi, takibi kapat</Button>
            )}
          </div>
        )}

        {/* Neden burada? */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.reasonTone}>{item.reasonLabel}</Badge>
            {item.priority >= 3 && <Badge tone="critical">Yüksek öncelik</Badge>}
            {item.priority <= 1 && <Badge tone="neutral">{priorityLabel(item.priority)} öncelik</Badge>}
            {otherOpenCount > 0 && <Badge tone="warning">Bu hastanın {otherOpenCount} açık takibi daha var</Badge>}
            {item.isOpen && item.nextActionAt && (
              <span className="text-xs text-slate-500">Sonraki arama: <DueLabel at={item.nextActionAt} /></span>
            )}
          </div>
          {item.labContext && (
            <p className="mt-1.5 text-slate-700">
              {item.labContext.receivedStep ? `${item.labContext.receivedStep} geldi` : "Laboratuvardan prova geldi"}
              {item.labContext.labType ? ` · ${item.labContext.labType}` : ""}
              {item.labContext.labName ? ` · ${item.labContext.labName}` : ""} — hastaya prova randevusu verilecek.
            </p>
          )}
          {item.appointmentStartAt && !item.labContext && (
            <p className="mt-1.5 text-slate-600">Randevu: {formatDateText(item.appointmentStartAt, "datetime")}</p>
          )}
          {item.noteText && <p className="mt-1.5 whitespace-pre-line text-slate-700">{item.noteText}</p>}
          {!item.isOpen && (
            <p className="mt-1.5 text-slate-700">
              <span className="font-semibold">Kapanış{item.closedAt ? ` (${formatDateText(item.closedAt, "datetime")})` : ""}:</span> {item.resolutionNote || "—"}
            </p>
          )}
        </div>

        <FormErrorBanner message={error} />

        {canWrite && item.isOpen && (
          <section aria-labelledby="gorusme-kaydet" className="space-y-3">
            <h3 id="gorusme-kaydet" className="text-sm font-bold text-slate-900">Görüşme kaydet</h3>
            <ChoiceCards
              label="Görüşmenin sonucu"
              variant="pills"
              options={OUTCOMES.map((option) => ({ value: option.key, label: option.label }))}
              value={outcome as OutcomeKey}
              onChange={chooseOutcome}
            />
            {selectedOutcome && <p className="-mt-1 text-xs text-slate-500">{selectedOutcome.hint}.</p>}
            <FormField label="Not" htmlFor="followup-note" hint="İsteğe bağlı: hasta ne dedi, ne konuşuldu?">
              <Textarea id="followup-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2500} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              {selectedOutcome && !selectedOutcome.close && (
                <FormField label="Sonraki arama" htmlFor="followup-next" required>
                  <Input id="followup-next" type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} />
                </FormField>
              )}
              <FormField label="Görüşme zamanı" htmlFor="followup-at">
                <Input id="followup-at" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} data-dirty-ignore />
              </FormField>
              <FormField label="Nasıl görüşüldü?" htmlFor="followup-channel">
                <Select id="followup-channel" value={channel} onChange={(event) => setChannel(event.target.value)} data-dirty-ignore>
                  {channelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </FormField>
            </div>
          </section>
        )}

        {canWrite && !item.isOpen && item.followUpId && (
          <Button size="sm" variant="secondary" icon={RotateCcw} loading={saving} onClick={() => void reopen()}>Takibi yeniden aç</Button>
        )}

        {item.followUpId && (
          <section aria-labelledby="gorusme-gecmisi" className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="gorusme-gecmisi" className="text-sm font-bold text-slate-900">Görüşme geçmişi</h3>
              {events.length > 0 && <Button size="sm" variant="ghost" icon={FileDown} onClick={() => void downloadHistory()}>PDF indir</Button>}
            </div>
            {eventsLoading ? (
              <p className="text-xs text-slate-500">Yükleniyor…</p>
            ) : eventsError ? (
              <p className="text-xs text-red-700">{eventsError}</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-500">Henüz kayıtlı görüşme yok.</p>
            ) : (
              <ol className="space-y-2">
                {events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    {editingEvent?.id === event.id ? (
                      <div className="space-y-2">
                        <Input value={editingEvent.summary} onChange={(e) => setEditingEvent({ ...editingEvent, summary: e.target.value })} aria-label="Görüşme özeti" maxLength={300} />
                        <Textarea value={editingEvent.detail} onChange={(e) => setEditingEvent({ ...editingEvent, detail: e.target.value })} aria-label="Ayrıntı" rows={2} maxLength={3000} />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEditingEvent(null)}>Vazgeç</Button>
                          <Button size="sm" loading={saving} onClick={() => void saveEventEdit()}>Kaydet</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500">
                            <span className="tabular-nums">{formatDateText(event.occurredAt, "datetime")}</span>
                            {event.channel ? ` · ${event.channel}` : ""}
                            {event.createdBy?.fullName ? ` · ${event.createdBy.fullName}` : ""}
                          </p>
                          <p className="text-sm font-semibold text-slate-800">{event.summary}</p>
                          {event.patientResponse && <p className="text-xs text-slate-600">Hasta: {event.patientResponse}</p>}
                          {event.nextStep && <p className="text-xs text-slate-600">Sonraki adım: {event.nextStep}</p>}
                          {event.detail && <p className="whitespace-pre-line text-xs text-slate-600">{event.detail}</p>}
                        </div>
                        {canWrite && (
                          <div className="flex shrink-0 gap-1">
                            <IconButton size="sm" icon={Pencil} title="Görüşme kaydını düzelt" onClick={() => setEditingEvent({ id: event.id, summary: event.summary, detail: event.detail || "" })} />
                            <IconButton size="sm" icon={Trash2} tone="danger" title="Görüşme kaydını kaldır" onClick={() => void removeEvent(event)} />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
