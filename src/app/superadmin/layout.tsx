import { decodeTokenUser } from "@/lib/auth";
import Sidebar from "./sidebar";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import MobileSidebarToggle from "./mobile-sidebar-toggle";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await decodeTokenUser();

  // Login sayfası (/superadmin) için sidebar olmadan render et
  if (!user || user.role !== "SUPERADMIN") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--app-bg))]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[rgb(var(--app-surface))]/95 px-3 shadow-[0_1px_0_rgb(15_23_42/0.025),0_6px_20px_rgb(15_23_42/0.025)] backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileSidebarToggle />
            <h2 className="truncate font-display text-sm font-bold text-slate-800">Sistem Yönetimi</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden text-sm font-semibold text-slate-700 sm:inline">{user.fullName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-xs font-bold text-white shadow-[0_2px_6px_rgb(var(--app-primary)/0.3)]">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="panel-content flex-1 overflow-y-auto p-3 sm:p-6">
          <ConfirmProvider>{children}</ConfirmProvider>
        </main>
      </div>
    </div>
  );
}
