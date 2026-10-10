import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık → 5 sekme → arama/filtre → ürün tablosu.
export default function Loading() {
  return <PageSkeleton tabs={5} toolbar body="table" columns={6} label="Stok yükleniyor" />;
}
