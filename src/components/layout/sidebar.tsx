"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePanelAlerts } from "@/components/layout/use-panel-alerts";

const I = (d: string, extra?: string) => (
  <svg aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${extra ?? ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);

const ICONS: Record<string, JSX.Element> = {
  home:          I('<path d="M3 9.75L12 3l9 6.75V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.75z"/><path d="M9 22V12h6v10"/>'),
  calendar:      I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  users:         I('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>'),
  tooth:         I('<path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/>'),
  clipboard:     I('<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>'),
  flask:         I('<path d="M9 3h6M10 3v6L6 17a2 2 0 001.89 2.7h8.22A2 2 0 0018 17l-4-8V3"/>'),
  finance:       I('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  register:      I('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M12 12v3M8 12h8"/>'),
  chart:         I('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
  person:        I('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  price:         I('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5"/>'),
  box:           I('<path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>'),
  sms:           I('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  settings:      I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  log:           I('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  profile:       I('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  support:       I('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  follow:        I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  logout:        I('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  taksit:        I('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 14h2M10 14h2"/>'),
  gider:         I('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/><line x1="4" y1="22" x2="20" y2="2" strokeWidth="1.5"/>'),
  firma:         I('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  recete:        I('<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h2m2 0h2M9 16h6"/><path d="M13 12v4"/>'),
  kasa:          I('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M12 12v3M8 12h8"/>'),
  rapor:         I('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
  hakediş:       I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
};

const ROLE_LABELS: Record<string, string> = {
  YONETICI:  "Yönetici",
  DOKTOR:    "Doktor",
  ASISTAN:   "Asistan",
  BANKO:     "Banko",
  MUHASEBE:  "Muhasebe",
  SUPERADMIN:"Süper Admin",
};

type NavItem = { href: string; label: string; icon: string; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

// ── Rol bazlı menü tanımları ──────────────────────────────────────────────
function buildNavGroups(role: string): NavGroup[] {
  const isYonetici  = role === "YONETICI" || role === "SUPERADMIN";
  const isDoktor    = role === "DOKTOR";
  const isAsistan   = role === "ASISTAN";
  const isBanko     = role === "BANKO";
  const isMuhasebe  = role === "MUHASEBE";

  const groups: NavGroup[] = [];

  // Tüm roller için anasayfa girişi
  if (isYonetici || isDoktor || isAsistan || isBanko || isMuhasebe) {
    groups.push({
      label: "Bugün",
      items: [{ href: "/anasayfa", label: "Anasayfa", icon: "home" }],
    });
  }

  // ── KLİNİK ──
  if (isYonetici || isDoktor || isAsistan || isBanko) {
    groups.push({
      label: "Klinik",
      items: [
        { href: "/randevu",     label: "Randevular",  icon: "calendar" },
        { href: "/hasta",       label: "Hastalar",    icon: "users" },
        ...(isYonetici || isDoktor || isAsistan || isBanko ? [{ href: "/gorevler", label: "Görev Merkezi", icon: "clipboard" }] : []),
        ...(isYonetici || isDoktor || isAsistan ? [{ href: "/hasta-takip", label: "Hasta Takip", icon: "follow" }] : []),
      ],
    });
  }

  // ── TEDAVİ ──
  if (isYonetici || isDoktor || isAsistan) {
    groups.push({
      label: "Tedavi",
      items: [
        { href: "/lab",          label: "Laboratuvar",  icon: "flask" },
      ],
    });
  }

  // ── FİNANS ──
  if (isYonetici || isBanko || isMuhasebe) {
    groups.push({
      label: "Finans",
      items: [
        { href: "/muhasebe", label: "Muhasebe Merkezi", icon: "finance" },
        ...(isYonetici || isMuhasebe
          ? [{ href: "/rapor", label: "Raporlar", icon: "rapor" }]
          : []),
      ],
    });
  }

  // ── DOKTOR: kendi hakedişleri ──
  if (isDoktor) {
    groups.push({
      label: "Finans",
      items: [
        { href: "/finans", label: "Doktor Hakedişim", icon: "hakediş" },
      ],
    });
  }

  // ── STOK & TEDARİK ──
  if (isYonetici || isMuhasebe) {
    groups.push({
      label: "Stok & Tedarik",
      items: [
        { href: "/stok",  label: "Stok", icon: "box" },
        { href: "/firma", label: "Tedarikçiler",   icon: "firma" },
      ],
    });
  }

  // ── YÖNETİM (sadece Yönetici) ──
  if (isYonetici) {
    groups.push({
      label: "Yönetim",
      items: [
        { href: "/personel", label: "Personeller",   icon: "person" },
        { href: "/fiyat",    label: "Fiyat Listesi", icon: "price" },
        { href: "/sms",      label: "SMS Modülü",    icon: "sms" },
        { href: "/sistem-izleme", label: "Sistem İzleme", icon: "chart" },
        { href: "/ayar",     label: "Sistem Ayarları", icon: "settings" },
      ],
    });
  }

  // ── KİŞİSEL ──
  groups.push({
    label: "Kişisel",
    items: [
      { href: "/profil",  label: "Profilim", icon: "profile" },
      ...(isYonetici ? [{ href: "/log", label: "İşlem Kayıtları", icon: "log" }] : []),
      { href: "/destek",  label: "Destek",   icon: "support" },
    ],
  });

  return groups;
}

const PREVIEW_ROLES = [
  { key: "YONETICI",  label: "Yönetici",  color: "bg-violet-600" },
  { key: "DOKTOR",    label: "Doktor",    color: "bg-emerald-600" },
  { key: "ASISTAN",   label: "Asistan",   color: "bg-sky-600" },
  { key: "BANKO",     label: "Banko",     color: "bg-amber-600" },
  { key: "MUHASEBE",  label: "Muhasebe",  color: "bg-rose-600" },
];

export function Sidebar({ user }: { user: { fullName: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [messageUnread, setMessageUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const isSuperAdmin = user.role === "SUPERADMIN";

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      const saved = sessionStorage.getItem("dev-preview-role");
      if (saved) setPreviewRole(saved);
    }
  }, [isSuperAdmin]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  useEffect(() => {
    const h = () => setMobileOpen((v) => !v);
    window.addEventListener("toggle-mobile-sidebar", h as EventListener);
    return () => window.removeEventListener("toggle-mobile-sidebar", h as EventListener);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handlePreviewRole = (role: string | null) => {
    if (role) {
      sessionStorage.setItem("dev-preview-role", role);
    } else {
      sessionStorage.removeItem("dev-preview-role");
    }
    setPreviewRole(role);
    setRolePickerOpen(false);
    window.dispatchEvent(new Event("preview-role-change"));
  };

  const userRole = user.role;
  const userName = user.fullName;
  // SuperAdmin ise seçili preview rolü, yoksa gerçek rol
  const effectiveRole = (isSuperAdmin && previewRole) ? previewRole : userRole;
  const navGroups = buildNavGroups(effectiveRole);
  const alerts = usePanelAlerts(effectiveRole);

  const activePreview = PREVIEW_ROLES.find(r => r.key === previewRole);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Set<string>();
    const targets = buildNavGroups(effectiveRole).flatMap((group) => group.items.map((item) => item.href));
    targets.forEach((href) => {
      if (seen.has(href)) return;
      seen.add(href);
      Promise.resolve(router.prefetch(href)).catch(() => {});
    });
  }, [effectiveRole, router]);

  useEffect(() => {
    const syncUnread = () => {
      const raw = localStorage.getItem("clinic-unread-messages") || "0";
      const val = Number(raw);
      setMessageUnread(Number.isFinite(val) ? val : 0);
    };

    syncUnread();
    window.addEventListener("clinic-unread-messages-change", syncUnread);
    window.addEventListener("storage", syncUnread);
    return () => {
      window.removeEventListener("clinic-unread-messages-change", syncUnread);
      window.removeEventListener("storage", syncUnread);
    };
  }, []);

  const isActive = (href: string) =>
    href === "/anasayfa"
      ? pathname === "/anasayfa"
      : pathname === href || pathname.startsWith(href + "/");

  const dynamicBadge = (href: string): number => {
    if (href === "/anasayfa") return messageUnread;
    if (href === "/muhasebe") return alerts.taksit; // gecikmiş taksit sayısı
    if (href === "/stok") return alerts.stok;
    if (href === "/lab") return alerts.lab;
    return 0;
  };

  const w = collapsed ? "w-[68px]" : "w-[256px]";

  useEffect(() => {
    const coreRoutes = ["/anasayfa", "/randevu", "/hasta", "/hasta-takip", "/gorevler"];
    const prefetchAll = () => {
      coreRoutes.forEach((href) => {
        if (href !== pathname) router.prefetch(href);
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(prefetchAll);
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as Window & { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id);
        }
      };
    }

    const timer = setTimeout(prefetchAll, 400);
    return () => clearTimeout(timer);
  }, [pathname, router]);

  return (
    <div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative flex h-full">
            <div className="w-64 bg-[#0f172a] p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/></svg>
                  </div>
                  <p className="text-sm font-black text-white">KlinikModern</p>
                </div>
                <button onClick={() => setMobileOpen(false)} aria-label="Kapat" className="text-slate-300">✕</button>
              </div>
              <nav className="space-y-3">
                {navGroups.map((group) => (
                  <div key={group.label} className="border-t border-white/5 pt-2">
                    <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-slate-400">{group.label}</p>
                    <div className="flex flex-col gap-1">
                      {group.items.map((it) => {
                        const active = isActive(it.href);
                        return (
                        <Link key={it.href} href={it.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${active ? "bg-white text-slate-950" : "text-slate-200 hover:bg-white/10"}`}>
                          <span className="text-slate-300">{ICONS[it.icon]}</span>
                          <span>{it.label}</span>
                        </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}
      <aside className={`hidden h-screen ${w} shrink-0 flex-col bg-[#0f172a] transition-all duration-200 md:flex`}>
        {/* Rol görünümü aktifken göster */}
      {isSuperAdmin && activePreview && (
        <div className={`flex items-center gap-2 px-3 py-2 text-xs font-bold text-white ${activePreview.color} shrink-0`}>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          {!collapsed && <span>{activePreview.label} görünümü</span>}
        </div>
      )}

      {/* Logo + toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center px-0 py-4" : "justify-between px-4 py-4"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/40">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/>
              </svg>
            </div>
            <p className="text-[13px] font-black text-white">KlinikModern</p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-white/10 hover:text-slate-300 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <><path d="M5 12h14"/><path d="m9 6 6 6-6 6"/></>
              : <><path d="M19 12H5"/><path d="m15 6-6 6 6 6"/></>}
          </svg>
        </button>
      </div>

      {/* Kullanıcı kartı */}
      {userName && (
        <div className={`mx-2 mb-3 flex items-center rounded-xl bg-white/5 py-2.5 ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{userName}</p>
              <p className="text-xs font-semibold uppercase text-slate-500">
                {activePreview ? activePreview.label : (ROLE_LABELS[userRole] ?? userRole)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Rol Görünümü (sadece SUPERADMIN) ─────────────────────────────── */}
      {isSuperAdmin && (
        <details className="mx-2 mb-2 shrink-0">
          {!collapsed ? (
            <>
              <summary className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-slate-100">
                  <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <span className="flex-1 text-left">
                    {previewRole ? `Görünüm: ${activePreview?.label}` : "Rol Görünümü"}
                  </span>
                  <svg className="h-3 w-3 shrink-0 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </summary>
              <div className="mt-1 rounded-lg border border-white/10 bg-[#1e2d45] p-1.5">
                  <p className="mb-1.5 px-1 text-xs font-bold uppercase text-slate-500">Rol seç</p>
                  <div className="flex flex-col gap-0.5">
                    {PREVIEW_ROLES.map(r => (
                      <button
                        key={r.key}
                        onClick={() => handlePreviewRole(previewRole === r.key ? null : r.key)}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                          previewRole === r.key
                            ? `${r.color} text-white`
                            : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.color}`} />
                        {r.label}
                        {previewRole === r.key && (
                          <span className="ml-auto text-xs opacity-80">aktif</span>
                        )}
                      </button>
                    ))}
                    {previewRole && (
                      <button
                        onClick={() => handlePreviewRole(null)}
                        className="mt-0.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 hover:bg-white/10 hover:text-slate-300 transition"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Önizlemeyi kapat
                      </button>
                    )}
                  </div>
                </div>
            </>
          ) : (
            /* Collapsed: dev icon + tooltip */
            <div className="relative group">
              <button
                onClick={() => setRolePickerOpen(prev => !prev)}
                className={`flex h-9 w-full items-center justify-center rounded-lg transition ${
                  previewRole ? "bg-violet-600/30 text-violet-400" : "text-slate-600 hover:bg-white/10 hover:text-slate-400"
                }`}
                title="Rol Görünümü"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
              </button>
              {/* Collapsed tooltip ile mini picker */}
              {rolePickerOpen && (
                <div className="absolute left-full top-0 z-50 ml-2 min-w-[140px] rounded-lg border border-white/10 bg-[#1e2d45] p-1.5 shadow-xl">
                  <p className="mb-1 px-1 text-xs font-bold uppercase text-slate-500">Rol seç</p>
                  {PREVIEW_ROLES.map(r => (
                    <button
                      key={r.key}
                      onClick={() => handlePreviewRole(previewRole === r.key ? null : r.key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                        previewRole === r.key
                          ? `${r.color} text-white`
                          : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.color}`} />
                      {r.label}
                    </button>
                  ))}
                  {previewRole && (
                    <button
                      onClick={() => handlePreviewRole(null)}
                      className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-white/10 hover:text-slate-300 transition"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      Kapat
                    </button>
                  )}
                </div>
              )}
                <div className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Rol Görünümü
              </div>
            </div>
          )}
        </details>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-2 pt-2 border-t border-white/5" : ""}>
            {!collapsed && (
              <p className="mb-1 mt-3 px-2 text-xs font-bold uppercase text-slate-500">
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && <div className="my-1" />}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const badge = dynamicBadge(item.href) || (item.badge ? parseInt(item.badge) : 0);
              return (
                <div key={item.href} className="relative group">
                  <Link
                    href={item.href}
                    onMouseEnter={() => router.prefetch(item.href)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "relative flex items-center rounded-xl transition-all duration-150 " +
                      (collapsed ? "justify-center px-0 py-3 mx-0" : "gap-3 px-3 py-3 text-sm font-semibold") + " " +
                      (active
                        ? "bg-white text-slate-950 shadow-md shadow-slate-950/20"
                        : "text-slate-400 hover:bg-white/8 hover:text-slate-100") +
                      " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400"
                    }
                  >
                    {!collapsed && active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-500" aria-hidden="true" />}
                    <span className={active ? "text-blue-700" : "text-slate-500"}>
                      {ICONS[item.icon]}
                    </span>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge > 0 && (
                      <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white leading-none">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                  {/* Collapsed tooltip */}
                  {collapsed && (
                    <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {item.label}
                      {badge > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs">{badge}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/5 p-2">
        <div className="relative group">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/giris";
            }}
            className={`flex w-full items-center rounded-xl text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 ${collapsed ? "justify-center py-3 px-0" : "gap-3 px-3 py-3 text-sm font-medium"}`}
          >
            {ICONS.logout}
            {!collapsed && <span>Oturumu Kapat</span>}
          </button>
          {collapsed && (
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Oturumu Kapat
            </div>
          )}
        </div>
      </div>
    </aside>
  </div>
  );
}
