"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePanelAlerts } from "@/components/layout/use-panel-alerts";
import { useEscapeClose } from "@/lib/use-modal-dismiss";

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
        ...(isYonetici || isDoktor || isAsistan || isBanko ? [{ href: "/hasta-takip", label: "Hasta Takip", icon: "follow" }] : []),
        ...(isYonetici || isBanko ? [{ href: "/sms", label: "SMS Yönetimi", icon: "sms" }] : []),
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
      label: "Muhasebe",
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
        { href: "/firma", label: "Satın Alma & Tedarikçiler", icon: "firma" },
      ],
    });
  }

  // ── YÖNETİM (sadece Yönetici) ──
  if (isYonetici) {
    groups.push({
      label: "Yönetim",
      items: [
        { href: "/personel", label: "Personeller",   icon: "person" },
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

type ClinicOption = { id: string; name: string; isActive: boolean };

export function Sidebar({ user }: { user: { fullName: string; role: string; photoUrl?: string | null } }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messageUnread, setMessageUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEscapeClose(() => setMobileOpen(false), mobileOpen);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [clinicQuery, setClinicQuery] = useState("");
  const [switchTarget, setSwitchTarget] = useState<ClinicOption | null>(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const isSuperAdmin = user.role === "SUPERADMIN";

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/superadmin/institutions")
      .then((r) => r.json())
      .then((d) => setClinics(Array.isArray(d) ? d.map((i: { id: string; name: string; isActive: boolean }) => ({ id: i.id, name: i.name, isActive: i.isActive })) : []))
      .catch(() => setClinics([]));
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

  const openSwitchTarget = (clinic: ClinicOption) => {
    setSwitchTarget(clinic);
    setSwitchPassword("");
    setSwitchError(null);
    setClinicPickerOpen(false);
  };

  const confirmSwitchClinic = async () => {
    if (!switchTarget || !switchPassword) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch("/api/auth/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: switchTarget.id, password: switchPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwitchError(d.message || "Giriş başarısız");
        setSwitching(false);
        return;
      }
      window.location.href = "/anasayfa";
    } catch {
      setSwitchError("Bağlantı hatası");
      setSwitching(false);
    }
  };

  const filteredClinics = clinics.filter((c) => c.name.toLowerCase().includes(clinicQuery.toLowerCase()));

  const userRole = user.role;
  const userName = user.fullName;
  const navGroups = buildNavGroups(userRole);
  const alerts = usePanelAlerts(userRole);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Set<string>();
    const targets = buildNavGroups(userRole).flatMap((group) => group.items.map((item) => item.href));
    targets.forEach((href) => {
      if (seen.has(href)) return;
      seen.add(href);
      Promise.resolve(router.prefetch(href)).catch(() => {});
    });
  }, [userRole, router]);

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

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (path === "/anasayfa") return pathname === "/anasayfa";
    if (query) {
      const params = new URLSearchParams(query);
      const tab = params.get("tab");
      return pathname === path && (!tab || searchParams.get("tab") === tab);
    }
    return pathname === path || pathname.startsWith(path + "/");
  };

  const dynamicBadge = (href: string): number => {
    if (href === "/anasayfa") return messageUnread;
    if (href.startsWith("/muhasebe")) return alerts.taksit; // muhasebe merkezinde gecikmiş taksit uyarısı
    if (href === "/stok") return alerts.stok;
    if (href === "/lab") return alerts.lab;
    return 0;
  };

  const w = collapsed ? "w-[68px]" : "w-[256px]";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMobileOpen(false);
          }}
        >
          <div className="relative flex h-dvh max-h-dvh">
            <div className="flex h-dvh max-h-dvh w-[min(86vw,288px)] flex-col overflow-hidden bg-[#0f172a]">
              <div className="shrink-0 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/></svg>
                  </div>
                  <p className="text-sm font-black text-white">Klinik Paneli</p>
                </div>
                <button onClick={() => setMobileOpen(false)} aria-label="Kapat" className="text-slate-300">✕</button>
              </div>

              {userName && (
                <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                  {user.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoUrl} alt={userName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{userName}</p>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {ROLE_LABELS[userRole] ?? userRole}
                    </p>
                  </div>
                </div>
              )}

              {isSuperAdmin && (
                <details className="mb-2">
                  <summary className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-slate-100">
                    <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                    </svg>
                    <span className="flex-1 text-left">Kliniğe Gir</span>
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </summary>
                  <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#1e2d45] p-1.5">
                    <p className="mb-1.5 px-1 text-xs font-bold uppercase text-slate-500">Klinik seç</p>
                    <div className="flex flex-col gap-0.5">
                      {clinics.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            openSwitchTarget(c);
                            setMobileOpen(false);
                          }}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-slate-500"}`} />
                          <span className="truncate">{c.name}</span>
                        </button>
                      ))}
                      {clinics.length === 0 && (
                        <p className="px-2.5 py-2 text-xs text-slate-500">Klinik bulunamadı</p>
                      )}
                    </div>
                  </div>
                </details>
              )}
              </div>

              <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-3 [-webkit-overflow-scrolling:touch]">
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

              <div className="shrink-0 border-t border-white/5 p-3">
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/giris";
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  {ICONS.logout}
                  <span>Oturumu Kapat</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <aside className={`hidden h-screen ${w} shrink-0 flex-col bg-[#0f172a] transition-all duration-200 md:flex`}>
      {/* Logo + toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center px-0 py-4" : "justify-between px-4 py-4"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/40">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/>
              </svg>
            </div>
            <p className="text-[13px] font-black text-white">Klinik Paneli</p>
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
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoUrl} alt={userName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{userName}</p>
              <p className="text-xs font-semibold uppercase text-slate-500">
                {ROLE_LABELS[userRole] ?? userRole}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Kliniğe Gir (sadece SUPERADMIN) ─────────────────────────────── */}
      {isSuperAdmin && (
        <div className="relative mx-2 mb-2 shrink-0">
          {!collapsed ? (
            <>
              <button
                onClick={() => setClinicPickerOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
              >
                <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                <span className="flex-1 text-left">Kliniğe Gir</span>
                <svg className="h-3 w-3 shrink-0 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {clinicPickerOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[#1e2d45] p-1.5 shadow-xl">
                  <input
                    autoFocus
                    value={clinicQuery}
                    onChange={(e) => setClinicQuery(e.target.value)}
                    placeholder="Klinik ara..."
                    className="mb-1.5 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400"
                  />
                  <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                    {filteredClinics.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openSwitchTarget(c)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-slate-500"}`} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                    {filteredClinics.length === 0 && (
                      <p className="px-2.5 py-2 text-xs text-slate-500">Klinik bulunamadı</p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Collapsed: ikon + tooltip */
            <div className="relative group">
              <button
                onClick={() => setClinicPickerOpen((prev) => !prev)}
                className="flex h-9 w-full items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/10 hover:text-slate-400"
                title="Kliniğe Gir"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
              </button>
              {clinicPickerOpen && (
                <div className="absolute left-full top-0 z-50 ml-2 min-w-[180px] rounded-lg border border-white/10 bg-[#1e2d45] p-1.5 shadow-xl">
                  <input
                    autoFocus
                    value={clinicQuery}
                    onChange={(e) => setClinicQuery(e.target.value)}
                    placeholder="Klinik ara..."
                    className="mb-1.5 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400"
                  />
                  <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                    {filteredClinics.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openSwitchTarget(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-slate-500"}`} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                    {filteredClinics.length === 0 && (
                      <p className="px-2.5 py-2 text-xs text-slate-500">Klinik bulunamadı</p>
                    )}
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Kliniğe Gir
              </div>
            </div>
          )}
        </div>
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

    {switchTarget && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget && !switching) setSwitchTarget(null);
        }}
      >
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
          <h3 className="text-sm font-black text-slate-900">Kliniğe Gir: {switchTarget.name}</h3>
          <p className="mt-1 text-xs text-slate-500">Devam etmek için süperadmin şifrenizi tekrar girin.</p>
          <input
            type="password"
            autoFocus
            value={switchPassword}
            onChange={(e) => setSwitchPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmSwitchClinic(); }}
            placeholder="Şifre"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {switchError && <p className="mt-2 text-xs font-semibold text-red-600">{switchError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setSwitchTarget(null)}
              disabled={switching}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              İptal
            </button>
            <button
              onClick={() => void confirmSwitchClinic()}
              disabled={switching || !switchPassword}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {switching ? "Giriş yapılıyor..." : "Gir"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
