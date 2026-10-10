import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık → sekmeler → arama/filtre → tedarikçi tablosu.
export default function Loading() {
  return <PageSkeleton tabs={3} toolbar body="table" columns={5} label="Satın alma yükleniyor" />;
}
