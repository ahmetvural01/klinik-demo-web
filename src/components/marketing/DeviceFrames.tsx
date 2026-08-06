import type { ReactNode } from "react";

/** Dizüstü bilgisayar çerçevesi — pazarlama sitesindeki tüm ürün maketleri
 * bu tek çerçeveyi paylaşır ki cihaz görselleri arasında tutarlılık olsun. */
export function LaptopFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="rounded-t-2xl rounded-b-md border border-slate-300 bg-slate-800 p-2 shadow-2xl shadow-slate-300/60 sm:p-2.5">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">{children}</div>
      </div>
      <div className="mx-auto h-3 w-[92%] rounded-b-xl bg-slate-700" />
      <div className="mx-auto h-1.5 w-3/5 rounded-b-md bg-slate-800/70" />
    </div>
  );
}

/** Telefon çerçevesi — mobil görünümü göstermek için. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-[220px] rounded-[1.75rem] border-4 border-slate-800 bg-slate-800 p-1.5 shadow-2xl shadow-slate-300/60 ${className}`}>
      <div className="relative overflow-hidden rounded-[1.25rem] border border-slate-700 bg-slate-900">
        <div className="absolute left-1/2 top-1.5 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-slate-800" />
        {children}
      </div>
    </div>
  );
}

/** Tarayıcı üst çubuğu — masaüstü ekranlarının tepesinde tekrar eder. */
export function BrowserBar({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
      <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-400">
        {path}
      </span>
    </div>
  );
}
