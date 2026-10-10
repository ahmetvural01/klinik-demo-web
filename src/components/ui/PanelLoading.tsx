import { PageSkeleton } from "@/components/ui/PageSkeleton";

/**
 * Eski genel yükleniyor görünümü — mevcut çağrılar (loading.tsx'ler, ayar,
 * profil, sms ayarları, sistem izleme) bozulmasın diye duruyor. Kalıp aynı:
 * üst şerit + 4 özet kutusu + liste. Satır satır gecikmeli nabız kaldırıldı
 * (sözleşme §6); çizim PageSkeleton'dan gelir.
 *
 * Yeni kodda sayfanın biçimine uyan PageSkeleton kullanın (form sayfasında
 * özet kutusu, takvimde tablo görünmesin):
 *   <PageSkeleton header={false} body="form" />
 */
export default function PanelLoading() {
  return <PageSkeleton header={false} toolbar stats={4} body="table" rows={5} />;
}
