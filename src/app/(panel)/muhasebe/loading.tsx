export default function Loading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-14 animate-pulse rounded-2xl border border-slate-100 bg-white" />
      <div className="flex gap-1 rounded-2xl border border-slate-100 bg-white p-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-10 flex-1 animate-pulse rounded-xl bg-slate-100" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="h-10 border-b bg-slate-50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-4 py-3">
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
          </div>
        ))}
      </div>
    </section>
  );
}
