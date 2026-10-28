"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, FileDown, FolderOpen, MessageCircle, Pencil, Phone, XCircle } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatPhoneNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { DueLabel } from "./takip-labels";
import { DateTimeQuickField } from "./DateTimeQuickField";
import { OUTCOMES, cancelFollowUp, outcomeByKey, recordOutcome, updateFollowUp, type OutcomeKey } from "./follow-up-actions";
import { phoneDigitsForTel, whatsappHref, type ApiFollowUp, type FollowItem, type FollowUpEvent, type PatientVisit } from "./follow-up-model";
import { defaultCallTime, isoDaysFromToday, loadClinicSchedules, openDateKeyFromToday, partsToIso, type DateTimeParts } from "./takip-utils";
import type { DaySchedule } from "@/lib/working-hours-core";

const CHANNELS = ["Telefon", "WhatsApp", "Yüz yüze", "SMS", "E-posta", "Diğer"] as const;

// Sonuçların önerdiği günler (Tekrar aranacak 1, Ulaşılamadı 2, Hasta dönüş yapacak 3) hızlı seçeneklerde
// görünür; başka gün (bugün dahil) tarih alanından seçilir. Dört seçenek tarih alanıyla tek satıra sığar.
const NEXT_CALL_DATES = [
  { label: "Yarın", days: 1 },
  { label: "2 gün sonra", days: 2 },
  { label: "3 gün sonra", days: 3 },
  { label: "1 hafta sonra", days: 7 },
];

type Props = {
  /** Çağıran her arama için key ile yeniden kurar; pencere her seferinde temiz açılır. */
  item: FollowItem;
  onClose: () => void;
  /** Kayıt değişti: güncel arama (varsa) ile liste güncellenir. */
  onChanged: (followUp: ApiFollowUp | null, message: string) => void;
  /** Randevudan türeyen satır için kalıcı kayıt açıldı (görüşme yazılamasa da liste bilsin). */
  onCreated?: (followUp: ApiFollowUp) => void;
  /** "Aramayı düzenle" (kayıtlı ve açık aramada). */
  onEdit?: (item: FollowItem) => void;
  /** "Bu hastanın N açık araması daha var · Göster": listeyi bu hastaya süzer. */
  onShowPatient?: (patientName: string) => void;
  canWrite: boolean;
  canUseWhatsapp: boolean;
  canBookAppointments: boolean;
  hidePhone: boolean;
  visit?: PatientVisit;
  /** Aynı hastanın diğer açık arama sayısı. */
  otherOpenCount: number;
};

function nowParts(): string {
  return turkeyDateTimeLocalValue();
}

function localToIso(value: string) {
  return turkeyLocalDateTimeToUtc(value.slice(0, 10), value.slice(11, 16)).toISOString();
}

/**
 * Arama penceresi: üstte hasta ve iletişim, ortada TEK "Görüşme kaydet"
 * formu (sonuç + sonraki arama + not; görüşme zamanı/kanal katlı), altta
 * görüşme geçmişi. Bağlam tek yerde: neden ve doktor başlıkta, lab bilgisi
 * tek cümlede; kapanmış aramada kapanış metni geçmişte zaten yazdığı için
 * tekrar edilmez (denetim §3.2 sorun 1-3).
 */
