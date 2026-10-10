"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Section } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/PageSkeleton";
import { invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { APPOINTMENT_INTERVAL_OPTIONS } from "./settings-form";

/**
 * Randevu aralığı = takvimin saat adımı. Önceden "Randevu süresi —
 * varsayılan süre" diye anlatılıyordu ama aynı değer takvimde saatlerin
 * hangi aralıkla listeleneceğini de belirliyor (45 seçilirse 09:00, 09:45,
 * 10:30…). Serbest sayı 240'a kadar kabul ediliyor, takvim 120'de kesiyordu;
 * seçenekler artık takvimin kullanabildiği değerler. Seçim anında kaydedilir
 * (Klinik sekmesinin kaydet çubuğuna bağlı değil).
 */
export default function RandevuAraligi({ canWrite }: { canWrite: boolean }) {
  const [value, setValue] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    fetch("/api/settings?fields=randevu", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.message || "Randevu aralığı okunamadı.");
        setValue(Number(data.appointmentDuration) || 15);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Randevu aralığı okunamadı.");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const save = async (next: number) => {
    if (!canWrite || saving || next === value) return;
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentDuration: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Randevu aralığı kaydedilemedi.");
      // Takvim bu değeri önbellekten okur; yeni aralık hemen geçerli olsun.
      invalidateCachedGet("/api/appointments/calendar-settings");
      showToastSafe({ message: `Randevu aralığı ${next} dakika olarak kaydedildi.`, type: "success" });
    } catch (error) {
      setValue(previous);
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Eskiden kaydedilmiş, listede olmayan bir değer (ör. 25 ya da 180) de görünsün.
  const values: number[] = value !== null && !APPOINTMENT_INTERVAL_OPTIONS.some((option) => option === value)
    ? [...APPOINTMENT_INTERVAL_OPTIONS, value].sort((a, b) => a - b)
    : [...APPOINTMENT_INTERVAL_OPTIONS];

  return (
    <Section icon={CalendarClock} title="Randevu aralığı" description="Takvimde saatler bu aralıkla listelenir; yeni randevunun süresi olarak da önerilir.">
      {loadError ? (
        <LoadErrorState compact message={loadError} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : value === null ? (
        <div className="flex flex-wrap gap-2" aria-busy="true">
          {values.map((option) => <Skeleton key={option} className="h-9 w-16 rounded-full" />)}
        </div>
      ) : (
        <ChoiceCards
          label="Randevu aralığı"
          labelHidden
          variant="pills"
          value={String(value)}
          onChange={(next) => void save(Number(next))}
          options={values.map((option) => ({
            value: String(option),
            label: `${option} dk`,
            disabled: !canWrite || saving,
            disabledReason: !canWrite ? "Değişiklik için klinik yöneticisine başvurun." : undefined,
          }))}
          hint={value > 120 ? "Takvim en fazla 120 dakikalık aralık kullanır." : undefined}
        />
      )}
    </Section>
  );
}
