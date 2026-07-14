"use client";

import type { ReactNode } from "react";
import { TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { ListPager, type ListPagerProps } from "@/components/ui/ListPager";

export interface ListTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
}

export interface ListTableProps<T> {
  columns: ListTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  pager?: ListPagerProps;
}

const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// Bu bileşen src/app/globals.css'teki .panel-content table/thead/th/td taban
// stiline (border-radius, font-weight, min-height) güvenir, onu tekrar
// tanımlamaz — bkz. tasarım tutarlılığı planı.
export function ListTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  emptyText = "Kayıt bulunamadı",
  onRowClick,
  pager,
}: ListTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={["px-4 py-3", ALIGN_CLASS[col.align || "left"], col.headerClassName || ""].filter(Boolean).join(" ")}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={skeletonRows} columns={columns.length} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-slate-400">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition hover:bg-slate-50/80 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={["px-4 py-3", ALIGN_CLASS[col.align || "left"], col.cellClassName || ""].filter(Boolean).join(" ")}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pager && rows.length > 0 && <ListPager {...pager} />}
    </div>
  );
}
