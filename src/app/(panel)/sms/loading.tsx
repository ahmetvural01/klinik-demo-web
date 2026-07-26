export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Yükleniyor">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-2xl border border-slate-100 bg-white" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="h-9 border-b bg-gray-100" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 border-b border-slate-50 px-4 py-2">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 30}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
