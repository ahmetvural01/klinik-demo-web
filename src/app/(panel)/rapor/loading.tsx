export default function Loading() {
  return (
    <section className="space-y-5" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-16 animate-pulse rounded-2xl border border-slate-100 bg-white" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
      <div className="flex gap-1 rounded-2xl border border-slate-100 bg-white p-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-10 flex-1 animate-pulse rounded-xl bg-slate-100" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map(i => (
          <div key={i} className="h-60 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </section>
  );
}
