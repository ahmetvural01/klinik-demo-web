"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Section } from "@/components/ui/Section";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import type { SummaryDoctorRow, SummaryReport } from "@/lib/report-center-types";
import { BarList, BarListSkeleton, count, money } from "./report-ui";

type Props = {
  /** null: ilk yükleme (iskelet). */
  data: SummaryReport | null;
  /** Doktor tablosu: doktor seçili değil ve dönemde 2+ doktor var. */
  showDoctorTable: boolean;
  /** Doktor adı ("(ayrıldı)" ekiyle). */
  doctorNameById: Map<string, string>;
  /** Tahsilat sayısından Muhasebe'deki tahsilat listesine (izin ve doktor süzgeci yoksa). */
  collectionsHref?: string;
  onOpenPatients: () => void;
  onOpenTreatments: () => void;
  onSelectDoctor: (doctorId: string) => void;
};

/**
 * Özet: dönemin dört sayısı (her biri ayrıntısına götürür), doktorlara göre
 * dağılım (satıra tıklayınca rapor o doktora süzülür) ve en çok yapılan tedaviler.
 */
export function SummaryView({ data, showDoctorTable, doctorNameById, collectionsHref, onOpenPatients, onOpenTreatments, onSelectDoctor }: Props) {
  const loading = !data;

  // Hiç kayıt olmayan dönemde sıfırlı kutular yerine tek boş durum.
  if (data && data.visitedPatients === 0 && data.treatmentCount === 0 && data.collected === 0) {
    return <Section><EmptyState title="Bu dönemde kayıt yok" compact /></Section>;
  }

  const strip: StatItem[] = [
    { key: "visited", label: "Gelen hasta", value: data ? count(data.visitedPatients) : null, onClick: onOpenPatients },
    { key: "count", label: "Yapılan tedavi", value: data ? count(data.treatmentCount) : null, onClick: onOpenTreatments },
    { key: "amount", label: "Tedavi tutarı", value: data ? money(data.treatmentTotal) : null, onClick: onOpenTreatments },
    { key: "collected", label: "Tahsilat", value: data ? money(data.collected) : null, href: collectionsHref },
  ];

  const nameOf = (row: SummaryDoctorRow) => (row.doctorId ? doctorNameById.get(row.doctorId) || row.fullName : row.fullName);
  const columns: ListTableColumn<SummaryDoctorRow>[] = [
    {
      key: "doktor",
      header: "Doktor",
      render: (row) => <span className={row.doctorId ? "font-semibold text-slate-900" : "text-slate-500"}>{nameOf(row)}</span>,
    },
    { key: "hasta", header: "Hasta", align: "right", render: (row) => (row.patients > 0 ? <span className="tabular-nums">{count(row.patients)}</span> : null) },
    { key: "tedavi", header: "Tedavi", align: "right", render: (row) => (row.treatments > 0 ? <span className="tabular-nums">{count(row.treatments)}</span> : null) },
    {
      key: "tutar",
      header: "Tedavi tutarı",
      align: "right",
      render: (row) => (row.treatmentTotal > 0 ? <span className="font-semibold tabular-nums text-slate-900">{money(row.treatmentTotal)}</span> : null),
    },
    { key: "tahsilat", header: "Tahsilat", align: "right", render: (row) => (row.collected > 0 ? <span className="tabular-nums">{money(row.collected)}</span> : null) },
  ];

  return (
    <div className="space-y-3">
      <StatStrip items={strip} loading={loading} columns={4} aria-label="Dönem özeti" />

      {showDoctorTable && (loading || data.byDoctor.length > 0) && (
        <ListTable
          columns={columns}
          rows={data?.byDoctor ?? []}
          rowKey={(row) => row.doctorId ?? "doktorsuz"}
          loading={loading}
          skeletonRows={3}
          onRowClick={(row) => { if (row.doctorId) onSelectDoctor(row.doctorId); }}
          isRowClickable={(row) => Boolean(row.doctorId)}
          getRowAriaLabel={(row) => `${nameOf(row)}: raporu bu doktora göre göster`}
          mobileCard={(row) => {
            const meta = [
              row.patients > 0 ? `${count(row.patients)} hasta` : "",
              row.treatments > 0 ? `${count(row.treatments)} tedavi` : "",
              row.collected > 0 ? `Tahsilat ${money(row.collected)}` : "",
            ].filter(Boolean).join(" · ");
            return (
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span className={`truncate font-semibold ${row.doctorId ? "text-slate-900" : "text-slate-500"}`}>{nameOf(row)}</span>
                  {row.treatmentTotal > 0 && <span className="shrink-0 font-bold tabular-nums text-slate-900">{money(row.treatmentTotal)}</span>}
                </div>
                {meta && <p className="truncate text-xs text-slate-500">{meta}</p>}
              </div>
            );
          }}
        />
      )}

      {(loading || data.topTreatments.length > 0) && (
        <Section title="En çok yapılan tedaviler">
          {loading ? <BarListSkeleton /> : (
            <BarList rows={data.topTreatments.map((row) => ({ label: row.name, value: row.count, display: `${count(row.count)} kez` }))} />
          )}
        </Section>
      )}
    </div>
  );
}
