"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./logout-button";

type NavItem = { href: string; icon: string; label: string; module: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/superadmin/panel", icon: "📊", label: "Kontrol Paneli", module: "dashboard" },
      { href: "/superadmin/institutions", icon: "🏢", label: "Klinikler", module: "institutions" },
      { href: "/superadmin/users", icon: "👥", label: "Kullanıcılar", module: "users" },
      { href: "/superadmin/reports", icon: "📈", label: "Raporlar", module: "reports" },
    ],
  },
  {
    label: "Faturalandırma",
    items: [
      { href: "/superadmin/invoices", icon: "💳", label: "Faturalar ve Ödemeler", module: "invoices" },
    ],
  },
  {
    label: "SMS ve İletişim",
    items: [
      { href: "/superadmin/sms-packages", icon: "📱", label: "SMS Paketleri", module: "sms" },
      { href: "/superadmin/sms-stock", icon: "📦", label: "SMS Stok", module: "sms" },
      { href: "/superadmin/sms-templates", icon: "✉️", label: "SMS Şablonları", module: "sms" },
      { href: "/superadmin/sms-provider", icon: "🔌", label: "SMS API Bağlantısı", module: "sms" },
      { href: "/superadmin/announcements", icon: "📢", label: "Duyurular", module: "announcements" },
      { href: "/superadmin/support", icon: "🎧", label: "Destek Talepleri", module: "support" },
    ],
  },
  {
    label: "Pazarlama",
    items: [
      { href: "/superadmin/ads", icon: "📣", label: "Reklamlar", module: "ads" },
    ],
  },
  {
    label: "Yetkilendirme",
    items: [
      { href: "/superadmin/role-permissions", icon: "🧩", label: "Rol Yetkileri", module: "roles" },
      { href: "/superadmin/admins", icon: "🛡️", label: "Admin Yetkileri", module: "admins" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/superadmin/smtp", icon: "📧", label: "SMTP Ayarları", module: "smtp" },
      { href: "/superadmin/onam", icon: "📝", label: "Onam Paketi", module: "settings" },
      { href: "/superadmin/tema", icon: "🎨", label: "Tema", module: "settings" },
      { href: "/superadmin/settings", icon: "⚙️", label: "Sistem Ayarları", module: "settings" },
      { href: "/superadmin/audit", icon: "🔍", label: "Denetim Günlüğü", module: "audit" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function Sidebar() {
  const pathname = usePathname();
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/superadmin/permissions")
      .then((r) => r.json())
      .then((d: { modules?: string[] }) => {
        if (Array.isArray(d.modules)) setModules(d.modules);
        else setModules(ALL_ITEMS.map((i) => i.module));
      })
      .catch(() => setModules(ALL_ITEMS.map((i) => i.module)));
  }, []);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: modules.length > 0 ? group.items.filter((item) => modules.includes(item.module)) : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="flex h-full w-64 flex-col overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="border-b border-slate-700 p-5">
        <h1 className="text-lg font-black tracking-tight">Sistem Yönetimi</h1>
        <p className="mt-0.5 text-xs text-slate-400">Yetkili yönetim paneli</p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-primary font-semibold text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700 p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
