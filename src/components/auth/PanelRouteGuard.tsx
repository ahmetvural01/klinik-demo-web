"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { getPanelRouteRequirement, hasAnyPanelPermission } from "@/lib/panel-permissions";

/**
 * Sayfa koruması (görünüm içindir; asıl güvenlik her API'deki requireAuth).
 * Yalnız sunucudan DOĞRULANMIŞ izin listesi bu adresi kapsamıyorsa /yetkisiz'e
 * yönlendirir. Önceden geçici bir ağ/429/5xx hatası izinleri boşaltıyor, sayfa
 * burada unmount olup açık form kayboluyordu; artık hata durumunda son
 * doğrulanmış liste geçerlidir ve bilinmeyen durumda sayfa yerinde kalır.
 */
export function PanelRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions, permissionsVerified } = usePermissions();
  const requirement = getPanelRouteRequirement(pathname);
  const allowed = !requirement || hasAnyPanelPermission(permissions, requirement.anyOf);
  const denied = permissionsVerified && !allowed;

  useEffect(() => {
    if (denied) router.replace(`/yetkisiz?from=${encodeURIComponent(pathname)}`);
  }, [denied, pathname, router]);

  return denied ? null : children;
}
