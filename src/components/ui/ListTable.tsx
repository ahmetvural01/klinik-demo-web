"use client";

import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { ListPager, type ListPagerProps } from "@/components/ui/ListPager";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import type { IconAccent } from "@/components/ui/IconFrame";

export interface ListTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
  /** Verilirse başlık tıklanınca bu anahtarla sıralama istenir (bkz. sort/onSortChange). */
  sortKey?: string;
  render: (row: T) => ReactNode;
}

export type ListSort = { key: string; dir: "asc" | "desc" };

export interface ListTableProps<T> {
  columns: ListTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  /** Yükleme hatası: liste yerine açık hata ve "Yeniden dene" gösterilir (boş liste gibi görünmez). */
  error?: string | null;
  onRetry?: () => void;
  emptyText?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Boş durum ikonunun modül vurgu rengi (bkz. IconFrame) — opsiyonel. */
  emptyAccent?: IconAccent;
  emptyIcon?: ComponentType<{ className?: string }>;
  emptyIllustrative?: boolean;
  onRowClick?: (row: T) => void;
  getRowAriaLabel?: (row: T) => string;
  /** Satıra durum vurgusu (ör. geciken kayıt) için ek sınıf. */
  rowClassName?: (row: T) => string;
  /**
   * Verilirse dar ekranda (<768px) tablo yerine bu kart görünümü kullanılır —
   * sayfaların aynı listeyi mobil için ikinci kez elle yazmasına gerek kalmaz.
   * Kart içeriği satırın en önemli 2-3 bilgisini ve eylemlerini göstermeli.
   */
  mobileCard?: (row: T) => ReactNode;
  sort?: ListSort | null;
  onSortChange?: (key: string) => void;
  pager?: ListPagerProps;
  /** Tablonun üstünde, aynı kart içinde gösterilecek içerik (ör. toplu işlem çubuğu). */
  header?: ReactNode;
  /**
   * Çoklu seçim: her satırın başında onay kutusu, başlıkta "görünenlerin
   * tümünü seç". onRowClick verilmemişse satıra tıklamak (veya Boşluk tuşu)
   * seçimi değiştirir — küçük onay kutusunu hedeflemek gerekmez.
   */
  selection?: {
    selectedIds: readonly string[];
    onChange: (ids: string[]) => void;
    isSelectable?: (row: T) => boolean;
  };
}

const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button'], [role='menuitem']";

function isFromInteractiveChild(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  // Satırın kendisi role="button" taşıdığı için closest() ona da eşleşir —
  // currentTarget hariç tutulmazsa satır tıklaması hiç çalışmaz.
  return Boolean(interactive && interactive !== event.currentTarget);
}

