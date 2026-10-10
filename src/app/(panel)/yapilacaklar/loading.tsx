import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + iki sekme + araç çubuğu + liste (önceden
// iki eski sayfa da sayfada olmayan 4 özet kutusu gösteriyordu; hız raporu TG4).
export default function Loading() {
  return <PageSkeleton tabs={2} toolbar="inset" body="table" rows={6} label="Yapılacaklar yükleniyor" />;
}
