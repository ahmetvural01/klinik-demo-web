// Bu sayfa yalnızca /muhasebe'ye yönlendirir — gerçek bir içeriği yok, bu
// yüzden burada tam sayfa iskelet göstermek (PanelLoading) hedef sayfanın
// kendi iskeletiyle üst üste binip çifte zıplama yaratıyordu.
import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Spinner className="h-6 w-6 text-primary" />
    </div>
  );
}
