"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./logout-button";

const NAV_ITEMS = [
  { href: "/superadmin/panel", icon: "📊", label: "Dashboard", module: "dashboard" },
  { href: "/superadmin/institutions", icon: "🏢", label: "Klinikler", module: "institutions" },
  { href: "/superadmin/users", icon: "👥", label: "Kullanıcılar", module: "users" },
  { href: "/superadmin/role-permissions", icon: "🧩", label: "Rol Yetkileri", module: "roles" },
  { href: "/superadmin/invoices", icon: "💳", label: "Faturalar", module: "invoices" },
  { href: "/superadmin/sms-packages", icon: "📱", label: "SMS Paketleri", module: "sms" },
  { href: "/superadmin/sms-stock", icon: "📦", label: "SMS Stok", module: "sms" },
  { href: "/superadmin/sms-templates", icon: "✉️", label: "SMS Şablonları", module: "sms" },
  { href: "/superadmin/sms-provider", icon: "🔌", label: "SMS API", module: "sms" },
  { href: "/superadmin/ads", icon: "📣", label: "Reklamlar", module: "ads" },
  { href: "/superadmin/announcements", icon: "📢", label: "Duyurular", module: "announcements" },
  { href: "/superadmin/support", icon: "🎧", label: "Destek", module: "support" },
  { href: "/superadmin/smtp", icon: "📧", label: "SMTP", module: "smtp" },
  { href: "/superadmin/onam", icon: "📝", label: "Onam Paketi", module: "settings" },
  { href: "/superadmin/tema", icon: "🎨", label: "Tema", module: "settings" },
  { href: "/superadmin/settings", icon: "⚙️", label: "Sistem Ayarları", module: "settings" },
  { href: "/superadmin/audit", icon: "🔍", label: "Denetim Günlüğü", module: "audit" },
  { href: "/superadmin/admins", icon: "🛡️", label: "Admin Yetkileri", module: "admins" },
  { href: "/superadmin/reports", icon: "📈", label: "Raporlar", module: "reports" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/superadmin/permissions")
      .then((r) => r.json())
      .then((d: { modules?: string[] }) => {
        if (Array.isArray(d.modules)) setModules(d.modules);
        else setModules(NAV_ITEMS.map((i) => i.module));
      })
      .catch(() => setModules(NAV_ITEMS.map((i) => i.module)));
  }, []);

  const visibleItems = modules.length > 0
    ? NAV_ITEMS.filter((item) => modules.includes(item.module))
    : NAV_ITEMS;

  return (
    <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-lg font-black tracking-tight">Sistem Yönetimi</h1>
        <p className="text-xs text-slate-400 mt-0.5">Yetkili yönetim paneli</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white font-semibold"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <LogoutButton />
      </div>
    </aside>
  );
}
