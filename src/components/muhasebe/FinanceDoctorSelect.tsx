"use client";

import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { useFinanceDoctors } from "@/components/muhasebe/useFinanceDoctors";

type Props = {
  value: string;
  onChange: (doctorId: string) => void;
  emptyLabel?: string;
  id?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/**
 * Muhasebe formlarının doktor seçicisi: ortak DoctorSelect görünümü, listesi
 * muhasebe yetkisiyle de okunabilen uçtan gelir (bkz. useFinanceDoctors).
 */
export function FinanceDoctorSelect({ value, onChange, emptyLabel, id, size, className, disabled, "aria-label": ariaLabel = "Doktor" }: Props) {
  const { doctors, loaded, error } = useFinanceDoctors();
  return (
    <>
      <DoctorSelect
        id={id}
        value={value}
        onChange={(doctorId) => onChange(doctorId)}
        emptyLabel={emptyLabel}
        doctors={doctors}
        size={size}
        className={className}
        disabled={disabled || !loaded}
        aria-label={ariaLabel}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </>
  );
}
