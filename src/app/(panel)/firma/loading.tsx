export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="h-12 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>
  );
}
