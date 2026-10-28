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
 * Gösterilecek sayfa numaraları: ilk ve son sayfa her zaman, bulunulan
 * sayfanın bir öncesi ve sonrası; aradaki boşluk "…" ile kısalır
 * (1 … 4 5 6 … 20). Yedi ve daha az sayfada hepsi yazar.
 */
export function pagerItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  // Başta ya da sonda iken komşu iki sayfa daha gösterilir: düğme sayısı sabit kalır.
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((value) => pages.add(value));
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) items.push("gap");
    items.push(value);
  });
  return items;
}

/**
 * Liste altındaki sayfalayıcı. Sayfa numarasına tıklayınca doğrudan o sayfa
 * açılır (uzun listede tek tek "Sonraki"ye basmak gerekmez). Tek sayfalık
 * listede yalnız kayıt sayısı yazar; boşta duran düğme ve seçici çıkmaz.
 * Düğmeler ve seçici ortak Button/Select'tir (tek boy ve odak halkası).
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
  const singlePage = pageCount <= 1;
  // Sayfa boyu seçimi yalnız kayıt en küçük sayfa boyundan fazlaysa işe yarar.
  const showPageSize = Boolean(onPageSizeChange && pageSizeOptions && total > Math.min(...pageSizeOptions));

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100/80 bg-slate-50/80 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {/* "1–25 / 1.234 kayıt" yeterli; "Sayfa 1 / 50" aynı bilgiyi tekrar ediyordu. */}
        <span>
          {singlePage
            ? `${total.toLocaleString("tr-TR")} kayıt`
            : `${startRow.toLocaleString("tr-TR")}–${endRow.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} kayıt`}
        </span>
        {showPageSize && onPageSizeChange && pageSizeOptions && (
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
      {!singlePage && (
        <nav aria-label="Sayfalar" className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronLeft}
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Önceki sayfa"
          >
            <span className="max-sm:hidden">Önceki</span>
          </Button>
          {pagerItems(page, pageCount).map((item, index) => (item === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-slate-400" aria-hidden="true">…</span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "primary" : "secondary"}
              size="sm"
              disabled={loading && item !== page}
              aria-current={item === page ? "page" : undefined}
              aria-label={`${item}. sayfa`}
              onClick={() => { if (item !== page) onPageChange(item); }}
              className="min-w-9 !px-2 tabular-nums"
            >
              {item}
            </Button>
          )))}
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            iconPosition="right"
            disabled={page >= pageCount || loading}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            aria-label="Sonraki sayfa"
          >
            <span className="max-sm:hidden">Sonraki</span>
          </Button>
        </nav>
      )}
    </div>
  );
}
