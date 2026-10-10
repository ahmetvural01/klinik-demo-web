import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + durum sekmeleri + araç çubuğu + liste.
export default function Loading() {
  return <PageSkeleton tabs={5} toolbar body="table" rows={8} columns={5} label="Tedavi planları yükleniyor" />;
}
