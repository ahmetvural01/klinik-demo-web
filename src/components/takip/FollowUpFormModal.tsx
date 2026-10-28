"use client";

import { useEffect, useRef, useState } from "react";
import { cachedGet } from "@/lib/client-cache";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Select, Textarea } from "@/components/ui/Input";
import { DEFAULT_QUICK_DATES, addDaysToDateKey } from "@/components/ui/QuickDatePicker";
import { turkeyDateKey } from "@/lib/tz";
import { openDayKeys } from "@/components/randevu/appointment-utils";
import type { DaySchedule } from "@/lib/working-hours-core";
import { PRIORITY_LABELS, PRIORITY_OPTIONS, toPriority, type Priority } from "./takip-labels";
import { DateTimeQuickField } from "./DateTimeQuickField";
import { createFollowUp, updateFollowUp } from "./follow-up-actions";
import {
  LAB_PROVA_LABEL,
  PRESET_REASONS,
  buildNote,
  collectReasonOptions,
  labTechnicalLines,
  resolveReason,
  type ApiFollowUp,
  type FollowItem,
} from "./follow-up-model";
import { defaultCallTime, loadClinicSchedules, openDateKeyFromToday, partsToIso, splitIsoToParts, type DateTimeParts } from "./takip-utils";

type Props = {
  onClose: () => void;
  onSaved: (followUp: ApiFollowUp, mode: "create" | "edit") => void;
  /** Yeni aramada önceden seçili hasta (hasta dosyasından ya da derin bağlantıdan). */
  initialPatient?: PickedPatient | null;
  /** Yeni aramada önceden dolu not (ör. görev formundan "Hasta araması olarak aç"). */
  initialNote?: string;
  /** Verilirse kayıtlı arama düzenlenir (hasta değişmez). */
  item?: FollowItem | null;
  /** Düzenlenen aramanın API kaydı (lab notunun teknik satırlarını korumak için). */
  followUp?: ApiFollowUp | null;
  /** Neden seçenekleri; verilmezse kurumun kayıtlı nedenleri yüklenir. */
  reasonOptions?: string[];
  /** Hastanın açık aramaları: aynı iş için ikinci kayıt açılmasın diye uyarı. */
  openItemsForPatient?: (patientId: string) => FollowItem[];
  onOpenExisting?: (item: FollowItem) => void;
};

type FormState = {
  patient: PickedPatient | null;
  reason: string;
  doctorId: string;
  priority: Priority;
  next: DateTimeParts;
  note: string;
};

const CALL_DATES = DEFAULT_QUICK_DATES;
const FALLBACK_REASONS = [...PRESET_REASONS, "Diğer"];

function initialState(item: FollowItem | null | undefined, initialPatient: PickedPatient | null | undefined, initialNote: string | undefined): FormState {
  if (item) {
    return {
      patient: { id: item.patientId, fullName: item.patientName },
      reason: item.labContext ? LAB_PROVA_LABEL : item.customType || item.reasonLabel,
      doctorId: item.doctorId || "",
      priority: toPriority(item.priority),
      next: splitIsoToParts(item.nextActionAt),
      note: item.noteText,
    };
  }
  // Varsayılan: yarın, mesai başı (önceden "yarın 00:00" geliyordu — canlı test H3).
  const date = addDaysToDateKey(turkeyDateKey(), 1);
  return {
    patient: initialPatient || null,
    reason: "Tekrar aranacak",
    doctorId: "",
    priority: 2,
    next: { date, time: date ? defaultCallTime(date) : "" },
    note: initialNote || "",
  };
}

/**
 * Yeni hasta araması ve kayıtlı aramayı düzenleme için TEK form (Bekleyen işler
 * > Hasta aramaları; hasta dosyası da kullanabilir). Zorunlu yalnız hasta;
 * gün "Yarın 10:00" önerilir, doktor ve öncelik "Doktor ve öncelik" altında.
 * Düzenlemede yanlış girilen neden/gün/not sahte bir görüşme kaydı yazmadan
 * düzeltilir (önceden düzenleme yoktu — denetim §3.2 sorun 7, canlı K7).
 * "Değişti mi" karşılaştırması açılış anındaki değerlerle yapılır (HL-24).
 */
