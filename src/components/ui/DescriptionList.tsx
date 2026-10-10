import type { ReactNode } from "react";

export type DescriptionItem = {
  label: ReactNode;
  /** Boş (null/undefined/"") ise soluk "—" gösterilir. */
  value: ReactNode;
  /** true ise satır hiç gösterilmez (yetki/koşul). */
  hidden?: boolean;
  /** "grid" düzende satırı tüm genişliğe yayar (uzun metin, adres, not). */
  full?: boolean;
  /** "rows" düzende toplam/sonuç satırı: üstte çizgi, kalın değer (ör. "Kalan borç"). */
  emphasis?: boolean;
  key?: string;
};

type DescriptionListProps = {
  items: DescriptionItem[];
  /**
   * "grid": etiket üstte, değer altta; 1-3 sütun (profil/özet kartları).
   * "rows": etiket solda, değer sağda; satırlar çizgiyle ayrılır (ayrıntı penceresi).
   */
  layout?: "grid" | "rows";
  columns?: 1 | 2 | 3;
  className?: string;
};

function isEmpty(value: ReactNode) {
  return value === null || value === undefined || value === false || (typeof value === "string" && value.trim() === "");
}

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

/**
 * Etiket–değer listesi: hasta özeti, kayıt ayrıntısı, gönderim detayı gibi
 * salt okunur bilgiler için TEK görünüm. Boş değer her yerde aynı soluk
 * "—" ile gösterilir (sözleşme §3).
 */
export function DescriptionList({ items, layout = "grid", columns = 2, className = "" }: DescriptionListProps) {
  const shown = items.filter((item) => !item.hidden);
  // Adsız <span>'deki aria-label yok sayılır; ekran okuyucu "Bilgi yok" duysun.
  const empty = <span className="text-slate-300"><span aria-hidden="true">—</span><span className="sr-only">Bilgi yok</span></span>;

  if (layout === "rows") {
    return (
      <dl className={`ui-description-list divide-y divide-slate-100 ${className}`}>
        {shown.map((item, index) => (
          <div key={item.key ?? index} className={`grid grid-cols-[minmax(96px,34%)_minmax(0,1fr)] gap-3 py-2 text-sm first:pt-0 last:pb-0 ${item.emphasis ? "border-t border-slate-200" : ""}`}>
            <dt className={`text-xs font-semibold leading-5 ${item.emphasis ? "text-slate-800" : "text-slate-500"}`}>{item.label}</dt>
            <dd className={`min-w-0 break-words ${item.emphasis ? "font-extrabold text-slate-900" : "text-slate-800"}`}>{isEmpty(item.value) ? empty : item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className={`ui-description-list grid gap-x-6 gap-y-3 ${COLUMNS[columns]} ${className}`}>
      {shown.map((item, index) => (
        <div key={item.key ?? index} className={`min-w-0 ${item.full ? "sm:col-span-full" : ""}`}>
          <dt className="text-xs font-semibold text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{isEmpty(item.value) ? empty : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
