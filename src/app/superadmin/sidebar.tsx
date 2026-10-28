"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";
import { CountBadge } from "@/components/ui/CountBadge";
import { Drawer } from "@/components/ui/Drawer";

type CountKey = "openSupport" | "overdueInvoices";
/**
 * Menü ikonları ortak ModuleIcon sözlüğündendir; platforma özgü bölümler
 * `sa-*` anahtarlarını kullanır. Her sayfanın başlığı (PageHeader) aynı
 * anahtarı alır: menü ve başlık ikonu aynı görünür.
 */
type NavItem = { href: string; icon: ModuleKey; label: string; countKey?: CountKey };
type NavGroup = { label: string; items: NavItem[] };
type NavCounts = Record<CountKey, number>;

// Üç grup, 12 öğe; menü adı her sayfanın başlığıyla aynıdır. Tek öğeli
// "Ayarlar" grubu "Yönetim"e katıldı. Reklamlar: klinik panelindeki Google
// AdSense alanlarının kurulumu ve kliniğe göre açma/kapama.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/superadmin/panel", icon: "chart", label: "Kontrol Paneli" },
      { href: "/superadmin/institutions", icon: "institutions", label: "Klinikler" },
      { href: "/superadmin/invoices", icon: "hakediş", label: "Faturalar", countKey: "overdueInvoices" },
      { href: "/superadmin/reports", icon: "rapor", label: "Raporlar" },
    ],
  },
  {
    label: "İletişim",
    items: [
      { href: "/superadmin/sms", icon: "sms", label: "SMS Yönetimi" },
      { href: "/superadmin/announcements", icon: "sa-announcements", label: "Duyurular" },
      { href: "/superadmin/support", icon: "support", label: "Destek Talepleri", countKey: "openSupport" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { href: "/superadmin/role-permissions", icon: "sa-roles", label: "Rol Yetkileri" },
      { href: "/superadmin/admins", icon: "sa-admins", label: "Platform Yöneticileri" },
      { href: "/superadmin/audit", icon: "sa-audit", label: "Denetim Günlüğü" },
      { href: "/superadmin/ads", icon: "sa-ads", label: "Reklamlar" },
      { href: "/superadmin/sistem", icon: "settings", label: "Sistem Ayarları" },
    ],
  },
];

const COUNT_META: Record<CountKey, { label: string; tone: "critical" | "warning" }> = {
  overdueInvoices: { label: "gecikmiş fatura", tone: "critical" },
  openSupport: { label: "yanıt bekleyen talep", tone: "warning" },
};

// Sayaçlar en çok bu sıklıkta tazelenir. Önceden her sayfa geçişinde ayrı
// istek atılıyordu (canlıda 3-10 sn süren nav-counts, H12); aynı dış IP'yi
// paylaşan ofiste gereksiz istek hız sınırına da yaklaştırır.
const COUNTS_MIN_INTERVAL_MS = 60_000;

function isActivePath(pathname: string, href: string) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // E-posta ayarları eski adresiyle açılırsa Sistem Ayarları seçili görünsün.
  return href === "/superadmin/sistem" && pathname.startsWith("/superadmin/smtp");
}

/** Masaüstü ve telefon menüsünün TEK çizimi — klinik menüsüyle aynı ölçü ve rozet. */
function NavList({ pathname, counts, onNavigate }: { pathname: string; counts: NavCounts | null; onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex > 0 ? "mt-1.5 border-t border-slate-100 pt-1.5" : ""}>
          <p className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const badge = item.countKey && counts ? counts[item.countKey] : 0;
              const meta = item.countKey ? COUNT_META[item.countKey] : null;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1",
                      active
                        ? "bg-primary-50/80 font-bold text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]"
                        : "font-semibold text-slate-700 hover:bg-slate-100/70 hover:text-slate-950",
                    ].join(" ")}
                  >
                    <ModuleIcon module={item.icon} active={active} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {meta && <CountBadge count={badge} tone={meta.tone} label={meta.label} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
        <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
      <span className="truncate text-[13px] font-black tracking-tight text-slate-900">CepKlinik · Platform</span>
    </span>
  );
}

/**
 * Platform yönetimi sol menüsü — klinik menüsüyle aynı görsel dil: modül
 * ikonu, 44px satır, cümle düzeninde grup adı, ortak sayaç rozeti. Geniş
 * ekranda (≥1024px) sabit; telefon ve tablette ☰ ile soldan çekmece (ortak
 * Drawer: Esc ve karartılmış alan kapatır, odak içeride kalır). Oturumu
 * kapatma üst çubuktaki hesap menüsünde (klinik paneliyle aynı yer).
 */
export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts | null>(null);
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const toggle = () => setMobileOpen((value) => !value);
    window.addEventListener("toggle-mobile-sidebar", toggle);
    return () => window.removeEventListener("toggle-mobile-sidebar", toggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const refreshCounts = useCallback((force = false) => {
    if (inFlightRef.current) return;
    if (!force && Date.now() - lastFetchRef.current < COUNTS_MIN_INTERVAL_MS) return;
    inFlightRef.current = true;
    lastFetchRef.current = Date.now();
    fetch("/api/superadmin/nav-counts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NavCounts | null) => {
        if (data) setCounts(data);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);

  // İş kuyruğu sayaçları: açılışta bir kez; sonra sayfa değişince ya da
  // sekmeye dönülünce, ama en çok dakikada bir. Fatura tahsil edilip destek
  // yanıtlanınca ilgili sayfa olayıyla hemen tazelenir.
  useEffect(() => {
    refreshCounts();
  }, [pathname, refreshCounts]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCounts();
    };
    const onChanged = () => refreshCounts(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("superadmin-counts-changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("superadmin-counts-changed", onChanged);
    };
  }, [refreshCounts]);

  // Çekmece yalnız dar ekranda anlamlıdır; pencere genişleyince kapanır.
  useEffect(() => {
    if (!mobileOpen) return;
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (query.matches) setMobileOpen(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mobileOpen]);

  return (
    <>
      <Drawer
        id="platform-mobil-menu"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="left"
        size="sm"
        padding="none"
        title={<Brand />}
      >
        <nav aria-label="Platform yönetimi menüsü" className="px-2 py-2">
          <NavList pathname={pathname} counts={counts} onNavigate={() => setMobileOpen(false)} />
        </nav>
      </Drawer>

      {/* Ad içerideki nav'da: aside ile nav aynı etiketi taşıyınca ekran okuyucu menüyü iki kez okuyordu. */}
      <aside
        className="hidden h-full w-[264px] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-[4px_0_18px_rgb(15_23_42/0.045),1px_0_0_rgb(15_23_42/0.03)] lg:flex"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-slate-100 px-4">
          <Link href="/superadmin/panel" className="flex min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70" aria-label="Platform yönetimi — Kontrol Paneli">
            <Brand />
          </Link>
        </div>
        <nav aria-label="Platform yönetimi menüsü" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          <NavList pathname={pathname} counts={counts} />
        </nav>
      </aside>
    </>
  );
}
