import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Sayfanın gerçek biçimi: başlık + kimlik, mesai ve giriş güvenliği bölümleri.
export default function Loading() {
  return <PageSkeleton headerAction={false} body="detail" rows={4} columns={1} label="Profil yükleniyor" />;
}
