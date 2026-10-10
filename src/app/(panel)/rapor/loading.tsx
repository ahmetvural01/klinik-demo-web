import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek sırası: başlık → sekmeler → dönem çubuğu → 4 özet sayısı → 2 sütun bölüm
// (önceki iskelet sayaçları sekmelerden önce, farklı köşe ve gecikmeli nabızla çiziyordu).
export default function Loading() {
  return <PageSkeleton headerAction={false} toolbar="bare" stats={4} tabs={3} body="cards" rows={4} columns={2} label="Raporlar yükleniyor" />;
}
