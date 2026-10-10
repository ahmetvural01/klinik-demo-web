"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hospital, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ModuleIcon } from "@/components/ui/ModuleIcon";
import { CountBadge } from "@/components/ui/CountBadge";
import { Drawer } from "@/components/ui/Drawer";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { BranchSwitcher, type BranchSwitcherData } from "@/components/layout/BranchSwitcher";
import { navBadgeFor, usePanelSummary, usePanelSummarySync, type PanelSummaryCounts } from "@/components/layout/use-panel-alerts";
import { buildNavGroups, isNavItemActive, MENU_COLLAPSED_COOKIE, type NavGroup } from "@/lib/nav";
import { scopedStorageKey } from "@/lib/scoped-client-storage";

type SidebarProps = {
  /** Geriye dönük uyumluluk için kabul edilir; kullanıcı bilgisi üst bardaki hesap menüsündedir. */
  user?: { fullName: string; role: string; photoUrl?: string | null };
  /** Klinik adı (sunucudan; açılışta "Klinik Paneli" yazıp sonra değişmesin). */
  initialBrandName?: string;
  /** Logo adresi (sunucudan; yoksa ikon). Önceden /api/settings'ten okunuyordu. */
  brandLogoSrc?: string | null;
  /** Menü daraltılmış mı (çerezden; açılışta yatay zıplama olmasın). */
  initialCollapsed?: boolean;
  /** Şube listesi — telefon/tablet menüsünde şube seçimi için. */
  branchContext?: BranchSwitcherData | null;
};

const HOVER_OPEN_DELAY_MS = 200;
const MOBILE_MENU_ID = "panel-mobil-menu";

