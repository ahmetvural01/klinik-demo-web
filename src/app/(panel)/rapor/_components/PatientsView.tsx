"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { Toolbar } from "@/components/ui/Toolbar";
import type { PatientReportRow, PatientsReport, ReportPatientFilter } from "@/lib/report-center-types";
import { PATIENT_FILTER_LABELS, PatientNameCell, count, doctorNames, money, patientDebt } from "./report-ui";

const PAGE_SIZE = 50;

const EMPTY_TEXT: Record<ReportPatientFilter, string> = {
  tumu: "Bu dönemde gelen hasta yok",
  yeni: "Bu dönemde yeni hasta yok",
  borclu: "Borcu olan hasta yok",
};

/** Ekrandaki sıra (dışa aktarma da aynı sırayı kullanır). Sıralama seçilmemişse sunucu sırası: en son gelen önce, borçlularda en çok borç önce. */
export function sortPatientRows(rows: PatientReportRow[], sort: ListSort | null): PatientReportRow[] {
  if (!sort) return rows;
  const direction = sort.dir === "asc" ? 1 : -1;
  const value = (row: PatientReportRow) => {
    if (sort.key === "tedavi") return row.treatmentTotal;
    if (sort.key === "tahsilat") return row.collected;
    return patientDebt(row);
  };
  return [...rows].sort((a, b) => (sort.key === "hasta"
    ? a.fullName.localeCompare(b.fullName, "tr") * direction
    : (value(a) - value(b)) * direction));
}

type Props = {
  /** null: ilk yükleme (iskelet). */
  data: PatientsReport | null;
  filter: ReportPatientFilter;
  onFilterChange: (filter: ReportPatientFilter) => void;
  sort: ListSort | null;
  onSortChange: (key: string) => void;
  doctorNameById: Map<string, string>;
  /** Doktor sütunu: doktor seçili değil ve dönemde 2+ doktor var. */
  showDoctorColumn: boolean;
  /** patients:read — ad hasta dosyasına bağlantı olur. */
  canOpenPatients: boolean;
  /** Süzgeç (hızlı süzgeç ya da doktor) uygulanmışsa boş listede "Filtreleri temizle". */
  onClearFilters?: () => void;
};

/**
 * Hastalar: dönemde gelen her hasta bir satır (Geldi/Tamamlandı randevusu ya
 * da yapılan tedavisi olan): dönemdeki tedavi tutarı ve tahsilatı, bugünkü kalan borcu.
 */
export function PatientsView({ data, filter, onFilterChange, sort, onSortChange, doctorNameById, showDoctorColumn, canOpenPatients, onClearFilters }: Props) {
  const rows = data ? sortPatientRows(data.rows, sort) : [];

  // Sayfa numarası listeye bağlı: süzgeç, sıralama ya da veri değişince 1. sayfaya döner.
  const pageKey = `${filter}|${sort?.key ?? ""}|${sort?.dir ?? ""}|${data?.rows.length ?? 0}|${data?.rows[0]?.id ?? ""}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: ListTableColumn<PatientReportRow>[] = [
    {
      key: "hasta",
      header: "Hasta",
      sortKey: "hasta",
      render: (row) => (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PatientNameCell id={row.id} name={row.fullName} canOpen={canOpenPatients} tab="odeme" />
          {row.isNew && <Badge tone="info">Yeni</Badge>}
        </div>
      ),
    },
    ...(showDoctorColumn ? [{
      key: "doktor",
      header: "Doktor",
      render: (row: PatientReportRow) => <span className="line-clamp-2 text-sm text-slate-600">{doctorNames(row.doctorIds, doctorNameById).join(", ")}</span>,
    }] : []),
    { key: "tedavi", header: "Tedavi tutarı", align: "right", sortKey: "tedavi", render: (row) => (row.treatmentTotal > 0 ? <span className="tabular-nums">{money(row.treatmentTotal)}</span> : null) },
    { key: "tahsilat", header: "Tahsilat", align: "right", sortKey: "tahsilat", render: (row) => (row.collected > 0 ? <span className="tabular-nums">{money(row.collected)}</span> : null) },
    {
      key: "borc",
      header: "Kalan borç",
      align: "right",
      sortKey: "borc",
      headerHint: "Hastanın bugünkü toplam borcu.",
      render: (row) => (patientDebt(row) > 0 ? <span className="font-bold tabular-nums text-slate-900">{money(patientDebt(row))}</span> : null),
    },
  ];

  // Toplam satırı: sayfalanmış olsa da listedeki TÜM hastalar.
  const totalTreatment = rows.reduce((sum, row) => sum + row.treatmentTotal, 0);
  const totalCollected = rows.reduce((sum, row) => sum + row.collected, 0);
  const totalDebt = rows.reduce((sum, row) => sum + patientDebt(row), 0);
  const totals = rows.length > 0 ? {
    cells: {
      hasta: `Toplam · ${count(rows.length)} hasta`,
      tedavi: <span className="tabular-nums">{money(totalTreatment)}</span>,
      tahsilat: <span className="tabular-nums">{money(totalCollected)}</span>,
      borc: <span className="tabular-nums">{money(totalDebt)}</span>,
    },
    mobile: `Toplam ${count(rows.length)} hasta · Tedavi ${money(totalTreatment)} · Tahsilat ${money(totalCollected)} · Borç ${money(totalDebt)}`,
  } : undefined;

  const filterOptions = [
    { value: "tumu" as const, label: PATIENT_FILTER_LABELS.tumu },
    { value: "yeni" as const, label: PATIENT_FILTER_LABELS.yeni, count: data?.counts.new },
    { value: "borclu" as const, label: PATIENT_FILTER_LABELS.borclu, count: data?.counts.debtors, countTone: "warning" as const },
  ];

  return (
    <div className="space-y-3">
      {data?.truncated && <Callout tone="info" compact>İlk {count(data.limit)} kayıt gösteriliyor.</Callout>}
      <ListTable
        toolbar={(
          <Toolbar>
            <ChoiceCards label="Gösterilecek hastalar" labelHidden variant="pills" value={filter} onChange={onFilterChange} options={filterOptions} />
          </Toolbar>
        )}
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        loading={!data}
        sort={sort}
        onSortChange={onSortChange}
        emptyText={EMPTY_TEXT[filter]}
        emptyAction={onClearFilters ? <Button size="sm" variant="secondary" onClick={onClearFilters}>Filtreleri temizle</Button> : undefined}
        mobileCard={(row) => {
          const debt = patientDebt(row);
          const meta = [
            row.treatmentTotal > 0 ? `Tedavi ${money(row.treatmentTotal)}` : "",
            row.collected > 0 ? `Tahsilat ${money(row.collected)}` : "",
            showDoctorColumn ? doctorNames(row.doctorIds, doctorNameById).join(", ") : "",
          ].filter(Boolean).join(" · ");
          return (
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <PatientNameCell id={row.id} name={row.fullName} canOpen={canOpenPatients} tab="odeme" className="truncate" />
                  {row.isNew && <Badge tone="info" className="shrink-0">Yeni</Badge>}
                </div>
                {debt > 0 && (
                  <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
                    {money(debt)} <span className="text-xs font-normal text-slate-500">borç</span>
                  </span>
                )}
              </div>
              {meta && <p className="truncate text-xs text-slate-500" title={meta}>{meta}</p>}
            </div>
          );
        }}
        pager={rows.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: rows.length, onPageChange: (next) => setPageState({ key: pageKey, page: next }) } : undefined}
        totals={totals}
      />
    </div>
  );
}
