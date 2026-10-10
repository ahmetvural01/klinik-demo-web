"use client";

import { useEffect, useId, useState } from "react";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input } from "@/components/ui/Input";

const REASONS = [
  { value: "mukerrer", label: "Mükerrer kayıt" },
  { value: "talep", label: "Hasta talebi (KVKK)" },
  { value: "baska-klinik", label: "Başka klinikte devam ediyor" },
  { value: "vefat", label: "Vefat" },
  { value: "diger", label: "Diğer" },
] as const;

type ReasonKey = (typeof REASONS)[number]["value"] | "";

type ArchivePatientModalProps = {
  /** Arşivlenecek hasta; null iken pencere kapalı. */
  patient: { id: string; fullName: string } | null;
  onClose: () => void;
  onArchived: (patient: { id: string; fullName: string }) => void;
};

/**
 * Gerekçeli arşivleme. Önceden onay penceresi gerekçe sormuyordu; API
 * `x-archive-reason` başlığını okuyup denetim kaydına yazabildiği hâlde her
 * kayıtta "Kullanıcı talebiyle hasta kartı arşivlendi." görünüyordu
 * (denetim A2). Arşivleme silme değildir: geçmiş korunur, ileri tarihli
 * randevular iptal edilir.
 */
export function ArchivePatientModal({ patient, onClose, onArchived }: ArchivePatientModalProps) {
  const noteId = useId();
  const [reason, setReason] = useState<ReasonKey>("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    setReason("");
    setNote("");
    setTried(false);
    setError(null);
  }, [patient]);

  const reasonError = tried && !reason ? "Gerekçe seçin." : undefined;
  const noteError = tried && reason === "diger" && !note.trim() ? "Kısa bir açıklama yazın." : undefined;

  const submit = async () => {
    setTried(true);
    if (!patient || !reason || (reason === "diger" && !note.trim())) return;
    setSaving(true);
    setError(null);
    const label = REASONS.find((item) => item.value === reason)?.label || "Diğer";
    const text = note.trim() ? `${label}: ${note.trim()}` : label;
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}`, {
        method: "DELETE",
        // Başlıkta Türkçe harf taşınamaz; sunucu URI kodunu çözer.
        headers: { "x-archive-reason": encodeURIComponent(text.slice(0, 450)) },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Hasta arşivlenemedi.");
      onArchived(patient);
      onClose();
    } catch (archiveError) {
      setError(archiveError instanceof Error && archiveError.message !== "Failed to fetch"
        ? archiveError.message
        : "Bağlantı kurulamadı; tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={Boolean(patient)}
      onClose={onClose}
      title="Hastayı arşivle"
      description={patient?.fullName}
      module="users"
      size="md"
      onSubmit={() => submit()}
      submitting={saving}
      submitLabel="Arşivle"
      submitVariant="danger"
      error={error}
      isDirty={Boolean(reason || note)}
    >
      <Callout tone="warning" compact>
        Hasta aktif listeden kalkar ve ileri tarihli randevuları iptal edilir. Tedavi, tahsilat ve kayıt geçmişi korunur.
      </Callout>
      <ChoiceCards
        label="Gerekçe"
        required
        variant="pills"
        value={reason}
        onChange={(value) => setReason(value)}
        options={REASONS.map((item) => ({ value: item.value as ReasonKey, label: item.label }))}
        error={reasonError}
      />
      <FormField label="Açıklama" htmlFor={noteId} required={reason === "diger"} error={noteError}>
        <Input id={noteId} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder={reason === "diger" ? "Arşivleme nedeni" : "İsteğe bağlı"} />
      </FormField>
    </FormModal>
  );
}
