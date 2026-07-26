export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="flex gap-1 rounded-xl border border-slate-100 bg-white p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 flex-1 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
    </div>
  );
}
