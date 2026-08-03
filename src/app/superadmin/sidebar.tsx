"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./logout-button";

type NavItem = { href: string; icon: string; label: string; module: string };
type NavGroup = { label: string; items: NavItem[] };

/**
 * Klinik panelindeki `ModuleIcon` sistemiyle aynı hazır görsel kaynağı
 * (Microsoft Fluent Emoji Flat, MIT — bkz. ModuleIcon.tsx) kullanır. Önceden
 * bu sidebar çıplak emoji karakterleri (📊🏢💳 vb.) kullanıyordu — "eski
 * yönetim paneli" hissinin en görünür nedeniydi. Bazı ikonlar klinik
 * panelindeki dosyalarla paylaşılır (aynı modül kavramı), bazıları
 * Superadmin'e özgü yeni indirilen dosyalardır (public/icons/modules/
 * superadmin-*.svg).
 */
const ICON_SRC: Record<string, string> = {
  dashboard: "/icons/modules/chart.svg",
  institutions: "/icons/modules/superadmin-institutions.svg",
  reports: "/icons/modules/rapor.svg",
  invoices: "/icons/modules/hakedis.svg",
  sms: "/icons/modules/sms.svg",
  announcements: "/icons/modules/superadmin-announcements.svg",
  support: "/icons/modules/support.svg",
  ads: "/icons/modules/superadmin-ads.svg",
  roles: "/icons/modules/superadmin-roles.svg",
  admins: "/icons/modules/superadmin-admins.svg",
  settings: "/icons/modules/settings.svg",
  smtp: "/icons/modules/superadmin-smtp.svg",
  audit: "/icons/modules/superadmin-audit.svg",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/superadmin/panel", icon: "dashboard", label: "Kontrol Paneli", module: "dashboard" },
      { href: "/superadmin/institutions", icon: "institutions", label: "Klinikler", module: "institutions" },
      { href: "/superadmin/reports", icon: "reports", label: "Raporlar", module: "reports" },
    ],
  },
  {
    label: "Faturalandırma",
    items: [
      { href: "/superadmin/invoices", icon: "invoices", label: "Faturalar ve Ödemeler", module: "invoices" },
    ],
  },
  {
    label: "SMS ve İletişim",
    items: [
      { href: "/superadmin/sms", icon: "sms", label: "SMS Yönetimi", module: "sms" },
      { href: "/superadmin/announcements", icon: "announcements", label: "Duyurular", module: "announcements" },
      { href: "/superadmin/support", icon: "support", label: "Destek Talepleri", module: "support" },
    ],
  },
  {
    label: "Pazarlama",
    items: [
      { href: "/superadmin/ads", icon: "ads", label: "Reklamlar", module: "ads" },
    ],
  },
  {
    label: "Yetkilendirme",
    items: [
      { href: "/superadmin/role-permissions", icon: "roles", label: "Rol Yetkileri", module: "roles" },
      { href: "/superadmin/admins", icon: "admins", label: "Admin Yetkileri", module: "admins" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/superadmin/sistem", icon: "settings", label: "Sistem Ayarları", module: "settings" },
      { href: "/superadmin/smtp", icon: "smtp", label: "SMTP Ayarları", module: "smtp" },
      { href: "/superadmin/audit", icon: "audit", label: "Denetim Günlüğü", module: "audit" },
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
    <aside className="flex h-full w-64 flex-col overflow-hidden border-r border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/60 shadow-[4px_0_24px_rgb(15_23_42/0.05)]">
      <div className="border-b border-slate-100 p-5">
        <h1 className="font-display text-lg font-black tracking-tight text-slate-900">Sistem Yönetimi</h1>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">Yetkili yönetim paneli</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {visibleGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-1.5 border-t border-slate-100 pt-1.5" : ""}>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const src = ICON_SRC[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group grid h-11 grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 rounded-lg px-3 text-sm transition-all duration-150 active:scale-[0.98] active:duration-75 ${
                      isActive
                        ? "bg-primary-50/80 font-bold text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]"
                        : "font-semibold text-slate-700 hover:bg-slate-100/70 hover:text-slate-950"
                    }`}
                  >
                    <span className="module-icon" data-active={isActive ? "true" : "false"} aria-hidden="true">
                      {src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" width={29} height={29} draggable={false} className="module-icon-img" />
                      )}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