function BrandMark({ logoSrc }: { logoSrc: string | null }) {
  return logoSrc ? (
    <span
      aria-hidden="true"
      className="block h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: `url("${logoSrc.replace(/"/g, "%22")}")`, backgroundOrigin: "content-box", padding: 3 }}
    />
  ) : (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
      <Hospital className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

type NavListProps = {
  groups: NavGroup[];
  pathname: string;
  counts: PanelSummaryCounts | null;
  /** Dar menü: yalnız ikon + köşe rozeti; ad ekran okuyucuya söylenir. */
  compact: boolean;
  onNavigate?: () => void;
  onIntent: (href: string) => void;
};

/** Masaüstü ve telefon menüsünün TEK çizimi (önceden iki ayrı kod; telefonda rozet yoktu). */
function NavList({ groups, pathname, counts, compact, onNavigate, onIntent }: NavListProps) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div key={group.key} className={groupIndex > 0 ? "mt-1.5 border-t border-slate-100 pt-1.5" : ""}>
          {!compact && group.label && <p className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const badge = navBadgeFor(item.badge, counts);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onMouseEnter={() => onIntent(item.href)}
                    onFocus={() => onIntent(item.href)}
                    onTouchStart={() => onIntent(item.href)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={compact ? `${item.label}${badge ? `, ${badge.count} ${badge.label}` : ""}` : undefined}
                    className={[
                      "relative flex h-11 items-center rounded-lg text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1",
                      compact ? "justify-center px-0" : "gap-3 px-3",
                      active
                        ? "bg-primary-50/80 font-bold text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]"
                        : "font-semibold text-slate-700 hover:bg-slate-100/70 hover:text-slate-950",
                    ].join(" ")}
                  >
                    <ModuleIcon module={item.icon} active={active} />
                    {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {badge && (
                      <CountBadge
                        count={badge.count}
                        tone={badge.tone}
                        label={compact ? undefined : badge.label}
                        placement={compact ? "corner" : "inline"}
                        max={compact ? 9 : 99}
                      />
                    )}
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

/**
 * Sol menü. Öğeler, adlar, izinler ve rozetler src/lib/nav.ts'ten gelir.
 * - Geniş ekran (≥1024px): sabit menü; kullanıcı daraltabilir (tercih çerezde).
 *   Dar menünün üzerine gelince menü İÇERİĞİN ÜSTÜNDE açılır — önceden genişlik
 *   değişip takvim/tablo her seferinde yeniden akıyordu.
 * - Telefon ve tablet (<1024px): menü kapalı başlar, ☰ ile soldan çekmece
 *   (ui/Drawer: karartılmış alana dokununca kapanır, odak içeride tutulur).
 *   Önceden tablette 264px açık menü tabloları sıkıştırıyordu.
 */
export function Sidebar({ initialBrandName = "", brandLogoSrc = null, initialCollapsed = false, branchContext }: SidebarProps) {
  const { can, hasFeature, scopeKey } = usePermissions();
  const pathname = usePathname();
  const router = useRouter();
  usePanelSummarySync(scopeKey);
  const summary = usePanelSummary();
  const counts = summary.data?.counts ?? null;

  const groups = useMemo(() => buildNavGroups({ can, hasFeature }), [can, hasFeature]);
  const homeHref = groups[0]?.items[0]?.href || "/anasayfa";
  const [brand, setBrand] = useState({ name: initialBrandName || "Klinik Paneli", logoSrc: brandLogoSrc });

  // Yönetici Ayarlar'da adı/logoyu değiştirince menü sayfa yenilenmeden güncellenir.
  // Önceden her değişiklikte 530 KB'a varan /api/settings yanıtı yeniden iniyordu.
  // Ad olayın ayrıntısından (`detail.name`) gelir; ayrıntısız düz Event'te ad
  // aynı kalır. Logo hafif logo ucundan yeni sürüm adresiyle yoklanır: yüklenirse
  // gösterilir, logo kaldırıldıysa (uç 404) ikon döner.
  useEffect(() => {
    let active = true;
    const onBrandChange = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      const rawName = detail && typeof detail === "object" ? (detail as { name?: unknown }).name : undefined;
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (name) setBrand((current) => (current.name === name ? current : { ...current, name }));

      const logoSrc = `/api/panel-summary/logo?v=${Date.now()}`;
      const probe = new Image();
      probe.onload = () => { if (active) setBrand((current) => ({ ...current, logoSrc })); };
      probe.onerror = () => { if (active) setBrand((current) => (current.logoSrc === null ? current : { ...current, logoSrc: null })); };
      probe.src = logoSrc;
    };
    window.addEventListener("clinic-brand-change", onBrandChange);
    return () => {
      active = false;
      window.removeEventListener("clinic-brand-change", onBrandChange);
    };
  }, []);

  const prefetched = useRef(new Set<string>());
  const onIntent = useCallback((href: string) => {
    if (prefetched.current.has(href)) return;
    prefetched.current.add(href);
    router.prefetch(href);
  }, [router]);

  // ── Geniş ekran: daraltma ve üzerine gelince açılma ───────────────────────
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = !collapsed || hoverOpen;

  // Eski tercih (yerel depoda "dar") bir kez çereze taşınır.
  useEffect(() => {
    if (initialCollapsed) return;
    try {
      const legacyKey = scopedStorageKey("sidebar-pinned", scopeKey);
      if (localStorage.getItem(legacyKey) === "0") {
        localStorage.removeItem(legacyKey);
        document.cookie = `${MENU_COLLAPSED_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
        setCollapsed(true);
      }
    } catch {
      // depolama kapalıysa açık menü kalır
    }
  }, [initialCollapsed, scopeKey]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setHoverOpen(false);
    try {
      document.cookie = `${MENU_COLLAPSED_COOKIE}=${next ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      // çerez yazılamazsa tercih yalnız bu sayfada geçerli kalır
    }
  };

  const startHover = () => {
    if (!collapsed) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverOpen(true), HOVER_OPEN_DELAY_MS);
  };
  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHoverOpen(false);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  // Kısa ekranda alttaki öğeler görünmüyordu; seçili öğe görünür alana kaydırılır.
  const desktopNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    desktopNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  // ── Telefon/tablet çekmecesi ──────────────────────────────────────────────
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const toggle = () => setMobileOpen((value) => !value);
    window.addEventListener("toggle-mobile-sidebar", toggle);
    return () => window.removeEventListener("toggle-mobile-sidebar", toggle);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  // Çekmece yalnız dar ekranda anlamlıdır; pencere genişleyince kapanır.
  useEffect(() => {
    if (!mobileOpen) return;
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (query.matches) setMobileOpen(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mobileOpen]);

  const brandName = brand.name;

  return (
    <>
      <Drawer
        id={MOBILE_MENU_ID}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="left"
        size="sm"
        padding="none"
        title={(
          <span className="flex min-w-0 items-center gap-2.5">
            <BrandMark logoSrc={brand.logoSrc} />
            <span className="truncate text-[15px]">{brandName}</span>
          </span>
        )}
      >
        <BranchSwitcher data={branchContext} variant="drawer" />
        <nav aria-label="Ana menü" className="px-2 py-2">
          <NavList groups={groups} pathname={pathname} counts={counts} compact={false} onNavigate={() => setMobileOpen(false)} onIntent={onIntent} />
        </nav>
      </Drawer>

      {/* Menünün kapladığı yer (flex öğesi). Üzerine gelince açılan menü bu
          yeri değiştirmez, içeriğin üstünde durur. */}
      <div className={`relative hidden h-dvh shrink-0 lg:block ${collapsed ? "w-[72px]" : "w-[264px]"}`}>
        <aside
          aria-label="Klinik menüsü"
          onMouseEnter={startHover}
          onMouseLeave={endHover}
          onFocusCapture={() => { if (collapsed) setHoverOpen(true); }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverOpen(false);
          }}
          className={[
            "absolute inset-y-0 left-0 z-[170] flex flex-col overflow-hidden border-r border-slate-200/80 bg-white transition-[width,box-shadow] duration-150 ease-out",
            expanded ? "w-[264px]" : "w-[72px]",
            collapsed && hoverOpen ? "shadow-[8px_0_28px_rgb(15_23_42/0.14)]" : "shadow-[4px_0_18px_rgb(15_23_42/0.045),1px_0_0_rgb(15_23_42/0.03)]",
          ].join(" ")}
        >
          <div className={`flex h-14 shrink-0 items-center border-b border-slate-100 ${expanded ? "px-4" : "justify-center px-2"}`}>
            <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70" aria-label={`${brandName} — ana sayfa`}>
              <BrandMark logoSrc={brand.logoSrc} />
              {expanded && <span className="truncate text-[13px] font-black tracking-tight text-slate-900">{brandName}</span>}
            </Link>
          </div>

          <nav ref={desktopNavRef} aria-label="Ana menü" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
            <NavList groups={groups} pathname={pathname} counts={counts} compact={!expanded} onIntent={onIntent} />
          </nav>

          <div className="shrink-0 border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
              title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
              className={`flex h-10 w-full items-center rounded-lg text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${expanded ? "gap-3 px-3" : "justify-center"}`}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {expanded && <span>{collapsed ? "Menüyü genişlet" : "Menüyü daralt"}</span>}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
