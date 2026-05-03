import { redirect } from "next/navigation";
import { getCurrentUserFast } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUserFast();

  if (!user) {
    redirect("/giris");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={{ fullName: user.fullName, role: user.role }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={{ fullName: user.fullName, role: user.role }} />
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
