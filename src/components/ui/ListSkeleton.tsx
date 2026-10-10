/**
 * Liste yükleniyor iskeletleri. ListTable kendi yükleme durumunda bunları
 * kullanır; PageSkeleton da aynı parçaları kullanır ki loading.tsx → sayfa →
 * veri geçişinde görünüm zıplamasın. Sunucu bileşeninde de çalışır (hook yok).
 */

type ListRowSkeletonProps = {
  rows?: number;
  /**
   * "block" (varsayılan): satır başına tek gri şerit — ListTable'ın mobil
   * kart görünümü yüklenirken. "row": gerçek liste satırı biçimi (başlık +
   * alt satır + sağda kısa değer) — ayar listesi, ajanda, kişi listesi.
   */
  variant?: "block" | "row";
  /** Yalnız "row": satır başında kare ikon ("icon", ayar satırı) ya da yuvarlak ("avatar", kişi). */
  leading?: "none" | "icon" | "avatar";
};

// Sabit genişlik dizileri: rastgele değer sunucu/istemci çıktısını farklılaştırırdı.
const ROW_TITLE_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-2/5", "w-1/4"];
const ROW_DETAIL_WIDTHS = ["w-3/5", "w-1/2", "w-2/3", "w-2/5", "w-3/5"];

export function ListRowSkeleton({ rows = 5, variant = "block", leading = "none" }: ListRowSkeletonProps) {
  if (variant === "row") {
    return (
      <div className="divide-y divide-slate-100" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            {leading !== "none" && (
              <div className={`ui-skeleton-shimmer h-8 w-8 shrink-0 bg-slate-100 ${leading === "avatar" ? "rounded-full" : "rounded-md"}`} />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`ui-skeleton-shimmer h-3.5 rounded bg-slate-100 ${ROW_TITLE_WIDTHS[index % ROW_TITLE_WIDTHS.length]}`} />
              <div className={`ui-skeleton-shimmer h-3 rounded bg-slate-100 ${ROW_DETAIL_WIDTHS[index % ROW_DETAIL_WIDTHS.length]}`} />
            </div>
            <div className="ui-skeleton-shimmer h-3 w-14 shrink-0 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="ui-skeleton-shimmer h-12 rounded-md bg-slate-100"
        />
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="px-4 py-3">
              <div
                className="ui-skeleton-shimmer h-3.5 rounded bg-slate-100"
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
