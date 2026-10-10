import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın kendi ilk yüklemesiyle aynı iskelet (önceden iki farklı iskelet art
// arda görünüyordu: ızgara → düz gri kutu → ızgara). Telefonda sayfa Liste
// görünümüyle açılır: ilk karede takvim görünüp listeye geçmesin diye telefonda
// liste, geniş ekranda takvim iskeleti (CSS ile seçilir).
export default function Loading() {
  return <PageSkeleton toolbar="bare" body="calendar" mobileBody="table" columns={3} label="Randevular yükleniyor" />;
}
