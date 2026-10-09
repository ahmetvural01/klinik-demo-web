"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import LogoutButton from "./logout-button";

type NavItem = { href: string; icon: string; label: string; countKey?: "openSupport" | "overdueInvoices" };
type NavGroup = { label: string; items: NavItem[] };
type NavCounts = { openSupport: number; overdueInvoices: number };

/**
 * Klinik panelindeki `ModuleIcon` sistemiyle aynı hazır görsel kaynağı
 * (Microsoft Fluent Emoji Flat, MIT — bkz. ModuleIcon.tsx) kullanır. Bazı
 * ikonlar klinik panelindeki dosyalarla paylaşılır, bazıları platform
 * yönetimine özgüdür (public/icons/modules/superadmin-*.svg).
 */
const ICON_SRC: Record<string, string> = {
  dashboard: "/icons/modules/chart.svg",
  institutions: "/icons/modules/superadmin-institutions.svg",
  reports: "/icons/modules/rapor.svg",
  invoices: "/icons/modules/hakedis.svg",
  sms: "/icons/modules/sms.svg",
  announcements: "/icons/modules/superadmin-announcements.svg",
  support: "/icons/modules/support.svg",
  roles: "/icons/modules/superadmin-roles.svg",
  admins: "/icons/modules/superadmin-admins.svg",
  settings: "/icons/modules/settings.svg",
  audit: "/icons/modules/superadmin-audit.svg",
};

// Dört grup, 11 öğe: 1440×900 ekranda menü kaydırmadan sığar. Menü adı her
// sayfanın başlığıyla aynıdır. E-posta (SMTP) ayarları "Sistem Ayarları"
// içinde bir sekmedir. Reklamlar menüde yok: klinik panelinde reklam
// gösterilen bir alan bulunmadığı için orada yapılan ayar hiçbir kliniğe
// ulaşmıyordu (sayfa adresiyle hâlâ açılabilir).
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/superadmin/panel", icon: "dashboard", label: "Kontrol Paneli" },
      { href: "/superadmin/institutions", icon: "institutions", label: "Klinikler" },
      { href: "/superadmin/invoices", icon: "invoices", label: "Faturalar", countKey: "overdueInvoices" },
      { href: "/superadmin/reports", icon: "reports", label: "Raporlar" },
    ],
  },
  {
    label: "İletişim",
    items: [
      { href: "/superadmin/sms", icon: "sms", label: "SMS Yönetimi" },
      { href: "/superadmin/announcements", icon: "announcements", label: "Duyurular" },
      { href: "/superadmin/support", icon: "support", label: "Destek Talepleri", countKey: "openSupport" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { href: "/superadmin/role-permissions", icon: "roles", label: "Rol Yetkileri" },
      { href: "/superadmin/admins", icon: "admins", label: "Platform Yöneticileri" },
      { href: "/superadmin/audit", icon: "audit", label: "Denetim Günlüğü" },
    ],
  },
  {
    label: "Ayarlar",
    items: [
      { href: "/superadmin/sistem", icon: "settings", label: "Sistem Ayarları" },
    ],
  },
];

const COUNT_TITLE: Record<NonNullable<NavItem["countKey"]>, string> = {
  overdueInvoices: "gecikmiş fatura",
  openSupport: "yanıt bekleyen talep",
};

function isActivePath(pathname: string, href: string) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // E-posta ayarları eski adresiyle açılırsa Sistem Ayarları seçili görünsün.
  return href === "/superadmin/sistem" && pathname.startsWith("/superadmin/smtp");
}

function SidebarNav({ pathname, counts, onNavigate }: { pathname: string; counts: NavCounts | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Platform yönetimi menüsü" className="flex-1 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? "mt-1 border-t border-slate-100 pt-1" : ""}>
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isActive = isActivePath(pathname, item.href);
              const src = ICON_SRC[item.icon];
              const badge = item.countKey && counts ? counts[item.countKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`group grid h-10 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg px-3 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-primary-50/80 font-bold text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]"
                      : "font-semibold text-slate-700 hover:bg-slate-100/70 hover:text-slate-950"
                  }`}
                >
                  <span className="module-icon" data-active={isActive ? "true" : "false"} aria-hidden="true">
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" width={26} height={26} draggable={false} className="module-icon-img" />
                    )}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {badge > 0 && item.countKey ? (
                    <span
                      className="min-w-[1.25rem] rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                      title={`${badge} ${COUNT_TITLE[item.countKey]}`}
                      aria-label={`${badge} ${COUNT_TITLE[item.countKey]}`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : <span />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <p className={`font-display font-black tracking-tight text-slate-900 ${compact ? "text-base" : "text-lg"}`}>Platform Yönetimi</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-500">CepKlinik sahibi paneli</p>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts | null>(null);

  useEffect(() => {
    const h = () => setMobileOpen((v) => !v);
    window.addEventListener("toggle-mobile-sidebar", h as EventListener);
    return () => window.removeEventListener("toggle-mobile-sidebar", h as EventListener);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // İş kuyruğu sayaçları (gecikmiş fatura, yanıt bekleyen destek) her sayfa
  // değişiminde tazelenir; böylece bir işi bitirince menüdeki sayı da düşer.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/superadmin/nav-counts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NavCounts | null) => {
        if (!cancelled && data) setCounts(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {/* Masaüstü — her zaman görünür sabit menü */}
      <aside className="hidden h-full w-64 flex-col overflow-hidden border-r border-slate-200/80 bg-[rgb(var(--app-surface))] md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <Brand />
        </div>
        <SidebarNav pathname={pathname} counts={counts} />
        <div className="border-t border-slate-100 p-3">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobil — hamburger ile açılan kayan çekmece (klinik panelindeki
          aynı `toggle-mobile-sidebar` olayını dinler) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[170] bg-black/40 md:hidden"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMobileOpen(false);
          }}
        >
          <div className="flex h-dvh max-h-dvh w-[min(86vw,288px)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <Brand compact />
              <button onClick={() => setMobileOpen(false)} aria-label="Menüyü kapat" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav pathname={pathname} counts={counts} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-slate-100 p-3">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