export function FollowUpFormModal({ onClose, onSaved, initialPatient, initialNote, item, followUp, reasonOptions, openItemsForPatient, onOpenExisting }: Props) {
  const isEdit = Boolean(item?.followUpId);
  const isLab = Boolean(item?.labContext);
  const [form, setForm] = useState<FormState>(() => initialState(item, initialPatient, initialNote));
  const snapshot = useRef(JSON.stringify(form));
  const initialDateRef = useRef(form.next.date);

  // Yeni aramada önerilen gün (yarın) kurumun kapalı gününe (ör. Pazar) düşüyorsa
  // ilk açık güne kaydırılır. Kullanıcı günü değiştirdiyse dokunulmaz; öneri
  // değişikliği "kaydedilmemiş değişiklik" sayılmaz.
  // Kurumun çalışma takvimi: kapalı güne (ör. "Yarın" kısayolu Pazar'a denk
  // gelince) seçilen aramada uyarı göstermek için de kullanılır.
  const [schedules, setSchedules] = useState<DaySchedule[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadClinicSchedules().then((loaded) => {
      if (alive) setSchedules(loaded);
    });
    return () => { alive = false; };
  }, []);
  const closedDaySelected = Boolean(schedules && form.next.date && openDayKeys(schedules, form.next.date, 1)[0] !== form.next.date);

  useEffect(() => {
    if (isEdit) return;
    let alive = true;
    void loadClinicSchedules().then((schedules) => {
      if (!alive || !schedules) return;
      // Önerilen gün ve "temiz form" anı güncelleyici çalışmadan önce yakalanır:
      // React güncelleyiciyi sonraki çizime erteleyebilir (önbellekten iki yanıt
      // aynı anda gelince); o zaman ref zaten yeni günü gösterip kaydırma atlanıyordu.
      const proposed = initialDateRef.current;
      const baseline = snapshot.current;
      const openDate = openDateKeyFromToday(1, schedules);
      if (!openDate || openDate === proposed) return;
      initialDateRef.current = openDate;
      setForm((current) => {
        if (current.next.date !== proposed) return current;
        // Kullanıcının seçtiği saat korunur; yalnız gün kayar.
        const next = { ...current, next: { date: openDate, time: current.next.time || defaultCallTime(openDate) } };
        if (JSON.stringify(current) === baseline) snapshot.current = JSON.stringify(next);
        return next;
      });
    });
    return () => { alive = false; };
  }, [isEdit]);
  const [loadedReasons, setLoadedReasons] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [patientError, setPatientError] = useState("");
  const [dateError, setDateError] = useState("");
  // Doktor listesi (personel isteği) yalnız bölüm açılınca yüklenir.
  const [othersOpen, setOthersOpen] = useState(false);

  // Neden listesi verilmediyse (ör. hasta dosyasından açıldıysa) kurumun kayıtlı nedenleri bir kez okunur.
  useEffect(() => {
    if (reasonOptions) return;
    let active = true;
    cachedGet<{ types?: unknown }>("/api/patient-follow-up-types", 60_000)
      .then((body) => {
        if (!active) return;
        const types = Array.isArray(body?.types) ? body.types.filter((value): value is string => typeof value === "string") : [];
        setLoadedReasons(collectReasonOptions(types, []));
      })
      .catch(() => { if (active) setLoadedReasons(collectReasonOptions([], [])); });
    return () => { active = false; };
  }, [reasonOptions]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const baseReasons = reasonOptions || loadedReasons || FALLBACK_REASONS;
  // Düzenlenen aramanın nedeni listede yoksa (ör. sonradan kaldırılmış özel neden) yine seçili görünür.
  const sameReason = (a: string, b: string) => a.toLocaleLowerCase("tr-TR") === b.toLocaleLowerCase("tr-TR");
  const matchedReason = baseReasons.find((reason) => sameReason(reason, form.reason));
  const reasons = form.reason && !matchedReason ? [form.reason, ...baseReasons] : baseReasons;
  // Büyük/küçük harfi farklı kayıtlı neden ("Kontrol Araması") listedeki karşılığıyla seçili görünür.
  const reasonValue = matchedReason || form.reason;
  const existing = !isEdit && form.patient && openItemsForPatient ? openItemsForPatient(form.patient.id) : [];
  const dirty = JSON.stringify(form) !== snapshot.current;

  const save = async () => {
    setError("");
    if (!form.patient) {
      setPatientError("Aranacak hastayı seçin.");
      return;
    }
    setPatientError("");
    if (form.next.date && !/^\d{2}:\d{2}$/.test(form.next.time)) {
      setDateError("Saati girin ya da günü kaldırın.");
      return;
    }
    setDateError("");
    const nextActionAt = partsToIso(form.next);
    try {
      if (isEdit && item?.followUpId) {
        const body: Parameters<typeof updateFollowUp>[1] = { priority: form.priority, nextActionAt };
        if (isLab) {
          // Lab aramasında neden kilitli; iş/prova etiket satırları korunur, yalnız kullanıcı notu değişir.
          const technical = followUp ? labTechnicalLines(followUp) : [];
          body.note = [...technical, form.note.trim()].filter(Boolean).join("\n");
        } else {
          const resolved = resolveReason(form.reason);
          body.type = resolved.apiType;
          body.note = buildNote(resolved.customLabel, form.note);
        }
        onSaved(await updateFollowUp(item.followUpId, body), "edit");
        return;
      }
      const resolved = resolveReason(form.reason);
      const note = buildNote(resolved.customLabel, form.note);
      const created = await createFollowUp({
        patientId: form.patient.id,
        doctorId: form.doctorId || undefined,
        type: resolved.apiType,
        priority: form.priority,
        note: note || undefined,
        nextActionAt: nextActionAt || undefined,
      });
      onSaved(created, "create");
    } catch (saveError) {
      // Hata pencerenin içinde gösterilir; yazılanlar korunur (HL-V03).
      setError(saveError instanceof Error ? saveError.message : "Arama kaydedilemedi.");
    }
  };

  const otherSummary = [
    isEdit ? item?.doctorName || "Doktor yok" : form.doctorId ? "Doktor seçildi" : "Doktor seçilmedi",
    `${PRIORITY_LABELS[form.priority]} öncelik`,
  ].join(" · ");

  return (
    <FormModal
      open
      onClose={onClose}
      onSubmit={save}
      isDirty={dirty}
      error={error}
      title={isEdit ? "Aramayı düzenle" : "Yeni arama"}
      description={isEdit ? item?.patientName : undefined}
      module="follow"
      size="lg"
    >
      {!isEdit && (
        <FormField label="Hasta" required error={patientError} as="div">
          <PatientPicker required value={form.patient} onChange={(patient) => { set("patient", patient); setPatientError(""); }} />
        </FormField>
      )}

      {existing.length > 0 && (
        <Callout
          tone="warning"
          compact
          title={`Bu hastanın açık araması var: ${existing.slice(0, 2).map((open) => open.reasonLabel).join(", ")}`}
          action={onOpenExisting ? <Button size="sm" variant="secondary" onClick={() => onOpenExisting(existing[0])}>Bu aramayı aç</Button> : undefined}
        />
      )}

      <FormField label="Neden aranacak?" htmlFor="followup-reason">
        <Select id="followup-reason" value={reasonValue} onChange={(event) => set("reason", event.target.value)} disabled={isLab}>
          {(isLab ? [LAB_PROVA_LABEL] : reasons).map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </Select>
      </FormField>

      <DateTimeQuickField
        label="Ne zaman aranacak?"
        value={form.next}
        onChange={(next) => { set("next", next); setDateError(""); }}
        defaultTime={defaultCallTime}
        options={CALL_DATES}
        min={isEdit ? undefined : "today"}
        error={dateError || undefined}
        hint={!form.next.date
          ? "Gün seçilmezse bugün aranacaklarda “Hemen ara” olarak görünür."
          : closedDaySelected ? "Klinik bu gün kapalı. Yine de kaydedilebilir; açık bir gün seçmek isteyebilirsiniz." : undefined}
      />

      <FormField label="Not" htmlFor="followup-note">
        <Textarea id="followup-note" value={form.note} onChange={(event) => set("note", event.target.value)} rows={2} maxLength={1800} placeholder="Ne konuşulacak?" />
      </FormField>

      <Disclosure title="Doktor ve öncelik" summary={otherSummary} open={othersOpen} onOpenChange={setOthersOpen}>
        <div className="grid gap-4 sm:grid-cols-2">
          {isEdit ? (
            <FormField label="Doktor" as="div" hint="Aramanın doktoru buradan değiştirilemez.">
              <p className="flex h-10 items-center text-sm text-slate-700">{item?.doctorName || "—"}</p>
            </FormField>
          ) : (
            <FormField label="Doktor" htmlFor="followup-doctor">
              {othersOpen
                ? <DoctorSelect id="followup-doctor" value={form.doctorId} onChange={(id) => set("doctorId", id)} emptyLabel="Seçilmedi" />
                : <span />}
            </FormField>
          )}
          <ChoiceCards
            label="Öncelik"
            variant="pills"
            options={PRIORITY_OPTIONS}
            value={String(form.priority) as "1" | "2" | "3"}
            onChange={(value) => set("priority", toPriority(value))}
          />
        </div>
      </Disclosure>
    </FormModal>
  );
}
