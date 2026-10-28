"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/PageSkeleton";
import { routes } from "@/lib/routes";
import type { ListSort } from "@/components/ui/ListTable";
import type { StaffLike } from "@/lib/staff-roles";
import type { PatientReportRow, ReportDoctor, ReportPatientFilter, TreatmentReportRow } from "@/lib/report-center-types";

// Para biçimi ortak sözlükten (₺1.250,00); bilinmeyen tutar için çağrılmaz, iskelet gösterilir.
export { money } from "@/components/muhasebe/muhasebe-utils";

/** Adet: 1.234 (veri yalnız istemcide yüklendikten sonra çizilir). */
export const count = (value: number) => (value || 0).toLocaleString("tr-TR");

/** Dışa aktarmada tutar: 1250,50 (Excel Türkçe ondalık). */
export const csvAmount = (value: number) => (value || 0).toFixed(2).replace(".", ",");

/** Kalan borç eşiği (src/lib/patient-balance.ts BALANCE_THRESHOLD ile aynı). */
export const BALANCE_EPSILON = 0.5;

/** Ekranda gösterilen kalan borç (fazla ödeme borç değildir, boş kalır). */
export const patientDebt = (row: PatientReportRow) => (row.balance > BALANCE_EPSILON ? row.balance : 0);

/** Tedavi adı ve dişi tek hücrede: "Dolgu · Diş 16" (dışa aktarma da aynı yazar). */
export const treatmentText = (row: TreatmentReportRow) => (row.tooth ? `${row.treatmentName} · Diş ${row.tooth}` : row.treatmentName);

/** Hastalar raporunun hızlı süzgeç adları. */
export const PATIENT_FILTER_LABELS: Record<ReportPatientFilter, string> = {
  tumu: "Tümü",
  yeni: "Yeni hastalar",
  borclu: "Borcu olanlar",
};

/** Ekrandaki doktor adı: artık çalışmayan doktorun yanında "(ayrıldı)". */
export const doctorLabel = (doctor: ReportDoctor) => (doctor.left ? `${doctor.fullName} (ayrıldı)` : doctor.fullName);

export function doctorNameMap(doctors: readonly ReportDoctor[] | null | undefined) {
  return new Map((doctors || []).map((doctor) => [doctor.id, doctorLabel(doctor)]));
}

/**
 * Ortak doktor seçicisine (DoctorSelect) verilecek liste. Kimin listede olacağına
 * sunucu karar verdi (dönemde kaydı olan ayrılmış doktor dahil); seçicinin kendi
 * "hekim mi" süzgeci onları düşürmesin diye hepsi hekim olarak verilir.
 */
export function doctorPickerOptions(doctors: readonly ReportDoctor[] | null | undefined): StaffLike[] {
  return (doctors || []).map((doctor) => ({ id: doctor.id, fullName: doctorLabel(doctor), role: "DOKTOR" }));
}

/** Satırdaki hekim kimliklerini adlara çevirir (Türkçe sırayla). */
export function doctorNames(ids: readonly string[], names: Map<string, string>) {
  return ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name)).sort((a, b) => a.localeCompare(b, "tr"));
}

/** Sıralama başlığına tıklama: aynı sütunda yön değişir, yeni sütun büyükten küçüğe başlar (ad A–Z). */
export function nextSort(current: ListSort | null, key: string, ascendingFirst = false): ListSort {
  if (current?.key === key) return { key, dir: current.dir === "desc" ? "asc" : "desc" };
  return { key, dir: ascendingFirst ? "asc" : "desc" };
}

/**
 * Hasta adı: hasta dosyasını açma izni (patients:read) varsa dosyaya bağlantı,
 * yoksa düz metin (muhasebe rolü hasta dosyası açamaz). Telefon/TC hiç gösterilmez.
 */
export function PatientNameCell({ id, name, canOpen, tab, muted = false, className = "" }: {
  id: string;
  name: string;
  canOpen: boolean;
  tab: "odeme" | "tedavi";
  /** Kartın ikinci satırında: normal ağırlık, soluk renk. */
  muted?: boolean;
  className?: string;
}) {
  const tone = muted ? "font-medium text-slate-600" : "font-semibold text-slate-900";
  return canOpen
    ? <Link href={routes.patient(id, tab)} className={`${tone} hover:text-primary hover:underline ${className}`}>{name}</Link>
    : <span className={`${tone} ${className}`}>{name}</span>;
}

/** Yatay çubuk listesi (tutar/adet dağılımı). */
export function BarList({ rows, tone = "primary" }: { rows: { label: string; value: number; display: string }[]; tone?: "primary" | "neutral" }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
          {/* Uzun ad kesilmesin: en fazla iki satır. */}
          <span className="line-clamp-2 break-words leading-snug text-slate-600" title={row.label}>{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className={`block h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-slate-400"}`} style={{ width: `${Math.max(3, Math.round((row.value / max) * 100))}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-slate-800">{row.display}</span>
        </li>
      ))}
    </ul>
  );
}

export function BarListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
