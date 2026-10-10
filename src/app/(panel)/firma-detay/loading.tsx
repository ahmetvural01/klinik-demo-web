import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Tedarikçi sayfası: başlık → sekmeler → filtre → hesap hareketleri tablosu.
export default function Loading() {
  return <PageSkeleton tabs={3} toolbar="inset" body="table" columns={6} label="Tedarikçi yükleniyor" />;
}
