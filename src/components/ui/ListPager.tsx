"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ListPagerProps {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions?: number[];
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
}

export function ListPager({
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: ListPagerProps) {
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>{startRow}-{endRow} / {total.toLocaleString("tr-TR")} kayıt</span>
        <span>Sayfa {page} / {Math.max(1, pageCount)}</span>
        {onPageSizeChange && pageSizeOptions && (
          <label className="inline-flex items-center gap-2">
            Sayfa başına
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Önceki
        </button>
        <button
          type="button"
          disabled={page >= pageCount || loading}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Sonraki
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
