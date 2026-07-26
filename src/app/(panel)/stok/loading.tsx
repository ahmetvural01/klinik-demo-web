export default function Loading() {
  return (
    <section className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-12 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="h-9 border-b bg-gray-100" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-4 py-3">
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
            <div className="h-4 w-16 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
            <div className="h-4 w-16 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
            <div className="h-7 w-40 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 25}ms` }} />
          </div>
        ))}
      </div>
    </section>
  );
}
