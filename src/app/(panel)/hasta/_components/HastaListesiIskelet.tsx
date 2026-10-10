"use client";

import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton, Skeleton } from "@/components/ui/PageSkeleton";

/**
 * Hastalar sayfasının TEK yükleniyor görünümü: rota açılırken (loading.tsx)
 * ve sayfa bileşeni hazırlanırken (Suspense) aynı şekil — gerçek başlık,
 * "Yeni hasta" düğmesinin yeri, arama çubuğu ve tablo satırları. Önceden üç
 * farklı iskelet art arda görünüyordu (satır satır gecikmeli nabız, boş kutu,
 * tablo iskeleti) ve içerik gelince sayfa zıplıyordu. Düğme yeri yalnız
 * düğmeyi görecek rolde çizilir: telefonda başlık altındaki satır, düğmesi
 * olmayan rolde (ör. doktor) içerik gelince kaybolup listeyi yukarı itmesin.
 */
export function HastaListesiIskelet() {
  const { can } = usePermissions();
  return (
    <div className="space-y-4">
      <PageHeader
        icon="users"
        title="Hastalar"
        actions={can("patients:write") ? <Skeleton className="h-10 w-32 rounded-md !bg-slate-200" /> : undefined}
      />
      <PageSkeleton header={false} toolbar="inset" body="table" rows={8} columns={6} label="Hastalar yükleniyor" />
    </div>
  );
}
