// Bu sayfa artık statik bir "taşındı" bilgilendirmesi — gerçek içerik küçük
// bir kart, generic PanelLoading (tam dashboard iskeleti) burada boyut
// uyuşmazlığından zıplamaya yol açıyordu.
import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Spinner className="h-6 w-6 text-primary" />
    </div>
  );
}
