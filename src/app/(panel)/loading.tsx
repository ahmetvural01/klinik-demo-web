export default function PanelLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-start justify-center px-5 py-6">
      <div className="w-full max-w-5xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="h-4 w-52 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
