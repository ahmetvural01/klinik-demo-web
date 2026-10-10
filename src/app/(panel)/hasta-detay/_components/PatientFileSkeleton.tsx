import { DetailSkeleton, Skeleton, TabsSkeleton } from "@/components/ui/PageSkeleton";

/**
 * Hasta dosyasının TEK yükleniyor görünümü: rota geçişi (loading.tsx), sayfa
 * parçası inerken (page.tsx) ve veri gelirken (içerik) aynı iskelet çizilir.
 * Önceden üç farklı taslak art arda görünüyor, sayfa iki kez zıplıyordu.
 * Ölçüler gerçek başlıkla aynı: geri bağlantısı, 36 px ikon, ad, kimlik satırı,
 * sağda düğmeler, 7 sekme ve iki sütunlu özet.
 *
 * Sunucu bileşeninde de çalışır (hook yok).
 */
export function PatientFileSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div aria-hidden="true" className="space-y-4">
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg !bg-slate-200" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex h-4 items-center"><Skeleton className="h-3 w-16 !bg-slate-200" /></div>
              <div className="flex h-7 items-center"><Skeleton className="h-5 w-48 max-w-full !bg-slate-200" /></div>
              <div className="mt-0.5 flex h-5 items-center"><Skeleton className="h-3.5 w-64 max-w-full !bg-slate-200" /></div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-10 w-32 rounded-md !bg-slate-200" />
            <Skeleton className="h-10 w-24 rounded-md !bg-slate-200" />
          </div>
        </div>
        <TabsSkeleton count={7} />
        <DetailSkeleton pairs={6} columns={2} />
      </div>
      <span role="status" className="sr-only">Hasta dosyası yükleniyor</span>
    </div>
  );
}
