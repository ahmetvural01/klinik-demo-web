export default function PanelLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-52 rounded-lg bg-slate-200" />
          <div className="h-4 w-36 rounded bg-slate-100" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-slate-200" />
      </div>
      {/* KPI satırı */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-200" />
        ))}
      </div>
      {/* Tablo skeleton */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="h-12 border-b border-slate-100 bg-slate-50" />
        <div className="divide-y divide-slate-50">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded bg-slate-200" style={{ width: `${70 - i * 5}%` }} />
                <div className="h-3 rounded bg-slate-100" style={{ width: `${50 - i * 3}%` }} />
              </div>
              <div className="h-6 w-16 rounded-full bg-slate-200" />
              <div className="h-7 w-20 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
