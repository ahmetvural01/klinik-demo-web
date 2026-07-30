"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

type ProfessionalDataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  emptyText?: string;
  pageSize?: number;
  onRowClick?: (item: TData) => void;
  getRowAriaLabel?: (item: TData) => string;
};

export function ProfessionalDataTable<TData>({
  data,
  columns,
  emptyText = "Kayıt bulunamadı",
  pageSize = 15,
  onRowClick,
  getRowAriaLabel,
}: ProfessionalDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const stableColumns = useMemo(() => columns, [columns]);
  const table = useReactTable({
    data,
    columns: stableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="ui-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-slate-50/90 text-left">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`whitespace-nowrap px-3 py-2.5 text-xs font-bold uppercase tracking-normal text-slate-500 sm:px-4 ${
                      header.column.id === "actions" ? "md:sticky md:right-0 md:z-10 md:bg-slate-50/95 md:shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]" : ""
                    }`}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className="flex items-center gap-1 text-left disabled:cursor-default"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === "asc"
                            ? <ArrowUp className="h-3 w-3 text-primary" />
                            : header.column.getIsSorted() === "desc"
                              ? <ArrowDown className="h-3 w-3 text-primary" />
                              : <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={table.getAllLeafColumns().length}>
                  <EmptyState title={emptyText} compact />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  aria-label={onRowClick ? getRowAriaLabel?.(row.original) : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row.original);
                    }
                  } : undefined}
                  className={`group transition-colors hover:bg-primary/[0.045] ${onRowClick ? "cursor-pointer focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25" : ""}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-3 py-2.5 sm:px-4 ${
                        cell.column.id === "actions" ? "md:sticky md:right-0 md:z-10 md:bg-white md:shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)] md:group-hover:bg-primary/[0.035]" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 sm:px-4">
          <span>
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} sayfa · {data.length} kayıt
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Önceki
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              Sonraki
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
