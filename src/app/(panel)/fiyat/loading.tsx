import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + ayar satırı + araç çubuğu + tek fiyat tablosu.
export default function Loading() {
  return <PageSkeleton toolbar body="table" rows={10} columns={4} label="Fiyat listesi yükleniyor" />;
}
