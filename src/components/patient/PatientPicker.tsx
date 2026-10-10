"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { foldTurkish, formatPatientPhone, maskedIdentityLabel, patientAge } from "@/lib/patient-display";

export type PickedPatient = {
  id: string;
  fullName: string;
  tcNo?: string | null;
  phone?: string | null;
  /** İsteğe bağlı: aynı adlı iki hastayı ayırt etmek için yaş ve ülke kodlu telefon gösterilir. */
  birthDate?: string | null;
  phoneCountryCode?: string | null;
  isForeigner?: boolean | null;
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
  /**
   * "finance": finans formlarının araması (tahsilat, taksit planı). Hasta
   * listesini göremeyen muhasebe rolü de hasta seçebilir; sunucu yalnız ad,
   * telefon ve TC'nin son 4 hanesini döndürür (sağlık verisi yok).
   */
  scope?: "patients" | "finance";
  /**
   * Zorunlu alan: arama kutusu ekran okuyucuya "zorunlu" olarak bildirilir.
   * (FormField as="div" etiketindeki "(zorunlu)" bu kutuya ulaşmaz; kutunun
   * adı aria-label'dan gelir.)
   */
  required?: boolean;
};

const NEW_OPTION_ID = "__new_patient__";

/** "41 yaş · TC ••••8950 · (0532) 123-4567" — maskeli ("***") değerler yazılmaz. */
function patientMeta(patient: PickedPatient) {
  const age = patientAge(patient.birthDate);
  return [
    age !== null ? `${age} yaş` : "",
    maskedIdentityLabel(patient),
    formatPatientPhone(patient.phone, patient.phoneCountryCode),
  ].filter(Boolean).join(" · ");
}

/** Adı aranan sözcükle başlayan hasta üstte; API sonuçları "son eklenen" sırasıyla gelir. */
function rankByQuery(results: PickedPatient[], term: string) {
  const folded = foldTurkish(term.trim());
  if (!folded) return results;
  const rank = (patient: PickedPatient) => {
    const name = foldTurkish(patient.fullName);
    if (name === folded) return 0;
    if (name.startsWith(folded)) return 1;
    if (name.split(/\s+/).some((part) => part.startsWith(folded))) return 2;
    return 3;
  };
  return results
    .map((patient, index) => ({ patient, index, rank: rank(patient) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.patient);
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
  scope = "patients",
  required = false,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // "Tekrar dene": aynı arama yeniden yapılır (sayaç etkiyi yeniden çalıştırır).
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    // Yazarken her tuşta istek atılmaz (250 ms); yeni yazı eski isteği iptal
    // eder, böylece ekrana yalnız SON aramanın sonucu düşer.
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const url = scope === "finance"
          ? `/api/patients?mode=finans&q=${encodeURIComponent(term)}&take=10`
          : `/api/patients?q=${encodeURIComponent(term)}&take=10&summary=false`;
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Hasta araması yapılamadı.");
        if (controller.signal.aborted) return;
        setResults(rankByQuery(Array.isArray(data?.patients) ? data.patients : [], term));
        setError("");
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(searchError instanceof Error && searchError.message !== "Failed to fetch" ? searchError.message : "Hasta araması yapılamadı. Bağlantınızı kontrol edin.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope, retryKey]);

  if (value) {
    const meta = patientMeta(value);
    return (
      <div className="ui-picked-patient flex min-h-10 items-center gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-1.5">
        <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {/* <output>: seçici bir <label> içine konduğunda etiketin bağlandığı
            ilk öğe bu olur. Önceden "Değiştir" düğmesiydi; "Hasta" etiketine,
            ipucuna ya da hastanın adına tıklamak seçimi siliyordu (denetim E1). */}
        <output id={id} aria-describedby={ariaDescribedBy} className="block min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{value.fullName}</span>
          {meta && <span className="block truncate text-xs text-slate-500">{meta}</span>}
        </output>
        {!locked && !disabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onChange(null); setQuery(""); }}
            aria-label={`${value.fullName} yerine başka hasta seç`}
            className="shrink-0"
          >
            Değiştir
          </Button>
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
      aria-required={required}
      query={query}
      onQueryChange={setQuery}
      options={disabled ? [] : options}
      loading={loading}
      error={error || undefined}
      onRetry={() => setRetryKey((key) => key + 1)}
      placeholder={placeholder}
      emptyText={query.trim().length < 2 ? "Aramak için en az 2 harf yazın" : "Bu bilgiyle kayıtlı hasta bulunamadı"}
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