// Bu bileşen src/app/globals.css'teki .panel-content table/thead/th/td taban
// stiline güvenir, onu tekrar tanımlamaz.
export function ListTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  error,
  onRetry,
  emptyText = "Kayıt bulunamadı",
  emptyDescription,
  emptyAction,
  emptyAccent,
  emptyIcon,
  emptyIllustrative = false,
  onRowClick,
  getRowAriaLabel,
  rowClassName,
  mobileCard,
  sort,
  onSortChange,
  pager,
  header,
  selection,
}: ListTableProps<T>) {
  const hasStickyActions = columns.some((column) => column.key === "islem" || column.key === "actions");
  const tableMinWidth = columns.length >= 6 ? "min-w-[820px]" : columns.length >= 4 ? "min-w-[680px]" : "";
  const isActionsColumn = (key: string) => hasStickyActions && (key === "islem" || key === "actions");

  const selectedSet = new Set(selection?.selectedIds || []);
  const canSelect = (row: T) => Boolean(selection) && (selection?.isSelectable?.(row) ?? true);
  const selectableRows = selection ? rows.filter(canSelect) : [];
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedSet.has(rowKey(row)));
  const someVisibleSelected = selectableRows.some((row) => selectedSet.has(rowKey(row)));
  const toggleRow = (row: T) => {
    if (!selection || !canSelect(row)) return;
    const id = rowKey(row);
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange([...next]);
  };
  const toggleAllVisible = () => {
    if (!selection) return;
    const next = new Set(selectedSet);
    for (const row of selectableRows) {
      if (allVisibleSelected) next.delete(rowKey(row));
      else next.add(rowKey(row));
    }
    selection.onChange([...next]);
  };
  const columnCount = columns.length + (selection ? 1 : 0);
  const selectBox = (row: T) => (
    <input
      type="checkbox"
      checked={selectedSet.has(rowKey(row))}
      disabled={!canSelect(row)}
      onChange={() => toggleRow(row)}
      aria-label={`${getRowAriaLabel?.(row) || "Satır"} — seç`}
      className="h-[18px] w-[18px]"
    />
  );

  const rowHandlers = (row: T) => !onRowClick && selection ? {
    tabIndex: 0,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      toggleRow(row);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggleRow(row);
      }
    },
  } : onRowClick ? {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": getRowAriaLabel?.(row),
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      onRowClick(row);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onRowClick(row);
      }
    },
  } : {};

  const showError = Boolean(error) && !loading;
  const showSkeleton = loading && rows.length === 0 && !showError;
  const showEmpty = !loading && !showError && rows.length === 0;
  const empty = (
    <EmptyState title={emptyText} description={emptyDescription} action={emptyAction} accent={emptyAccent} icon={emptyIcon} illustrative={emptyIllustrative} compact />
  );

  return (
    <div className="ui-list-table ui-surface overflow-hidden" aria-busy={loading || undefined}>
      {header}
      {showError && (
        <div className="p-3">
          <LoadErrorState message={error || "Liste yüklenemedi."} onRetry={onRetry} />
        </div>
      )}

      {mobileCard && !showError && (
        <div className="divide-y divide-slate-100 md:hidden">
          {showSkeleton ? <ListRowSkeleton rows={Math.min(skeletonRows, 5)} /> : showEmpty ? empty : rows.map((row) => (
            <div
              key={rowKey(row)}
              {...rowHandlers(row)}
              className={`px-4 py-3 ${onRowClick || selection ? "cursor-pointer active:bg-primary/5 focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25" : ""} ${selection && selectedSet.has(rowKey(row)) ? "bg-primary/[0.05]" : ""} ${rowClassName?.(row) || ""}`}
            >
              {selection ? (
                <div className="flex items-start gap-3">
                  <span className="pt-0.5">{selectBox(row)}</span>
                  <div className="min-w-0 flex-1">{mobileCard(row)}</div>
                </div>
              ) : mobileCard(row)}
            </div>
          ))}
        </div>
      )}

      {!showError && (
        <div className={`${mobileCard ? "hidden md:block" : ""} overflow-x-auto`}>
          <table className={`${tableMinWidth} w-full`}>
            <thead>
              <tr className="border-b border-slate-200/80">
                {selection && (
                  <th className="w-10 px-3 py-2.5 sm:px-4">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(element) => { if (element) element.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                      disabled={selectableRows.length === 0}
                      onChange={toggleAllVisible}
                      aria-label="Görünen satırların tümünü seç"
                      className="h-[18px] w-[18px]"
                    />
                  </th>
                )}
                {columns.map((col) => {
                  const sorted = sort && col.sortKey && sort.key === col.sortKey ? sort.dir : null;
                  return (
                    <th
                      key={col.key}
                      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                      className={[
                        "whitespace-nowrap px-3 py-2.5 sm:px-4",
                        ALIGN_CLASS[col.align || "left"],
                        isActionsColumn(col.key) ? "md:sticky md:right-0 md:z-10 md:bg-[rgb(var(--app-surface))]" : "",
                        col.headerClassName || "",
                      ].filter(Boolean).join(" ")}
                    >
                      {col.sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(col.sortKey as string)}
                          className={`ui-table-sort-button inline-flex items-center gap-1 uppercase tracking-wide ${col.align === "right" ? "flex-row-reverse" : ""}`}
                        >
                          {col.header}
                          {sorted === "asc" ? <ArrowUp className="h-3 w-3 text-primary" aria-hidden="true" />
                            : sorted === "desc" ? <ArrowDown className="h-3 w-3 text-primary" aria-hidden="true" />
                              : <ArrowUpDown className="h-3 w-3 text-slate-300" aria-hidden="true" />}
                        </button>
                      ) : col.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {showSkeleton ? (
                <TableRowsSkeleton rows={skeletonRows} columns={columnCount} />
              ) : showEmpty ? (
                <tr>
                  <td colSpan={columnCount}>{empty}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    {...rowHandlers(row)}
                    className={`group transition-colors duration-150 hover:bg-primary/[0.035] ${onRowClick || selection ? "cursor-pointer focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25" : ""} ${selection && selectedSet.has(rowKey(row)) ? "bg-primary/[0.05]" : ""} ${rowClassName?.(row) || ""}`}
                  >
                    {selection && <td className="w-10 px-3 py-2.5 sm:px-4">{selectBox(row)}</td>}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          "px-3 py-2.5 sm:px-4",
                          ALIGN_CLASS[col.align || "left"],
                          isActionsColumn(col.key) ? "md:sticky md:right-0 md:z-10 md:bg-[rgb(var(--app-surface))] md:group-hover:bg-[rgb(var(--color-slate-50))]" : "",
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
      )}
      {pager && rows.length > 0 && !showError && <ListPager {...pager} />}
    </div>
  );
}

/** Boş değer için tek tip gösterim ("—", soluk). */
export function EmptyValue() {
  return <span className="text-slate-300" aria-label="Bilgi yok">—</span>;
}
