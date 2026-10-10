import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Spinner } from "@/components/ui/Spinner";
import { decodeTokenUser } from "@/lib/auth";

// Platform sayfaları sekmeyi adres satırından okur (useTabParam →
// useSearchParams). Bu yükleme sınırı onları Suspense içine alır; olmadan
// üretim derlemesi ön-render sırasında durur. Görünüm platform sayfalarının
// çoğunun biçimidir (başlık + liste); eski sabit "4 kutu + liste" iskeleti
// hiçbir sayfaya uymuyordu.
//
// Oturum yokken /superadmin giriş ekranıdır: orada tablo iskeleti yanlış bir
// beklenti veriyordu; sade bir gösterge yeter (layout da aynı kontrolle menüyü
// yalnız süperadmin oturumunda çizer).
export default async function SuperadminLoading() {
  const user = await decodeTokenUser();
  if (!user || user.role !== "SUPERADMIN") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[rgb(var(--app-bg))] text-primary">
        <Spinner className="h-8 w-8" label="Yükleniyor" />
      </div>
    );
  }
  return <PageSkeleton body="table" label="Sayfa yükleniyor" />;
}
