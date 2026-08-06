"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { getPanelRouteRequirement, hasAnyPanelPermission } from "@/lib/panel-permissions";

export function PanelRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = usePermissions();
  const requirement = getPanelRouteRequirement(pathname);
  const allowed = !requirement || hasAnyPanelPermission(permissions, requirement.anyOf);

  useEffect(() => {
    if (!allowed) router.replace(`/yetkisiz?from=${encodeURIComponent(pathname)}`);
  }, [allowed, pathname, router]);

  return allowed ? children : null;
}
