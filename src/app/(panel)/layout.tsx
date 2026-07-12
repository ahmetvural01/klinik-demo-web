import { redirect } from "next/navigation";
import { getCurrentUserFast } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PanelRouteWarmup } from "@/components/layout/panel-route-warmup";
import { PanelRealtimeSync } from "@/components/realtime/panel-realtime-sync";
import { PanelCacheReset } from "@/components/layout/panel-cache-reset";
import ToastWrapper from "@/components/ui/ToastWrapper";
import ConfirmProvider from "@/components/ui/ConfirmProvider";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUserFast();

  if (!user) {
    redirect("/giris");
  }

  // Fotoğraf JWT'ye gömülmez (data-URL büyük olabilir) — sidebar/topbar
  // avatarı için tek, hafif bir DB sorgusuyla ayrıca alınır.
  const profile = await prisma.profile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }).catch(() => null);
  const photoUrl = profile?.photoUrl || null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <PanelRealtimeSync />
      <PanelRouteWarmup />
      <PanelCacheReset />
      <Sidebar user={{ fullName: user.fullName, role: user.rawRole, photoUrl }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={{ fullName: user.fullName, role: user.role, photoUrl }} />
        <main className="panel-content flex-1 overflow-y-auto px-3 pb-4 pt-0 sm:px-5 sm:pb-5">
          <ToastWrapper>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastWrapper>
        </main>
      </div>
    </div>
  );
}
