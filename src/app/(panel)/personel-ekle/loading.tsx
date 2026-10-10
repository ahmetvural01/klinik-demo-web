import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Eski adres Personel sayfasına yönlenir; aynı iskelet.
export default function Loading() {
  return <PageSkeleton toolbar body="table" rows={7} columns={3} label="Personel yükleniyor" />;
}
