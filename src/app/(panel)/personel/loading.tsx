import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + araç çubuğu + personel listesi.
export default function Loading() {
  return <PageSkeleton toolbar body="table" rows={7} columns={3} label="Personel yükleniyor" />;
}
