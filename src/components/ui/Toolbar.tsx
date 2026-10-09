import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Liste üstündeki TEK araç/filtre çubuğu: solda arama (genişler), yanında
 * filtreler, sağda ikincil eylemler. Mobilde alt alta sarılır. Sayfaların
 * kendi filtre kutularını farklı kenar/boşlukla yazmasının yerine geçer.
 *
 * Kullanım:
 *   <Toolbar actions={<Button variant="secondary">Dışa aktar</Button>}>
 *     <SearchInput ... wrapperClassName="flex-1 min-w-[220px]" />
 *     <Select ...>...</Select>
 *   </Toolbar>
 */
export function Toolbar({ children, actions, className = "" }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`ui-toolbar flex flex-col gap-2 p-2.5 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Uygulanan filtreler">
      {filters.map((filter) => (
        <span key={filter.key} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-1 pl-3 pr-1 text-xs font-semibold text-primary">
          {filter.label}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`${filter.label} filtresini kaldır`}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/10"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {onClearAll && filters.length > 1 && (
        <button type="button" onClick={onClearAll} className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
          Tümünü temizle
        </button>
      )}
    </div>
  );
}
