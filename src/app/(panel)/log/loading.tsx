import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık (birincil eylem yok) + araç çubuğu + 4 sütunlu liste.
export default function Loading() {
  return <PageSkeleton headerAction={false} toolbar body="table" rows={8} columns={4} label="İşlem kayıtları yükleniyor" />;
}
