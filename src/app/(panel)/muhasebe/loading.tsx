import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + 3 sekme + araç çubuğu + dönem özeti + liste (açılışta zıplama olmaz).
export default function Loading() {
  return <PageSkeleton tabs={3} toolbar="bare" stats={4} body="table" label="Muhasebe yükleniyor" />;
}
