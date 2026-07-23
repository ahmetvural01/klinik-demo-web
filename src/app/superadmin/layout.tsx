import { decodeTokenUser } from "@/lib/auth";
import Sidebar from "./sidebar";
import ConfirmProvider from "@/components/ui/ConfirmProvider";

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = decodeTokenUser();

  // Login sayfası (/superadmin) ve zorunlu 2FA kurulum ekranı için sidebar
  // olmadan render et — henüz 2FA kurulmamış bir oturuma tüm menüyü gösterip
  // sonra her tıklamada engellemek kafa karıştırır, o ekran kendi başına durur.
  if (!user || user.role !== "SUPERADMIN" || user.mustSetup2fa) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-slate-100 bg-white px-6 flex items-center justify-between shadow-sm flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-700">Sistem Yönetimi</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{user.fullName}</span>
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <ConfirmProvider>{children}</ConfirmProvider>
        </main>
      </div>
    </div>
  );
}
