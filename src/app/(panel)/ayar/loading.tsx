import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + 3 sekme + form (önceden sayfada olmayan 4
// özet kutusu çiziliyor, içerik gelince zıplıyordu).
export default function Loading() {
  return <PageSkeleton headerAction={false} tabs={3} body="form" rows={6} columns={2} label="Ayarlar yükleniyor" />;
}
