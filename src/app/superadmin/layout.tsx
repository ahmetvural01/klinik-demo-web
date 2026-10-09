import { decodeTokenUser } from "@/lib/auth";
import Sidebar from "./sidebar";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import ToastWrapper from "@/components/ui/ToastWrapper";
import MobileSidebarToggle from "./mobile-sidebar-toggle";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await decodeTokenUser();

  // Login sayfası (/superadmin) için sidebar olmadan render et
  if (!user || user.role !== "SUPERADMIN") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[rgb(var(--app-bg))]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Üst çubuk sayfa adını tekrar etmez (her sayfanın kendi başlığı var);
            yalnız telefonda menü düğmesi ve ürün adı görünür. */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[rgb(var(--app-surface))]/95 px-3 shadow-[0_1px_0_rgb(15_23_42/0.025)] backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileSidebarToggle />
            <span className="truncate font-display text-sm font-bold text-slate-800 md:hidden">Platform Yönetimi</span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden text-sm font-semibold text-slate-700 sm:inline">{user.fullName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white" aria-hidden="true">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Toast sağlayıcısı önceden yalnız klinik panelinde vardı: platform
            yönetimindeki tüm "kaydedildi / hata" bildirimleri sessizce
            kayboluyordu. */}
        <main className="panel-content flex-1 overscroll-contain overflow-y-auto px-3 pb-6 pt-0 sm:px-4 lg:px-5">
          <ToastWrapper>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastWrapper>
        </main>
      </div>
    </div>
  );
}
