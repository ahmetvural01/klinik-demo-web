export default function Loading() {
  return (
    <div className="space-y-4 pt-4" aria-busy="true" aria-label="İletişim yükleniyor">
      <div className="flex items-center gap-3">
        <div className="ui-skeleton-shimmer h-10 w-10 rounded-lg bg-slate-100" />
        <div className="space-y-2">
          <div className="ui-skeleton-shimmer h-5 w-32 rounded bg-slate-100" />
          <div className="ui-skeleton-shimmer h-3 w-72 max-w-full rounded bg-slate-100" />
        </div>
      </div>
      <div className="ui-skeleton-shimmer h-10 w-full max-w-xl rounded-lg bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="ui-skeleton-shimmer h-64 rounded-xl border border-slate-100 bg-white" />
        <div className="ui-skeleton-shimmer h-64 rounded-xl border border-slate-100 bg-white" />
      </div>
    </div>
  );
}
