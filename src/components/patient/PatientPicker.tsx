"use client";

import { useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import { SearchSelect } from "@/components/ui/SearchSelect";

export type PickedPatient = {
  id: string;
  fullName: string;
  tcNo?: string | null;
  phone?: string | null;
};

type PatientPickerProps = {
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  placeholder?: string;
  /** Verilirse sonuç listesinin sonunda "Yeni hasta ekle" seçeneği çıkar; yazılan metin iletilir. */
  onCreateNew?: (query: string) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** Seçili hastayı değiştirmeye izin verilmesin (ör. hasta dosyasından açılan formlar). */
  locked?: boolean;
};

const NEW_OPTION_ID = "__new_patient__";

function patientMeta(patient: PickedPatient) {
  return [patient.tcNo ? `TC ${patient.tcNo}` : "", patient.phone || ""].filter(Boolean).join(" · ");
}

/**
 * Bütün formlarda TEK hasta seçici (randevu, lab işi, tahsilat, görev, takip,
 * tedavi planı...). En az 2 harf yazınca ad, TC veya telefona göre arar;
 * seçilen hasta, kim olduğu açıkça görünen bir kartta durur ve "Değiştir" ile
 * yeniden aranır. Önceden her ekran kendi arama kutusunu, gecikmesini ve
 * hata mesajını ayrı yazıyordu.
 */
export function PatientPicker({
  value,
  onChange,
  placeholder = "Hasta adı, TC veya telefon yazın…",
  onCreateNew,
  disabled,
  id,
  "aria-label": ariaLabel = "Hasta",
  "aria-describedby": ariaDescribedBy,
  locked = false,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients?q=${encodeURIComponent(term)}&take=10&summary=false`, { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Hasta araması yapılamadı.");
        if (controller.signal.aborted) return;
        setResults(Array.isArray(data?.patients) ? data.patients : []);
        setError("");
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(searchError instanceof Error ? searchError.message : "Hasta araması yapılamadı.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (value) {
    return (
      <div className="ui-picked-patient flex min-h-10 items-center gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2">
        <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{value.fullName}</p>
          {patientMeta(value) && <p className="truncate text-xs text-slate-500">{patientMeta(value)}</p>}
        </div>
        {!locked && !disabled && (
          <button
            type="button"
            onClick={() => { onChange(null); setQuery(""); }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-900"
            aria-label={`${value.fullName} seçimini kaldır ve başka hasta ara`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Değiştir
          </button>
        )}
      </div>
    );
  }

  const options = [
    ...results.map((patient) => ({ id: patient.id, label: patient.fullName, meta: patientMeta(patient) || undefined })),
    ...(onCreateNew && query.trim().length >= 2 && !loading
      ? [{ id: NEW_OPTION_ID, label: `+ Yeni hasta ekle: "${query.trim()}"`, meta: "Listede yoksa yeni kayıt açın" }]
      : []),
  ];

  return (
    <SearchSelect
      id={id}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      query={query}
      onQueryChange={setQuery}
      options={disabled ? [] : options}
      loading={loading}
      error={error || undefined}
      placeholder={placeholder}
      emptyText={query.trim().length < 2 ? "Aramak için en az 2 harf yazın" : "Bu bilgiyle kayıtlı hasta bulunamadı"}
      className="ui-control"
      onSelect={(option) => {
        if (option.id === NEW_OPTION_ID) {
          onCreateNew?.(query.trim());
          return;
        }
        const picked = results.find((patient) => patient.id === option.id);
        if (picked) onChange(picked);
      }}
    />
  );
}
