"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CountBadge } from "@/components/ui/CountBadge";

type ToolbarProps = {
  /** Solda arama (genişler) ve her zaman görünmesi gereken kontroller. */
  children?: ReactNode;
  /** Sağda ikincil eylemler (Dışa aktar vb.). */
  actions?: ReactNode;
  /**
   * Filtreler (Dönem, Doktor, Durum…). Masaüstünde aramanın yanında satır
   * içinde; telefonda (<640px) "Filtreler (n)" düğmesinin arkasında katlanır,
   * liste aşağı itilmez. Verilmezse araç çubuğu eskisi gibi çizilir.
   */
  filters?: ReactNode;
  /** Varsayılandan farklı filtre sayısı — telefondaki düğmede sayaç olarak görünür (arama sayılmaz). */
  filterCount?: number;
  /**
   * Çerçevesiz, zeminsiz görünüm (sadelik K1): araç çubuğu ayrı kart
   * olmasın — sayfa zemininde doğrudan durur. ListTable `toolbar` yuvasında
   * listenin kartının üst şeridi olur (yuvada `bare` verilmese de çerçeve kalkar).
   */
  bare?: boolean;
  className?: string;
};

/**
 * Liste üstündeki TEK araç/filtre çubuğu: solda arama (genişler), yanında
 * filtreler, sağda ikincil eylemler. Mobilde alt alta sarılır. Sayfaların
 * kendi filtre kutularını farklı kenar/boşlukla yazmasının yerine geçer.
 * Not: açılır menüler (ActionMenu, ExportMenu) gövdeye (portal) çizilir;
 * araç çubuğu ya da altındaki tablo onları kırpamaz. Araç çubuğuna kendi
 * `absolute` açılır kutunuzu koymayın (eskiden `.ui-toolbar` overflow:hidden
 * idi ve bu yüzden Muhasebe "Dışa aktar" menüsü kırpılıyordu).
 *
 * Liste sayfasında araç çubuğu ve tablo TEK kart görünsün: Toolbar'ı
 * ListTable'ın `toolbar` yuvasına verin (kartın üst şeridi olur); listenin
 * üstüne ayrı kart olarak koymayın. Liste yoksa `bare` ile sayfa zemininde
 * çerçevesiz durur.
 *
 * Kullanım:
 *   <ListTable toolbar={<Toolbar …>…</Toolbar>} … />
 *   <Toolbar
 *     actions={<ExportMenu size="md" … />}   // araç çubuğunda md: arama/seçicilerle aynı 40px
 *     filters={<><DateRangeFilter {...period.filterProps} /><DoctorSelect … /></>}
 *     filterCount={activeFilters.length}
 *   >
 *     <SearchInput ... wrapperClassName="flex-1 min-w-[220px]" />
 *   </Toolbar>
 */
export function Toolbar({ children, actions, filters, filterCount = 0, bare = false, className = "" }: ToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const frame = bare ? "ui-toolbar ui-toolbar-bare p-0" : "ui-toolbar p-2.5";

  if (!filters) {
    return (
      <div className={`${frame} flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[220px] sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }

  // Telefonda sıra: arama → [Filtreler (n)] [eylemler] → açılınca filtreler.
  // Masaüstünde (sm+) `order` sıfırlanır, filtre kutusu `contents` olur ve
  // kontroller aramanın yanında tek satıra dizilir; düğme gizlenir.
  return (
    <div className={`${frame} flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      {children && (
        // sm:min-w-[220px]: süzgeçler sığmayınca arama ezilmesin; süzgeçler alt satıra iner.
        <div className="order-1 flex min-w-0 flex-1 flex-col gap-2 sm:order-none sm:min-w-[220px] sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      )}
      <div id={filtersId} className={`${filtersOpen ? "flex" : "hidden"} order-3 min-w-0 flex-col gap-2 sm:order-none sm:contents`}>
        {filters}
      </div>
      <div className={`order-2 flex shrink-0 flex-wrap items-center gap-2 sm:order-none sm:ml-auto ${actions ? "" : "sm:hidden"}`}>
        <Button
          variant="secondary"
          size="sm"
          icon={SlidersHorizontal}
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((open) => !open)}
          className="sm:hidden"
        >
          Filtreler
          <CountBadge count={filterCount} tone="info" label="filtre uygulandı" />
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${filtersOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
        {actions}
      </div>
    </div>
  );
}

export type ActiveFilter = { key: string; label: string; onRemove: () => void };

/**
 * Uygulanmış filtreleri kaldırılabilir küçük etiketler olarak gösterir —
 * kullanıcı listenin neden kısa olduğunu ve filtreyi nasıl kaldıracağını görür.
 */
export function ActiveFilters({ filters, onClearAll }: { filters: ActiveFilter[]; onClearAll?: () => void }) {
  if (filters.length === 0) return null;
  return (
    // role="group": aria-label rolsüz <div>'de yok sayılıyordu.
    // ui-active-filters: ListTable `toolbar` yuvasında araç çubuğuyla aynı iç boşluğu alır.
    <div role="group" className="ui-active-filters flex flex-wrap items-center gap-1.5" aria-label="Uygulanan filtreler">
      {filters.map((filter) => (
        <span key={filter.key} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-1 pl-3 pr-1 text-xs font-semibold text-primary">
          {filter.label}
          {/* `.panel-content button { min-height: 36px }` etiketi şişiriyordu: düğme 20px
              kalır, dokunma alanı ::before ile büyür. */}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`${filter.label} filtresini kaldır`}
            className="relative flex h-5 w-5 items-center justify-center rounded-full !min-h-0 before:absolute before:-inset-2 before:content-[''] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {onClearAll && filters.length > 1 && (
        // Sözlük (§3) ve boş liste eylemiyle aynı ad: "Filtreleri temizle".
        <button type="button" onClick={onClearAll} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}
