"use client";

import { useEffect, useState } from "react";
import { cachedGet } from "@/lib/client-cache";
import { selectDoctors, type StaffLike } from "@/lib/staff-roles";
import { Select } from "@/components/ui/Input";

type DoctorSelectProps = {
  value: string;
  onChange: (doctorId: string, doctor: StaffLike | null) => void;
  /** Boş seçenek metni; verilmezse boş seçenek gösterilmez (zorunlu seçim). */
  emptyLabel?: string;
  /** Liste dışarıdan zaten yüklendiyse tekrar istek atılmaz. */
  doctors?: StaffLike[];
  disabled?: boolean;
  required?: boolean;
  id?: string;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

/**
 * Bütün ekranlarda aynı hekim listesi (bkz. src/lib/staff-roles.ts) ve aynı
 * görünüm. Liste 60 sn önbellekten gelir; şube değişince önbellek sıfırlanır.
 */
export function DoctorSelect({
  value,
  onChange,
  emptyLabel,
  doctors: providedDoctors,
  disabled,
  required,
  id,
  size = "md",
  className = "",
  "aria-label": ariaLabel = "Doktor",
}: DoctorSelectProps) {
  const [loadedDoctors, setLoadedDoctors] = useState<StaffLike[]>([]);
  const [loading, setLoading] = useState(!providedDoctors);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Varsayılan /api/staff yanıtı TC ve fotoğraf taşımaz (yalnız ad, rol, mesai).
  useEffect(() => {
    if (providedDoctors) return;
    let active = true;
    setLoading(true);
    cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true, force: retryKey > 0 })
      .then((staff) => { if (active) { setLoadedDoctors(selectDoctors(staff)); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providedDoctors, retryKey]);

  const doctors = providedDoctors ? selectDoctors(providedDoctors) : loadedDoctors;

  return (
    <Select
      id={id}
      size={size}
      value={value}
      required={required}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      // Liste yüklenemediyse (geçici ağ hatası) kutuya dokununca yeniden denenir;
      // önceden sayfa yenilenene kadar "yüklenemedi" olarak kalıyordu.
      onFocus={failed ? () => setRetryKey((key) => key + 1) : undefined}
      onChange={(event) => onChange(event.target.value, doctors.find((doctor) => doctor.id === event.target.value) || null)}
      className={className}
    >
      {loading ? (
        <option value={value}>Doktorlar yükleniyor…</option>
      ) : failed ? (
        <option value="">Doktor listesi yüklenemedi — yeniden denemek için dokunun</option>
      ) : (
        <>
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {emptyLabel === undefined && !value && <option value="" disabled>Hekim seçin</option>}
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>
          ))}
        </>
      )}
    </Select>
  );
}
