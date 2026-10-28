import { decodeTokenUser } from "@/lib/auth";
import Sidebar from "./sidebar";
import AccountMenu from "./account-menu";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import ToastWrapper from "@/components/ui/ToastWrapper";
import MobileSidebarToggle from "./mobile-sidebar-toggle";

// Platform yöneticisi alanı gizli: herkese açık sayfalardan bağlantı verilmez,
// arama motorları da dizine eklemez (adresi yalnız sistem sahibi bilir).
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await decodeTokenUser();

  // Login sayfası (/superadmin) için sidebar olmadan render et
  if (!user || user.role !== "SUPERADMIN") {
    return <>{children}</>;
  }

  return (
    <div className="panel-body flex h-dvh overflow-hidden bg-[rgb(var(--app-bg))]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Üst çubuk sayfa adını tekrar etmez (her sayfanın kendi başlığı var);
            telefonda menü düğmesi ve ürün adı, sağda klinik panelindeki gibi
            hesap menüsü (Profilim, Oturumu kapat). */}
        {/* relative z-[160] isolate: klinik üst çubuğuyla aynı katman. Önceden
            hesap menüsü görünüyor ama altındaki (sonra çizilen, konumlu) içerik
            alanı tıklamayı yutuyordu: "Profilim" ve "Oturumu kapat" çalışmıyordu. */}
        <header className="relative z-[160] isolate flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[rgb(var(--app-surface))]/95 px-3 shadow-[0_1px_0_rgb(15_23_42/0.025)] backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileSidebarToggle />
            <span className="truncate font-display text-sm font-bold text-slate-800 lg:hidden">Platform Yönetimi</span>
          </div>
          <AccountMenu name={user.fullName} />
        </header>

        {/* Toast sağlayıcısı önceden yalnız klinik panelinde vardı: platform
            yönetimindeki tüm "kaydedildi / hata" bildirimleri sessizce
            kayboluyordu. `relative`: içerideki sr-only öğeler kaydırma
            alanına göre konumlansın (yoksa sayfa kendiliğinden kayıyordu). */}
        <main className="panel-content relative flex-1 overscroll-contain overflow-y-auto px-3 pb-6 pt-0 sm:px-4 lg:px-5">
          <ToastWrapper>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastWrapper>
        </main>
      </div>
    </div>
  );
}
