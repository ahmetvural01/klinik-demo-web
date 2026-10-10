import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + araç çubuğu + talep listesi (sayfada özet kutusu yok).
export default function Loading() {
  return <PageSkeleton toolbar body="table" rows={6} columns={4} label="Destek yükleniyor" />;
}
