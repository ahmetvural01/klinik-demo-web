export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="h-9 border-b bg-gray-100" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
