import type { ComponentType } from "react";

/* eslint-disable @next/next/no-img-element */

type Size = "large" | "medium" | "small";

type Props = {
  title: string;
  benefit?: string;
  features?: string[];
  badge?: string;
  icon?: string;
  size?: Size;
  /** Büyük kartlarda gösterilen gerçek ekran maketi (bkz. ScreenMockups.tsx) */
  Screen?: ComponentType;
};

export function ModuleCard({ title, benefit, features = [], badge, icon, size = "medium", Screen }: Props) {
  if (size === "small") {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#0d7d6f]/30">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            {icon && <img src={`/icons/modules/${icon}.svg`} alt="" width={20} height={20} />}
          </span>
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
        </div>
        {benefit && <p className="mt-2.5 text-xs leading-5 text-slate-600">{benefit}</p>}
      </article>
    );
  }

  if (size === "large") {
    return (
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-200/60 lg:col-span-2">
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                {icon && <img src={`/icons/modules/${icon}.svg`} alt="" width={26} height={26} />}
              </span>
              {badge && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                  {badge}
                </span>
              )}
            </div>
            <h3 className="mt-4 text-base font-black text-slate-900">{title}</h3>
            {benefit && <p className="mt-2 text-sm leading-6 text-slate-600">{benefit}</p>}
            {features.length > 0 && (
              <ul className="mt-4 space-y-2">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[#0d7d6f]" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {Screen && (
            <div className="hidden overflow-hidden border-t border-slate-100 bg-slate-100 lg:block lg:border-l lg:border-t-0">
              <div className="scale-[0.82] origin-top-left w-[122%]">
                <Screen />
              </div>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#0d7d6f]/30 hover:shadow-lg hover:shadow-slate-200/60">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
          {icon && <img src={`/icons/modules/${icon}.svg`} alt="" width={24} height={24} />}
        </span>
        {badge && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-3.5 text-sm font-black text-slate-900">{title}</h3>
      {benefit && <p className="mt-1.5 text-xs leading-5 text-slate-600">{benefit}</p>}
      {features.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[11px] font-semibold text-slate-600">
              <span className="mt-1 h-1 w-1 flex-none rounded-full bg-slate-300" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default ModuleCard;
