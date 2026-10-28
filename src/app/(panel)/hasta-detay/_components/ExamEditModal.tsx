"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { examStatusKind } from "@/lib/examination-status";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { isValidDateKey, turkeyDateKey } from "@/lib/tz";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, type Exam } from "./patient-file-shared";

type Form = { treatmentName: string; toothNo: string; amount: string; doctorId: string; date: string; note: string };

/**
 * Planlanan / yapılan tedavi kaydını düzeltme penceresi (tek kayıt). Tutar
 * ortak tutar alanıyla girilir: "3.500" 3.500 TL'dir (önceden yerel
 * ayrıştırıcı virgülsüz noktayı ondalık sayıyordu).
 */
export function ExamEditModal({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const { reload, doctors, lockDoctorToSelf } = usePatientFile();
  const [form, setForm] = useState<Form>({ treatmentName: "", toothNo: "", amount: "", doctorId: "", date: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exam) return;
    setForm({
      treatmentName: exam.treatmentName,
      toothNo: exam.toothNo || "",
      amount: toMoneyValue(exam.amount) ?? "",
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
    const next: Record<string, string> = {};
    if (form.treatmentName.trim().length < 2) next.treatmentName = "Tedavi adını yazın.";
    const amountError = moneyInputError(form.amount, { required: true, allowZero: true });
    if (amountError) next.amount = amountError === "Tutarı girin." ? "Tutarı yazın (ücretsizse 0)." : amountError;
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
          amount: form.amount,
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
    <FormModal
      open={Boolean(exam)}
      onClose={onClose}
      module="tedavi"
      title={kind === "pending" ? "Planlanan tedaviyi düzenle" : "Yapılan tedaviyi düzenle"}
      description={kind === "pending" ? "Henüz borca yansımadı." : "Tutarı hastanın borcunda ve hekim hakedişinde."}
      size="md"
      onSubmit={save}
      submitting={saving}
      error={error}
    >
      <FormField label="Tedavi" htmlFor="hd-exam-edit-name" required error={errors.treatmentName}>
        <Input id="hd-exam-edit-name" maxLength={180} value={form.treatmentName} onChange={(event) => set("treatmentName", event.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tutar" htmlFor="hd-exam-edit-amount" required error={errors.amount}>
          <MoneyInput id="hd-exam-edit-amount" value={form.amount} onChange={(value) => set("amount", value)} />
        </FormField>
        <FormField label="Diş" htmlFor="hd-exam-edit-tooth" hint="Diş no ya da çene; boş: genel.">
          <Input id="hd-exam-edit-tooth" maxLength={120} value={form.toothNo} onChange={(event) => set("toothNo", event.target.value)} />
        </FormField>
        <FormField label="Hekim" htmlFor="hd-exam-edit-doctor" required error={errors.doctorId}>
          {/* Doktor kaydı başka hekime aktaramaz (sunucu kuralı): hekim salt okunur. */}
          {lockDoctorToSelf
            ? <Input id="hd-exam-edit-doctor" readOnly value={exam?.doctor?.fullName || doctors.find((doctor) => doctor.id === form.doctorId)?.fullName || ""} />
            : <DoctorSelect id="hd-exam-edit-doctor" value={form.doctorId} doctors={doctors} onChange={(id) => set("doctorId", id)} />}
        </FormField>
        <FormField label={kind === "pending" ? "Muayene tarihi" : "Tedavi tarihi"} htmlFor="hd-exam-edit-date" required error={errors.date}>
          <Input id="hd-exam-edit-date" type="date" max={turkeyDateKey()} value={form.date} onChange={(event) => set("date", event.target.value)} />
        </FormField>
      </div>
      <FormField label="Klinik not" htmlFor="hd-exam-edit-note">
        <Textarea id="hd-exam-edit-note" rows={2} maxLength={1000} value={form.note} onChange={(event) => set("note", event.target.value)} />
      </FormField>
    </FormModal>
  );
}
