// Bu sayfa yalnızca /muhasebe'ye yönlendirir — gerçek bir içeriği yok, bu
// yüzden burada tam sayfa iskelet göstermek (PanelLoading) hedef sayfanın
// kendi iskeletiyle üst üste binip çifte zıplama yaratıyordu.
export default function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
