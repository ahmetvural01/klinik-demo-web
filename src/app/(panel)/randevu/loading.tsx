export default function Loading() {
  return (
    <section className="space-y-2" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-12 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="h-9 border-b bg-gray-100" />
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex divide-x border-b">
            <div className="h-12 w-16 shrink-0 bg-white" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-12 flex-1 p-1">
                <div className="h-full w-full animate-pulse rounded bg-slate-100" style={{ animationDelay: `${(i + j) * 20}ms` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
