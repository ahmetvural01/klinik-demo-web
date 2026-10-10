import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın biçimi: başlık + tek belge (önceden özet kutulu liste iskeleti ve
// ardından ikinci bir yükleniyor simgesi görünüyordu).
export default function Loading() {
  return <PageSkeleton body="form" rows={6} columns={1} label="Reçete yükleniyor" />;
}
