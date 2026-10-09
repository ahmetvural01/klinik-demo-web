"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { examStatusKind } from "@/lib/examination-status";
import { isValidDateKey, turkeyDateKey } from "@/lib/tz";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, parseMoneyInput, type Exam } from "./patient-file-shared";

type Form = { treatmentName: string; toothNo: string; amount: string; doctorId: string; date: string; note: string };

/**
 * Muayene / tedavi kaydını düzeltme penceresi. Önceden her satırın her hücresi
 * ayrı birer kutuydu; değişiklik ancak küçük bir 💾 simgesine basınca
 * kaydediliyor, unutulan değişiklik sessizce kayboluyordu.
 */
export function ExamEditModal({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const { reload, doctors } = usePatientFile();
  const [form, setForm] = useState<Form>({ treatmentName: "", toothNo: "", amount: "", doctorId: "", date: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exam) return;
    setForm({
      treatmentName: exam.treatmentName,
      toothNo: exam.toothNo || "",
      amount: String(Number(exam.amount || 0)),
      doctorId: exam.doctorId || "",
      date: turkeyDateKey(new Date(exam.diagnosedAt)),
      note: exam.note || "",
    });
    setErrors({});
    setError("");
  }, [exam]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const kind = exam ? examStatusKind(exam.status) : "pending";

  const save = async () => {
    if (!exam || saving) return;
    const amount = parseMoneyInput(form.amount);
    const next: Record<string, string> = {};
    if (form.treatmentName.trim().length < 2) next.treatmentName = "Tedavi adını yazın.";
    if (!Number.isFinite(amount) || amount < 0) next.amount = "Tutarı yazın (ücretsizse 0).";
    if (!form.doctorId) next.doctorId = "Hekimi seçin.";
    if (!isValidDateKey(form.date)) next.date = "Geçerli bir tarih seçin.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError("");
    try {
      const sameDay = turkeyDateKey(new Date(exam.diagnosedAt)) === form.date;
      const response = await fetch(`/api/examinations/${exam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: exam.status,
          treatmentName: form.treatmentName.trim(),
          toothNo: form.toothNo.trim(),
          amount,
          doctorId: form.doctorId,
          // Gün değişmediyse saat de korunur; aksi halde hakediş dönemi
          // kontrolü gereksiz yere "tarih değişti" sayardı.
          diagnosedAt: sameDay ? exam.diagnosedAt : new Date(`${form.date}T12:00:00.000Z`).toISOString(),
          note: form.note.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Kayıt güncellenemedi."));
      showToastSafe({ type: "success", icon: "tedavi", message: "Kayıt güncellendi." });
      onClose();
      void reload(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kayıt güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(exam)}
      onClose={() => { if (!saving) onClose(); }}
      module="tedavi"
      title={kind === "pending" ? "Muayene kaydını düzenle" : "Tedavi kaydını düzenle"}
      description={kind === "pending" ? "Muayene listesinde — henüz borca yansımadı." : "Yapıldı — tutarı hastanın borcunda ve hekim hakedişinde."}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <FormErrorBanner message={error} />
        <FormField label="Tedavi" htmlFor="hd-exam-edit-name" required error={errors.treatmentName}>
          <Input id="hd-exam-edit-name" maxLength={180} value={form.treatmentName} onChange={(event) => set("treatmentName", event.target.value)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Diş" htmlFor="hd-exam-edit-tooth" hint="Diş no veya çene (boş: genel).">
            <Input id="hd-exam-edit-tooth" maxLength={120} value={form.toothNo} onChange={(event) => set("toothNo", event.target.value)} />
          </FormField>
          <FormField label="Tutar (₺)" htmlFor="hd-exam-edit-amount" required error={errors.amount}>
            <Input id="hd-exam-edit-amount" inputMode="decimal" value={form.amount} onChange={(event) => set("amount", event.target.value)} />
          </FormField>
          <FormField label="Hekim" htmlFor="hd-exam-edit-doctor" required error={errors.doctorId}>
            <DoctorSelect id="hd-exam-edit-doctor" value={form.doctorId} doctors={doctors} onChange={(id) => set("doctorId", id)} />
          </FormField>
          <FormField label={kind === "pending" ? "Muayene tarihi" : "Tedavi tarihi"} htmlFor="hd-exam-edit-date" required error={errors.date}>
            <Input id="hd-exam-edit-date" type="date" max={turkeyDateKey()} value={form.date} onChange={(event) => set("date", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Klinik not" htmlFor="hd-exam-edit-note">
          <Textarea id="hd-exam-edit-note" rows={2} maxLength={1000} value={form.note} onChange={(event) => set("note", event.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}
