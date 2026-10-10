"use client";

import { usePermissions } from "@/components/auth/PermissionProvider";
import { HomeSkeleton } from "./HomeSkeleton";

/**
 * loading.tsx için: iskelet kullanıcının göreceği düzene göre seçilir
 * (sayfadaki aynı izin koşullarıyla). Randevuları göremeyen rol (ör. Muhasebe)
 * randevu listesi iskeleti görmez; "Yeni randevu" yalnız randevu verebilene,
 * "Bugünkü tahsilat" satırı yalnız finans merkezine erişene — sayfa açılınca
 * başlık ve kartlar yer değiştirmez. İzinler panel düzeninden
 * (PermissionProvider) gelir; sunucu ve tarayıcıda aynı değer — hidrasyon
 * farkı yok, istek yok.
 */
export function HomeLoading() {
  const { can } = usePermissions();
  return (
    <HomeSkeleton
      agenda={can("appointments:read")}
      action={can("appointments:write")}
      stats={can("finance:center") && can("payments:read")}
      announcements={can("announcements:read")}
      messages={can("messages:read")}
    />
  );
}
