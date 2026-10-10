import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFast } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PanelRealtimeSync } from "@/components/realtime/panel-realtime-sync";
import { PanelCacheReset } from "@/components/layout/panel-cache-reset";
import { BillingStatusBanner } from "@/components/layout/billing-status-banner";
import { GhostModeBanner } from "@/components/layout/ghost-mode-banner";
import ToastWrapper from "@/components/ui/ToastWrapper";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import { PermissionProvider } from "@/components/auth/PermissionProvider";
import { PanelRouteGuard } from "@/components/auth/PanelRouteGuard";
import { getPermissionMap } from "@/lib/role-permission-store";
import { getBillingStatus } from "@/lib/billing";
import { MENU_COLLAPSED_COOKIE } from "@/lib/nav";
import { safeLoginNextPath } from "@/lib/routes";
import type { Role } from "@prisma/client";
import { getBranchScopedPermissions, resolveBranchContext } from "@/lib/branch-context";

/**
 * Logo adresi: https logosu olduğu gibi; yüklenmiş (data URL) logo HTML'e
 * gömülmez, sürüm parametreli ve önbelleklenen hafif uçtan gelir.
 */
function brandLogoSrc(logo: string | null | undefined, updatedAt: Date | null | undefined) {
  const value = (logo || "").trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("data:image/")) return `/api/panel-summary/logo?v=${updatedAt ? updatedAt.getTime() : 0}`;
  return null;
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFast();

  if (!user) {
    // Doğrudan klinik girişine (/giris → /klinik/giris ikinci yönlendirmesi olmadan).
    // Oturum middleware'den sonra geçersiz kaldıysa (ör. süresi tam o an doldu)
    // middleware'deki gibi açılmak istenen sayfa `next` ile taşınır.
    const next = safeLoginNextPath((await headers()).get("x-pathname"));
    redirect(`/klinik/giris?${new URLSearchParams(next ? { next, neden: "oturum" } : { neden: "oturum" }).toString()}`);
  }

  // Kliniğe bağlı olmayan platform oturumu klinik ekranlarında hiçbir veri
  // göremez; boş ve kısıtlı bir panel göstermek yerine sistem sahibi gireceği
  // kliniği seçer. Profil (kendi şifresi ve 2FA'sı) bu oturumla da çalışır.
  if (user.rawRole === "SUPERADMIN" && !user.ghost) {
    const pathname = (await headers()).get("x-pathname") || "";
    if (!pathname.startsWith("/profil")) redirect("/superadmin/institutions");
  }

  // Kliniğe girmiş süperadmin (ghost) tam yetkilidir; bantdaki Görünüm
  // seçiminden bir rol seçerse ekran o rolün yetkilerine daralır.
  const elevated = user.ghost && !user.previewRole;
  // Ödeme uyarısı kliniğe yöneliktir; sistem sahibi bunu platform panelinde görür.
  const showBilling = user.rawRole !== "SUPERADMIN" && !elevated && Boolean(user.institution);

  // Kabuğun ihtiyacı olan her şey tek turda (paralel): önceden yetki matrisi
  // ikinci bir sıralı turda okunuyor; logo, şubeler ve ödeme durumu ise sayfa
  // açıldıktan sonra üç ayrı istekle geliyor ve içeriği kaydırıyordu.
  // Fotoğraf JWT'ye gömülmez (data-URL büyük olabilir) — ayrı hafif sorgu.
  const [profile, institution, branchContext, permissionMap, billingStatus, cookieStore] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }).catch(() => null),
    user.institution
      ? prisma.institution.findUnique({
          where: { id: user.institution },
          select: { whatsappEnabled: true, name: true, logo: true, updatedAt: true, settings: { select: { institutionName: true } } },
        }).catch(() => null)
      : Promise.resolve(null),
    resolveBranchContext({
      id: user.id,
      role: user.rawRole,
      institutionId: user.institution || null,
      ghost: elevated,
    }),
    getPermissionMap(),
    showBilling ? getBillingStatus(user.institution).catch(() => null) : Promise.resolve(null),
    cookies(),
  ]);
  // Süperadmin klinik yöneticisinin fotoğrafıyla değil kendi baş harfleriyle görünür.
  const photoUrl = user.ghost ? null : profile?.photoUrl || null;
  const permissions = getBranchScopedPermissions(
    branchContext,
    permissionMap[user.role as Role] || [],
    elevated,
  );
  const scopeKey = `${user.id}:${user.institution || "platform"}:${branchContext.activeBranchId || "none"}`;

  const institutionName = user.ghost ? institution?.name || "" : "";
  // Kliniğe girmiş süperadmin üst çubukta kendi rolünü görür.
  const topbarRole = user.ghost && !user.previewRole ? "SUPERADMIN" : user.role;
  // İstemciye yalnız seçici için gereken alanlar gider (şube izin kodları gitmez).
  const branchSwitcherData = {
    activeBranchId: branchContext.activeBranchId,
    branches: branchContext.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      colorCode: branch.colorCode,
      isHeadquarters: branch.isHeadquarters,
    })),
  };

  return (
    <PermissionProvider
      role={user.role}
      permissions={permissions}
      features={{ whatsapp: Boolean(institution?.whatsappEnabled) }}
      scopeKey={scopeKey}
      userId={user.id}
      ghost={user.ghost}
    >
    <div className="panel-body flex h-dvh overflow-hidden bg-[rgb(var(--app-bg))]">
      <PanelRealtimeSync />
      <PanelCacheReset scopeKey={scopeKey} rolePreviewSession={user.ghost} />
      <Sidebar
        initialBrandName={institution?.settings?.institutionName || institution?.name || ""}
        brandLogoSrc={brandLogoSrc(institution?.logo, institution?.updatedAt)}
        initialCollapsed={cookieStore.get(MENU_COLLAPSED_COOKIE)?.value === "1"}
        branchContext={branchSwitcherData}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          user={{ id: user.id, fullName: user.displayName, role: topbarRole, photoUrl, ghost: user.ghost }}
          branchContext={branchSwitcherData}
        />
        {/* relative: içerikteki sr-only (absolute) öğeler body'ye göre yerleşip belgeyi uzatmasın. */}
        <main className="panel-content relative flex-1 overscroll-contain overflow-y-auto px-3 pb-4 pt-0 sm:px-4 sm:pb-5 lg:px-5">
          {/* Bantlar içerikle birlikte kayar: telefonda ekranın dörtte birini kalıcı kaplamasın. */}
          {user.ghost && <GhostModeBanner institutionName={institutionName} previewRole={user.previewRole} />}
          {showBilling && <BillingStatusBanner initialStatus={billingStatus} />}
          <ToastWrapper>
            <ConfirmProvider><PanelRouteGuard>{children}</PanelRouteGuard></ConfirmProvider>
          </ToastWrapper>
        </main>
      </div>
    </div>
    </PermissionProvider>
  );
}
