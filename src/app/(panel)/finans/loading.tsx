export default function Loading() {
  return (
    <section className="space-y-5" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-20 animate-pulse rounded-xl border border-slate-100 bg-white" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map(i => (
          <div key={i} className="h-48 animate-pulse rounded-xl border border-slate-100 bg-white" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </section>
  );
}
