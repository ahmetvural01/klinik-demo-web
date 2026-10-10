/** Tarayıcı üst çubuğu — tanıtımdaki ürün maketlerinin TEK pencere çubuğu. */
export function BrowserBar({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-900 px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
      <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
      <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
      <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-400">
        {path}
      </span>
    </div>
  );
}
