import type { ReactNode } from "react";

/**
 * Ayarlar sekmelerindeki listelerin (POS, tedavi türleri, tedavi alanları,
 * şube erişimi) üst satırı: ne olduğu + nerede kullanıldığı ve sağda o
 * sekmenin tek birincil eylemi. Her sekme aynı yerleşimi kullanır.
 */
export function SettingsListHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
