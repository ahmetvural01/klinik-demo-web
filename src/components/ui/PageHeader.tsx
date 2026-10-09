import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

export type PageHeaderStat = { label: string; value: ReactNode; color?: string };

type PageHeaderProps = {
  icon: ModuleKey;
  title: ReactNode;
  description?: ReactNode;
  /** Sayfanın genel durumunu özetleyen en fazla 2-3 kısa sayı (listede zaten görünmeyen). */
  stats?: PageHeaderStat[];
  /** Sağdaki eylemler: sayfanın TEK birincil eylemi + gerekirse 1-2 ikincil eylem. */
  actions?: ReactNode;
  /** Detay sayfalarında üst listeye dönüş bağlantısı (ör. { href: "/hasta", label: "Hastalar" }). */
  back?: { href: string; label: string };
};

/**
 * Sayfa başlığı — her sayfada aynı: küçük modül ikonu, sayfa adı, bir satır
 * açıklama, sağda eylemler. Kart/gradyan/süs etiketi yok: başlık içeriğin
 * üstünde sade durur, ekranda tekrar eden kutu sayısını azaltır. Üst bar
 * sayfa adını ayrıca yazmaz (tek başlık).
 */
export function PageHeader({ icon, title, description, stats, actions, back }: PageHeaderProps) {
  return (
    <div className="ui-page-header flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <ModuleIcon module={icon} size="lg" className="shrink-0" />
        <div className="min-w-0">
          {back && (
            <Link href={back.href} className="mb-0.5 inline-flex items-center gap-0.5 text-xs font-semibold text-slate-500 hover:text-primary">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {back.label}
            </Link>
          )}
          <h1 className="ui-page-header-title truncate font-display text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          {stats && stats.length > 0 && (
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {stats.map((item) => (
                <div key={item.label} className="inline-flex items-baseline gap-1">
                  <dt>{item.label}</dt>
                  <dd className={`font-bold tabular-nums ${item.color || "text-slate-800"}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {actions && <div className="ui-page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
