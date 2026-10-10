"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

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

/**
 * Liste altındaki sayfalayıcı. Düğmeler ve seçici ortak Button/Select'tir:
 * aynı satırda tek boy (36px) ve tek yazı ölçüsü, öteki ikincil düğmelerle
 * aynı hover ve odak halkası (önceden elle yazılmıştı ve ayrışıyordu).
 */
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
    <div className="flex flex-col gap-3 border-t border-slate-100/80 bg-slate-50/80 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {/* "1–25 / 1.234 kayıt" yeterli; "Sayfa 1 / 50" aynı bilgiyi tekrar ediyordu. */}
        <span>{startRow.toLocaleString("tr-TR")}–{endRow.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} kayıt</span>
        {onPageSizeChange && pageSizeOptions && (
          <label className="inline-flex items-center gap-2">
            Sayfa başına
            <Select
              size="sm"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              data-dirty-ignore
              className="w-auto !min-h-9"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </Select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Önceki
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronRight}
          iconPosition="right"
          disabled={page >= pageCount || loading}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}
