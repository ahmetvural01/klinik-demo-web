"use client";

import { useRef, useState } from "react";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PRIORITY_LABELS, type Priority } from "@/components/takip/takip-labels";
import { PRESET_REASONS, buildNote, resolveReason, type ApiFollowUp, type FollowItem } from "./follow-up-model";

function tomorrowLocal() {
  const date = new Date(Date.now() + 86_400_000);
  date.setMinutes(0, 0, 0);
  return turkeyDateTimeLocalValue(date);
}

type Props = {
  onClose: () => void;
  onCreated: (followUp: ApiFollowUp, customLabel: string) => void;
  initialPatient?: PickedPatient | null;
  /** Kurumun kaydettiği özel nedenler (Ayarlar'dan / önceki kayıtlardan). */
  customReasons: string[];
  /** Hastanın mevcut açık takipleri: aynı iş için ikinci kayıt açılmasın diye uyarı. */
  openItemsForPatient: (patientId: string) => FollowItem[];
  onOpenExisting: (item: FollowItem) => void;
};

type FormState = {
  patient: PickedPatient | null;
  reason: string;
  doctorId: string;
  priority: Priority;
  nextActionAt: string;
  note: string;
};

/**
 * Yeni takip formu. Çağıran yalnız açıkken çizer; "değişti mi" karşılaştırması
 * açılış anındaki değerlerle yapılır (önceden saat ilerledikçe boş form da
 * "değişmiş" sayılıyordu — denetim HL-24).
 */
export function FollowUpCreateModal({ onClose, onCreated, initialPatient, customReasons, openItemsForPatient, onOpenExisting }: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    patient: initialPatient || null,
    reason: "Tekrar aranacak",
    doctorId: "",
    priority: 2,
    nextActionAt: tomorrowLocal(),
    note: "",
  }));
  const snapshot = useRef(JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patientError, setPatientError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const reasons = Array.from(new Set<string>([...PRESET_REASONS, ...customReasons, "Diğer"]));
  const existing = form.patient ? openItemsForPatient(form.patient.id) : [];

  const save = async () => {
    setError("");
    if (!form.patient) {
      setPatientError("Takip açılacak hastayı seçin.");
      return;
    }
    setPatientError("");
    const resolved = resolveReason(form.reason);
    const note = buildNote(resolved.customLabel, form.note);
    setSaving(true);
    try {
      const response = await fetch("/api/patient-follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.patient.id,
          doctorId: form.doctorId || undefined,
          type: resolved.apiType,
          priority: form.priority,
          note: note || undefined,
          nextActionAt: form.nextActionAt
            ? turkeyLocalDateTimeToUtc(form.nextActionAt.slice(0, 10), form.nextActionAt.slice(11, 16)).toISOString()
            : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Takip açılamadı.");
      onCreated(data as ApiFollowUp, resolved.customLabel);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Takip açılamadı.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      isDirty={JSON.stringify(form) !== snapshot.current}
      title="Yeni takip"
      description="Aranacak ya da dönüşü beklenen hastayı listeye ekleyin."
      module="follow"
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={error} />
        <FormField label="Hasta" required error={patientError}>
          <PatientPicker value={form.patient} onChange={(patient) => { set("patient", patient); setPatientError(""); }} />
        </FormField>

        {existing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">Bu hastanın açık takibi var:</p>
            <ul className="mt-1 space-y-1">
              {existing.slice(0, 3).map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{item.reasonLabel}{item.noteText ? ` — ${item.noteText.slice(0, 60)}` : ""}</span>
                  <Button size="sm" variant="secondary" onClick={() => onOpenExisting(item)}>Bu takibe görüşme ekle</Button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-800">Farklı bir iş için yine de yeni takip açabilirsiniz.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Neden aranacak?" htmlFor="followup-reason">
            <Select id="followup-reason" value={form.reason} onChange={(event) => set("reason", event.target.value)}>
              {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </Select>
          </FormField>
          <FormField label="Sonraki arama" htmlFor="followup-create-next" hint="Bu tarihte 'Bugün' listesine düşer.">
            <Input id="followup-create-next" type="datetime-local" value={form.nextActionAt} onChange={(event) => set("nextActionAt", event.target.value)} />
          </FormField>
          <FormField label="Doktor" htmlFor="followup-doctor">
            <DoctorSelect id="followup-doctor" value={form.doctorId} onChange={(id) => set("doctorId", id)} emptyLabel="Seçilmedi" />
          </FormField>
          <FormField label="Öncelik" htmlFor="followup-priority">
            <Select id="followup-priority" value={form.priority} onChange={(event) => set("priority", Number(event.target.value) as Priority)}>
              {([1, 2, 3] as Priority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="Not" htmlFor="followup-create-note" hint="İsteğe bağlı: ne konuşulacak?">
          <Textarea id="followup-create-note" value={form.note} onChange={(event) => set("note", event.target.value)} rows={2} maxLength={1800} />
        </FormField>
      </div>
    </Modal>
  );
}