export function FollowUpDetailModal({
  item,
  onClose,
  onChanged,
  onCreated,
  onEdit,
  onShowPatient,
  canWrite,
  canUseWhatsapp,
  canBookAppointments,
  hidePhone,
  visit,
  otherOpenCount,
}: Props) {
  const router = useRouter();
  // Liste satırındaki menüyle aynı kural: hasta dosyası bağlantısı yalnız hasta okuma yetkisiyle.
  const canOpenPatient = usePermissions().can("patients:read");
  const [events, setEvents] = useState<FollowUpEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(Boolean(item.followUpId));
  const [eventsError, setEventsError] = useState("");
  const [outcome, setOutcome] = useState<OutcomeKey | "">("");
  const [note, setNote] = useState("");
  const [next, setNext] = useState<DateTimeParts>({ date: "", time: "" });
  const [channel, setChannel] = useState<string>("Telefon");
  const [occurredAt, setOccurredAt] = useState(nowParts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nextError, setNextError] = useState("");
  const [editingEvent, setEditingEvent] = useState<{ id: string; summary: string; detail: string } | null>(null);
  // Randevudan türeyen satırda ilk denemenin açtığı kalıcı kayıt: ikinci denemede yeni kayıt açılmaz.
  const createdIdRef = useRef<string | undefined>(undefined);
  // Kurumun çalışma takvimi: sonuçla önerilen sonraki arama kapalı güne (ör. Pazar) düşmesin.
  const schedulesRef = useRef<DaySchedule[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadClinicSchedules().then((schedules) => { if (alive) schedulesRef.current = schedules; });
    return () => { alive = false; };
  }, []);

  const followUpId = item.followUpId || createdIdRef.current;
  const editable = canWrite && item.isOpen;

  const loadEvents = useCallback(async (id: string) => {
    setEventsLoading(true);
    setEventsError("");
    try {
      const response = await fetch(`/api/patient-follow-ups/${id}/events`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Görüşme geçmişi yüklenemedi.");
      setEvents(Array.isArray(data) ? (data as FollowUpEvent[]) : []);
    } catch (loadError) {
      setEventsError(loadError instanceof Error ? loadError.message : "Görüşme geçmişi yüklenemedi.");
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (item.followUpId) void loadEvents(item.followUpId);
  }, [item.followUpId, loadEvents]);

  const selectedOutcome = outcome ? outcomeByKey(outcome) : null;
  const dirty = Boolean(outcome || note.trim() || editingEvent);
  const channelOptions = canUseWhatsapp ? CHANNELS : CHANNELS.filter((option) => option !== "WhatsApp");
  const occurredIsNow = occurredAt === nowParts();

  const chooseOutcome = (key: OutcomeKey) => {
    setOutcome(key);
    const option = outcomeByKey(key);
    if (option && !option.close && option.days !== undefined) {
      const date = openDateKeyFromToday(option.days, schedulesRef.current);
      setNext({ date, time: defaultCallTime(date) });
    } else {
      setNext({ date: "", time: "" });
    }
    setError("");
    setNextError("");
  };

  const runOutcome = async (key: OutcomeKey, options: { note: string; prefix?: string; nextActionAt?: string | null }) => {
    const chosen = outcomeByKey(key);
    setBusy(true);
    setError("");
    try {
      const updated = await recordOutcome(item, {
        outcome: chosen,
        note: options.note,
        prefix: options.prefix,
        nextActionAt: options.nextActionAt,
        occurredAt: occurredAt ? localToIso(occurredAt) : undefined,
        channel,
      }, {
        existingFollowUpId: createdIdRef.current,
        onCreated: (created) => {
          createdIdRef.current = created.id;
          onCreated?.(created);
        },
      });
      onChanged(updated, chosen.close ? "Görüşme kaydedildi, arama kapatıldı." : "Görüşme kaydedildi.");
    } catch (saveError) {
      // Hata pencerenin içinde gösterilir; yazılanlar korunur (HL-V03).
      setError(saveError instanceof Error ? saveError.message : "Görüşme kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveOutcome = async () => {
    if (!selectedOutcome) {
      setError("Önce görüşmenin sonucunu seçin.");
      return;
    }
    let nextActionAt: string | null = null;
    if (!selectedOutcome.close) {
      nextActionAt = partsToIso(next);
      if (!nextActionAt) {
        setNextError("Sonraki arama gününü seçin.");
        return;
      }
    }
    await runOutcome(selectedOutcome.key, { note, nextActionAt });
  };

  // "Randevusu var · Aramayı kapat": yazılmış not korunur, randevu bilgisi başına eklenir
  // (önceden not atılıyor, yalnız randevu tarihi yazılıyordu — denetim §3.2 sorun 4).
  const closeWithAppointment = () => {
    if (!visit?.nextAppointment) return;
    const when = formatDateText(visit.nextAppointment.startAt, "datetime");
    void runOutcome("RANDEVU", { note, prefix: `${when}${visit.nextAppointment.doctorName ? ` · ${visit.nextAppointment.doctorName}` : ""}` });
  };

  const reopen = async () => {
    if (!item.followUpId) return;
    setBusy(true);
    setError("");
    try {
      // Yeniden açılan arama kurumun kapalı gününe düşmez (ilk açık gün, 10:00).
      const nextActionAt = isoDaysFromToday(1, "10:00", new Date(), schedulesRef.current);
      const updated = await updateFollowUp(item.followUpId, { status: "ACIK", nextActionAt });
      onChanged(updated, `Arama yeniden açıldı; sonraki arama ${formatDateText(nextActionAt, "datetime")}.`);
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : "Arama yeniden açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const cancelCall = async () => {
    if (!item.followUpId) return;
    const confirmed = await confirmDialog({
      title: "Arama iptal edilsin mi?",
      message: "Yanlış açılmış ya da artık gerekmeyen arama listeden kalkar; görüşme geçmişi saklanır.",
      danger: true,
      confirmText: "Aramayı iptal et",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const updated = await cancelFollowUp(item.followUpId);
      onChanged(updated, "Arama iptal edildi.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Arama iptal edilemedi.");
    } finally {
      setBusy(false);
    }
  };

  // Randevu ekranına geçiş sayfadan çıkarır; yazılmış görüşme kaybolmasın diye önce sorulur (denetim §3.2 sorun 5).
  const goToAppointment = async () => {
    if (dirty) {
      const leave = await confirmDialog({
        title: "Görüşme kaydedilmedi",
        message: "Seçtiğiniz sonuç ve not kaydedilmeden randevu ekranına geçilsin mi?",
        confirmText: "Randevu ekranına geç",
      });
      if (!leave) return;
    }
    router.push(routes.newAppointment({ patientId: item.patientId, patientName: item.patientName }));
  };

  const saveEventEdit = async () => {
    if (!editingEvent || !item.followUpId) return;
    if (editingEvent.summary.trim().length < 2) {
      setError("Görüşme özeti boş olamaz.");
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

  const voidEvent = async (event: FollowUpEvent) => {
    if (!item.followUpId) return;
    const confirmed = await confirmDialog({
      title: "Görüşme kaydı geçersiz sayılsın mı?",
      message: "Kayıt bu listeden kalkar; işlem kayıtlarında saklanmaya devam eder.",
      danger: true,
      confirmText: "Geçersiz say",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/patient-follow-ups/${item.followUpId}/events/${event.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görüşme kaydı geçersiz sayılamadı.");
      await loadEvents(item.followUpId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Görüşme kaydı geçersiz sayılamadı.");
    }
  };

  const downloadHistory = async () => {
    const { createPdfDoc, addPdfTitle, addPdfSection, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe font beklenir: yoksa oturumdaki ilk PDF ğ/ı/ş harflerini dönüştürerek yazılır.
    await preparePdfFonts();
    const doc = createPdfDoc();
    // Oluşturma zamanı antette yazılır.
    const y = addPdfTitle(doc, `Hasta arama geçmişi — ${item.patientName}`, `${item.reasonLabel} · ${item.isOpen ? "Açık" : "Kapalı"}`);
    addPdfSection(doc, y, "Görüşmeler", ["Tarih", "Kanal", "Sonuç / not", "Kaydeden"], events.map((event) => [
      formatDateText(event.occurredAt, "datetime"),
      event.channel || "—",
      [event.summary, event.patientResponse, event.nextStep, event.detail].filter(Boolean).join(" — "),
      event.createdBy?.fullName || "—",
    ]));
    doc.save(`hasta-arama-${item.patientName.replace(/\s+/g, "-")}.pdf`);
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Satır içi düzeltmede Enter görüşme formunu değil düzeltmeyi kaydeder.
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEventEdit();
    }
  };

  const phone = !hidePhone && item.patientPhone ? item.patientPhone : null;
  const waHref = phone && canUseWhatsapp && item.whatsappConsent ? whatsappHref(phone, item.phoneCountryCode) : "";
  const latestSummary = events[0]?.summary || item.lastEvent?.summary || "";
  // Kapanış notu yalnız geçmişteki son görüşmeden farklıysa (ör. iptal, otomatik kapanış) ayrıca yazılır.
  const showResolution = !item.isOpen && Boolean(item.resolutionNote) && item.resolutionNote !== latestSummary;

  const menuItems: ActionMenuItem[] = [
    ...(editable && item.followUpId && onEdit ? [{ key: "edit", label: "Aramayı düzenle", description: "Neden, gün, not ya da öncelik", icon: Pencil, onSelect: () => onEdit(item) }] : []),
    ...(editable && item.followUpId ? [{ key: "cancel", label: "Aramayı iptal et", description: "Yanlış açılmış ya da gereksiz arama", icon: XCircle, danger: true, separatorBefore: Boolean(onEdit), onSelect: () => void cancelCall() }] : []),
  ];

  const context = item.labContext
    ? [`${item.labContext.receivedStep || "Prova"} geldi`, item.labContext.labType, item.labContext.labName].filter(Boolean).join(" · ")
    : item.appointmentStartAt && (item.type === "GELMEDI" || item.derived)
      ? `${item.type === "GELMEDI" ? "Kaçırdığı randevu" : "Randevu"}: ${formatDateText(item.appointmentStartAt, "datetime")}`
      : "";

  const description = [
    item.reasonLabel,
    item.doctorName,
    // Orta öncelik olağandır; yüksek ve düşük yazılır (önceki pencerede ikisi de rozetle görünüyordu).
    item.priority >= 3 ? "Yüksek öncelik" : item.priority <= 1 ? "Düşük öncelik" : null,
    !item.isOpen && item.closedAt ? `Kapandı ${formatDateText(item.closedAt)}` : null,
  ].filter(Boolean).join(" · ");

  const body = (
    <>
      {/* İletişim ve gezinme: tek satır */}
      <div className="flex flex-wrap items-center gap-2">
        {phone ? (
          <Button size="sm" variant="secondary" icon={Phone} href={`tel:${phoneDigitsForTel(phone, item.phoneCountryCode)}`} className="tabular-nums">
            {formatPhoneNumber(phone)}
          </Button>
        ) : (
          <span className="text-sm text-slate-400">{hidePhone ? "Telefonu görme yetkiniz yok" : "Kayıtlı telefon yok"}</span>
        )}
        {phone && canUseWhatsapp && (waHref ? (
          <Button size="sm" variant="secondary" icon={MessageCircle} href={waHref} target="_blank">WhatsApp</Button>
        ) : (
          // Hasta WhatsApp'ı kapattıysa bağlantı açılmaz (KVKK/izin); neden görünür yazılır.
          <Badge tone="neutral">WhatsApp kapalı (hasta istemedi)</Badge>
        ))}
        <span className="flex-1" />
        {canBookAppointments && (
          <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => void goToAppointment()}>Randevu ver</Button>
        )}
        {canOpenPatient && <Button size="sm" variant="ghost" icon={FolderOpen} href={routes.patient(item.patientId)}>Hasta dosyası</Button>}
        {menuItems.length > 0 && <ActionMenu items={menuItems} label="Diğer işlemler" />}
      </div>

      {visit?.nextAppointment && item.isOpen && (
        <Callout
          tone="success"
          compact
          title={`Randevusu var: ${formatDateText(visit.nextAppointment.startAt, "datetime")}${visit.nextAppointment.doctorName ? ` · ${visit.nextAppointment.doctorName}` : ""}`}
          action={canWrite ? <Button size="sm" variant="secondary" disabled={busy} onClick={closeWithAppointment}>Aramayı kapat</Button> : undefined}
        />
      )}

      {(context || item.noteText || (item.isOpen && item.dueAt) || otherOpenCount > 0 || showResolution) && (
        <div className="space-y-1 text-sm text-slate-700">
          {context && <p>{context}</p>}
          {item.noteText && <p className="whitespace-pre-line">{item.noteText}</p>}
          {item.isOpen && item.dueAt && !item.derived && (
            <p className="text-xs text-slate-500">Sonraki arama: <DueLabel at={item.dueAt} granularity="day" /></p>
          )}
          {showResolution && <p className="text-slate-600"><span className="font-semibold">Kapanış:</span> {item.resolutionNote}</p>}
          {otherOpenCount > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-amber-800">
              Bu hastanın {otherOpenCount} açık araması daha var.
              {onShowPatient && (
                <Button size="sm" variant="ghost" onClick={() => onShowPatient(item.patientName)}>Listede göster</Button>
              )}
            </p>
          )}
        </div>
      )}

      {editable && (
        <section aria-label="Görüşme kaydet" className="space-y-4 border-t border-slate-100 pt-4">
          <ChoiceCards
            label="Görüşmenin sonucu"
            variant="pills"
            options={OUTCOMES.map((option) => ({ value: option.key, label: option.label }))}
            value={outcome as OutcomeKey}
            onChange={chooseOutcome}
          />
          {selectedOutcome && !selectedOutcome.close && (
            <DateTimeQuickField
              label="Sonraki arama"
              required
              min="today"
              value={next}
              onChange={(value) => { setNext(value); setNextError(""); }}
              defaultTime={defaultCallTime}
              options={NEXT_CALL_DATES}
              error={nextError || undefined}
            />
          )}
          {selectedOutcome?.key === "RANDEVU" && !visit?.nextAppointment && canBookAppointments && (
            <p className="-mt-2 text-xs text-slate-500">Randevu henüz listede görünmüyor; önce “Randevu ver” ile kaydedin.</p>
          )}
          <FormField label="Not" htmlFor="followup-note">
            <Textarea id="followup-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2500} placeholder="Hasta ne dedi, ne konuşuldu?" />
          </FormField>
          <Disclosure title="Görüşme ayrıntısı" summary={`${channel} · ${occurredIsNow ? "şimdi" : formatDateText(localToIso(occurredAt), "datetime")}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Görüşme zamanı" htmlFor="followup-at">
                <Input id="followup-at" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} data-dirty-ignore />
              </FormField>
              <FormField label="Nasıl görüşüldü?" htmlFor="followup-channel">
                <Select id="followup-channel" value={channel} onChange={(event) => setChannel(event.target.value)} data-dirty-ignore>
                  {channelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </FormField>
            </div>
          </Disclosure>
        </section>
      )}

      {followUpId && (
        <section aria-labelledby="gorusme-gecmisi" className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id="gorusme-gecmisi" className="text-sm font-bold text-slate-900">Görüşme geçmişi</h3>
            {events.length > 0 && <Button size="sm" variant="ghost" icon={FileDown} onClick={() => void downloadHistory()}>PDF indir</Button>}
          </div>
          {eventsLoading ? (
            <ListRowSkeleton rows={2} variant="row" />
          ) : eventsError ? (
            <LoadErrorState compact message={eventsError} onRetry={() => void loadEvents(followUpId)} />
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500">Henüz kayıtlı görüşme yok.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                  {editingEvent?.id === event.id ? (
                    <div className="space-y-2">
                      <Input value={editingEvent.summary} onChange={(e) => setEditingEvent({ ...editingEvent, summary: e.target.value })} onKeyDown={onEditKeyDown} aria-label="Görüşme özeti" maxLength={300} data-dirty-ignore />
                      <Textarea value={editingEvent.detail} onChange={(e) => setEditingEvent({ ...editingEvent, detail: e.target.value })} aria-label="Ayrıntı" rows={2} maxLength={3000} data-dirty-ignore />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingEvent(null)}>Vazgeç</Button>
                        <Button size="sm" variant="secondary" loading={busy} onClick={() => void saveEventEdit()}>Düzeltmeyi kaydet</Button>
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
                          <IconButton size="sm" icon={XCircle} tone="danger" title="Görüşme kaydını geçersiz say" onClick={() => void voidEvent(event)} />
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
    </>
  );

  if (editable) {
    return (
      <FormModal
        open
        onClose={onClose}
        onSubmit={saveOutcome}
        submitting={busy}
        isDirty={dirty}
        error={error}
        title={item.patientName}
        description={description}
        module="follow"
        size="lg"
      >
        {body}
      </FormModal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      isDirty={Boolean(editingEvent)}
      title={item.patientName}
      description={description}
      module="follow"
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          {canWrite && !item.isOpen && item.followUpId && (
            <Button loading={busy} onClick={() => void reopen()}>Aramayı yeniden aç</Button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={error} />
        {body}
      </div>
    </Modal>
  );
}
