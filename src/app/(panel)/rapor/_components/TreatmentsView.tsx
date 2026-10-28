"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText } from "@/components/ui/Money";
import type { TreatmentReportRow, TreatmentsReport } from "@/lib/report-center-types";
import { PatientNameCell, count, money, treatmentText } from "./report-ui";

const PAGE_SIZE = 50;

/** Ekrandaki sıra (dışa aktarma da aynı sırayı kullanır). */
export function sortTreatmentRows(rows: TreatmentReportRow[], sort: ListSort | null): TreatmentReportRow[] {
  if (!sort) return rows;
  const direction = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => (sort.key === "ucret"
    ? (a.amount - b.amount) * direction
    : a.date.localeCompare(b.date) * direction));
}

type Props = {
  /** null: ilk yükleme (iskelet). */
  data: TreatmentsReport | null;
  sort: ListSort | null;
  onSortChange: (key: string) => void;
  doctorNameById: Map<string, string>;
  /** Doktor sütunu: doktor seçili değil ve dönemde 2+ doktor var. */
  showDoctorColumn: boolean;
  canOpenPatients: boolean;
  onClearFilters?: () => void;
};

/** Tedaviler: dönemde yapılan (ücrete yansıyan) her tedavi. */
export function TreatmentsView({ data, sort, onSortChange, doctorNameById, showDoctorColumn, canOpenPatients, onClearFilters }: Props) {
  const rows = data ? sortTreatmentRows(data.rows, sort) : [];

  const pageKey = `${sort?.key ?? ""}|${sort?.dir ?? ""}|${data?.rows.length ?? 0}|${data?.rows[0]?.id ?? ""}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: ListTableColumn<TreatmentReportRow>[] = [
    { key: "tarih", header: "Tarih", sortKey: "tarih", render: (row) => <DateText value={row.date} className="whitespace-nowrap text-slate-700" /> },
    { key: "hasta", header: "Hasta", render: (row) => <PatientNameCell id={row.patientId} name={row.patientName} canOpen={canOpenPatients} tab="tedavi" /> },
    ...(showDoctorColumn ? [{
      key: "doktor",
      header: "Doktor",
      render: (row: TreatmentReportRow) => <span className="text-sm text-slate-600">{doctorNameById.get(row.doctorId) || ""}</span>,
    }] : []),
    {
      key: "tedavi",
      header: "Tedavi",
      render: (row) => (
        <span className="text-slate-800">
          {row.treatmentName}
          {row.tooth && <span className="text-slate-500"> · Diş {row.tooth}</span>}
        </span>
      ),
    },
    { key: "ucret", header: "Ücret", align: "right", sortKey: "ucret", render: (row) => <span className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</span> },
  ];

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totals = rows.length > 0 ? {
    cells: {
      tarih: "Toplam",
      hasta: `${count(rows.length)} tedavi`,
      ucret: <span className="tabular-nums">{money(totalAmount)}</span>,
    },
    mobile: `Toplam ${count(rows.length)} tedavi · ${money(totalAmount)}`,
  } : undefined;

  return (
    <div className="space-y-3">
      {data?.truncated && <Callout tone="info" compact>İlk {count(data.limit)} kayıt gösteriliyor.</Callout>}
      <ListTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        loading={!data}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="Bu dönemde yapılan tedavi yok"
        emptyAction={onClearFilters ? <Button size="sm" variant="secondary" onClick={onClearFilters}>Filtreleri temizle</Button> : undefined}
        mobileCard={(row) => (
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-semibold text-slate-900">{treatmentText(row)}</span>
              <span className="shrink-0 font-bold tabular-nums text-slate-900">{money(row.amount)}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
              <DateText value={row.date} />
              <span aria-hidden="true">·</span>
              <PatientNameCell id={row.patientId} name={row.patientName} canOpen={canOpenPatients} tab="tedavi" muted />
              {showDoctorColumn && doctorNameById.get(row.doctorId) && (
                <><span aria-hidden="true">·</span><span>{doctorNameById.get(row.doctorId)}</span></>
              )}
            </div>
          </div>
        )}
        pager={rows.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: rows.length, onPageChange: (next) => setPageState({ key: pageKey, page: next }) } : undefined}
        totals={totals}
      />
    </div>
  );
}
