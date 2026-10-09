import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFast } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PanelRouteWarmup } from "@/components/layout/panel-route-warmup";
import { PanelRealtimeSync } from "@/components/realtime/panel-realtime-sync";
import { PanelCacheReset } from "@/components/layout/panel-cache-reset";
import { BillingStatusBanner } from "@/components/layout/billing-status-banner";
import { GhostModeBanner } from "@/components/layout/ghost-mode-banner";
import { roleLabel } from "@/lib/staff-roles";
import ToastWrapper from "@/components/ui/ToastWrapper";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import { PermissionProvider } from "@/components/auth/PermissionProvider";
import { PanelRouteGuard } from "@/components/auth/PanelRouteGuard";
import { getPermissionMap } from "@/lib/role-permission-store";
import type { Role } from "@prisma/client";
import { getBranchScopedPermissions, resolveBranchContext } from "@/lib/branch-context";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFast();

  if (!user) {
    redirect("/giris");
  }

  // Kliniğe bağlı olmayan platform oturumu klinik ekranlarında hiçbir veri
  // göremez; boş ve kısıtlı bir panel göstermek yerine sistem sahibi gireceği
  // kliniği seçer. Profil (kendi şifresi ve 2FA'sı) bu oturumla da çalışır.
  if (user.rawRole === "SUPERADMIN" && !user.ghost) {
    const pathname = (await headers()).get("x-pathname") || "";
    if (!pathname.startsWith("/profil")) redirect("/superadmin/institutions");
  }

  // Kliniğe girmiş süperadmin (ghost) tam yetkilidir; sol menüdeki Rol
  // Görünümü'nden bir rol seçerse ekran o rolün yetkilerine daralır.
  const elevated = user.ghost && !user.previewRole;

  // Fotoğraf JWT'ye gömülmez (data-URL büyük olabilir) — sidebar/topbar
  // avatarı için tek, hafif bir DB sorgusuyla ayrıca alınır.
  const [profile, institutionFeatures, branchContext] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }).catch(() => null),
    user.institution
      ? prisma.institution.findUnique({
          where: { id: user.institution },
          select: { whatsappEnabled: true, name: true, settings: { select: { institutionName: true } } },
        }).catch(() => null)
      : Promise.resolve(null),
    resolveBranchContext({
      id: user.id,
      role: user.rawRole,
      institutionId: user.institution || null,
      ghost: elevated,
    }),
  ]);
  // Süperadmin klinik yöneticisinin fotoğrafıyla değil kendi baş harfleriyle görünür.
  const photoUrl = user.ghost ? null : profile?.photoUrl || null;
  const permissionMap = await getPermissionMap();
  const permissions = getBranchScopedPermissions(
    branchContext,
    permissionMap[user.role as Role] || [],
    elevated,
  );
  const scopeKey = `${user.id}:${user.institution || "platform"}:${branchContext.activeBranchId || "none"}`;

  const institutionName = user.ghost ? institutionFeatures?.name || "" : "";
  // Kliniğe girmiş süperadmin menüde Rol Görünümü'nü, üst çubukta kendi rolünü görür.
  const sidebarRole = user.ghost ? "SUPERADMIN" : user.rawRole;
  const topbarRole = user.ghost && !user.previewRole ? "SUPERADMIN" : user.role;

  return (
    <PermissionProvider
      role={user.role}
      permissions={permissions}
      features={{ whatsapp: Boolean(institutionFeatures?.whatsappEnabled) }}
      scopeKey={scopeKey}
    >
    <div className="panel-body flex h-dvh overflow-hidden bg-[rgb(var(--app-bg))]">
      <PanelRealtimeSync />
      <PanelRouteWarmup />
      <PanelCacheReset scopeKey={scopeKey} />
      <Sidebar
        user={{ fullName: user.fullName, role: sidebarRole, photoUrl }}
        initialBrandName={institutionFeatures?.settings?.institutionName || institutionFeatures?.name || ""}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={{ fullName: user.fullName, role: topbarRole, photoUrl }} />
        {user.ghost && <GhostModeBanner institutionName={institutionName} previewLabel={user.previewRole ? roleLabel(user.previewRole) : null} />}
        {/* Ödeme uyarısı kliniğe yöneliktir; sistem sahibi bunu platform panelinde görür. */}
        {user.rawRole !== "SUPERADMIN" && !elevated && <BillingStatusBanner />}
        <main className="panel-content flex-1 overscroll-contain overflow-y-auto px-3 pb-4 pt-0 sm:px-4 sm:pb-5 lg:px-5">
          <ToastWrapper>
            <ConfirmProvider><PanelRouteGuard>{children}</PanelRouteGuard></ConfirmProvider>
          </ToastWrapper>
        </main>
      </div>
    </div>
    </PermissionProvider>
  );
}
