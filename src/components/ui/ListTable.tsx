"use client";

import type { ComponentType, ReactNode } from "react";
import { TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { ListPager, type ListPagerProps } from "@/components/ui/ListPager";
import { EmptyState } from "@/components/ui/EmptyState";
import type { IconAccent } from "@/components/ui/IconFrame";

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
  /** Boş durum ikonunun modül vurgu rengi (bkz. IconFrame) — opsiyonel. */
  emptyAccent?: IconAccent;
  emptyIcon?: ComponentType<{ className?: string }>;
  emptyIllustrative?: boolean;
  onRowClick?: (row: T) => void;
  getRowAriaLabel?: (row: T) => string;
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
  emptyAccent,
  emptyIcon,
  emptyIllustrative = false,
  onRowClick,
  getRowAriaLabel,
  pager,
}: ListTableProps<T>) {
  const hasStickyActions = columns.some((column) => column.key === "islem" || column.key === "actions");
  const tableMinWidth = columns.length >= 6 ? "min-w-[820px]" : columns.length >= 4 ? "min-w-[680px]" : "";

  return (
    <div className="ui-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`${tableMinWidth} w-full`}>
          <thead>
            <tr className="border-b-2 border-slate-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "whitespace-nowrap px-3 py-2 sm:px-4",
                    ALIGN_CLASS[col.align || "left"],
                    hasStickyActions && (col.key === "islem" || col.key === "actions")
                      ? "md:sticky md:right-0 md:z-10 md:bg-slate-50/95 md:shadow-[-5px_0_8px_-8px_rgb(15_23_42/0.35)]"
                      : "",
                    col.headerClassName || "",
                  ].filter(Boolean).join(" ")}
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
                <td colSpan={columns.length}>
                  <EmptyState title={emptyText} accent={emptyAccent} icon={emptyIcon} illustrative={emptyIllustrative} compact />
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowKey(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  aria-label={onRowClick ? getRowAriaLabel?.(row) : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  } : undefined}
                  style={{ ["--row-delay" as string]: `${Math.min(rowIndex, 14) * 18}ms` }}
                  className={`ui-row-in group transition-[background-color,box-shadow] duration-150 hover:bg-primary/[0.04] hover:shadow-[inset_3px_0_0_rgb(var(--app-primary)/0.55)] ${onRowClick ? "cursor-pointer focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        "px-3 py-2 sm:px-4",
                        ALIGN_CLASS[col.align || "left"],
                        hasStickyActions && (col.key === "islem" || col.key === "actions")
                          ? "md:sticky md:right-0 md:z-10 md:bg-white md:shadow-[-5px_0_8px_-8px_rgb(15_23_42/0.35)] md:group-hover:bg-primary/[0.035]"
                          : "",
                        col.cellClassName || "",
                      ].filter(Boolean).join(" ")}
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
