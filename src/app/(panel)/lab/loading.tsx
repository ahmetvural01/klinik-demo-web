import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + 5 sekme + araç çubuğu + 4 sütunlu liste
// (önceden sayfada olmayan 4 özet kutusu çiziliyor, içerik gelince zıplıyordu).
export default function Loading() {
  return <PageSkeleton tabs={5} toolbar body="table" rows={8} columns={4} label="Laboratuvar yükleniyor" />;
}
