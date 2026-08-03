import type { ReactNode } from "react";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

export type PageHeaderStat = { label: string; value: ReactNode; color?: string };

type PageHeaderProps = {
  icon: ModuleKey;
  title: ReactNode;
  description?: ReactNode;
  stats?: PageHeaderStat[];
  actions?: ReactNode;
};

/**
 * Sayfa üst kartı — modül ikonu + başlık + açıklama + (opsiyonel) istatistik
 * rozetleri + aksiyon butonları. Daha önce her sayfa kendi `<h1 className=
 * "text-lg font-black">` satırını tek başına, ikonsuz/açıklamasız tekrar
 * ediyordu — bu, "hasta"/"firma" sayfalarında zaten kanıtlanmış (icon + eyebrow
 * + açıklama) düzeni tek bir yerde toplar ki her sayfa aynı düz "admin paneli"
 * başlığını tekrar tekrar el yazmasın.
 */
export function PageHeader({ icon, title, description, stats, actions }: PageHeaderProps) {
  return (
    <div className="ui-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <ModuleIcon module={icon} size="lg" />
          <div>
            <h1 className="font-display text-xl font-black tracking-tight text-slate-900">{title}</h1>
            {description && <p className="text-xs font-medium text-slate-500">{description}</p>}
          </div>
        </div>
        {(stats?.length || actions) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {stats?.map((item) => (
              <div key={item.label} className="ui-surface-soft min-w-[104px] px-3.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</span>
                <span className={`text-xl font-black tabular-nums ${item.color || "text-slate-800"}`}>{item.value}</span>
              </div>
            ))}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
