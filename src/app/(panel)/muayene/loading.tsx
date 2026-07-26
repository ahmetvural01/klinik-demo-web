// Bu sayfa artık statik bir "taşındı" bilgilendirmesi — gerçek içerik küçük
// bir kart, generic PanelLoading (tam dashboard iskeleti) burada boyut
// uyuşmazlığından zıplamaya yol açıyordu.
export default function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
