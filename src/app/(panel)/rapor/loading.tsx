import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek sırası (Özet sekmesi): başlık → 4 sekme → dönem/doktor çubuğu
// → 4 özet sayısı → doktorlara göre tablo (altında en çok yapılan tedaviler).
export default function Loading() {
  return <PageSkeleton headerAction={false} tabs={4} toolbar="bare" stats={4} body="table" rows={4} columns={5} label="Raporlar yükleniyor" />;
}
