import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık (birincil düğme yok), 4 sekme, iki sütunlu
// "Kime / Mesaj" bölümü — açılışta iskelet sayfaya dönüşürken zıplamaz.
export default function Loading() {
  return <PageSkeleton headerAction={false} tabs={4} body="form" rows={4} columns={2} label="İletişim yükleniyor" />;
}
