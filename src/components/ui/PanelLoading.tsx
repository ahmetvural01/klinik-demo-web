export default function PanelLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-12 animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />
        ))}
      </div>
      <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
