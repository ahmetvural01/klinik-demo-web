"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Code2,
  ChevronDown,
  X,
} from "lucide-react";
import { Hospital } from "@icon-park/react";
import { usePanelAlerts } from "@/components/layout/use-panel-alerts";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";
import { useEscapeClose } from "@/lib/use-modal-dismiss";
import { parseRolePreview, ROLE_PREVIEW_COOKIE, ROLE_PREVIEW_STORAGE } from "@/lib/role-preview";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { scopedStorageKey } from "@/lib/scoped-client-storage";
import { hasPanelPermission } from "@/lib/panel-permissions";

const NAV_LABEL_BASE =
  "min-w-0 overflow-hidden whitespace-nowrap text-left tracking-normal transition-all duration-150 ease-out";

const NAV_LABEL_OPEN = "max-w-[180px] opacity-100 translate-x-0";

const NAV_ITEM_OPEN = "grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3";

const NAV_ITEM_CLOSED = "grid grid-cols-[36px] items-center justify-items-center";

type NavItem = { href: string; label: string; icon: string; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

// Menü ile API aynı dinamik izin matrisinden beslenir. Bir rolün izni
// süperadmin panelinden değiştirildiğinde burada ayrıca rol adı güncellenmez.
// Gruplar günlük kullanım sıklığına göre: en üstte her gün açılan üç ekran
// (başlıksız), ardından takip işleri, para, stok ve yönetim. Profil, destek ve
// çıkış sağ üstteki hesap menüsündedir (aynı bilgi iki yerde durmasın).
function buildNavGroups(permissions: string[], features: { whatsapp: boolean }): NavGroup[] {
  const can = (permission: string) => hasPanelPermission(permissions, permission);
  const groups: NavGroup[] = [
    {
      label: "",
      items: [
        ...(can("dashboard:read") ? [{ href: "/anasayfa", label: "Anasayfa", icon: "home" }] : []),
        ...(can("appointments:read") ? [{ href: "/randevu", label: "Randevular", icon: "calendar" }] : []),
        ...(can("patients:read") ? [{ href: "/hasta", label: "Hastalar", icon: "users" }] : []),
      ],
    },
    {
      label: "Takip",
      items: [
        ...(can("clinictasks:read") ? [{ href: "/gorevler", label: "Görevler", icon: "clipboard" }] : []),
        ...(can("hastatracking:read") ? [{ href: "/hasta-takip", label: "Hasta Takip", icon: "follow" }] : []),
        ...(can("lab:read") ? [{ href: "/lab", label: "Laboratuvar", icon: "flask" }] : []),
        // WhatsApp özelliği kapalı klinikte yalnız whatsapp:read yetkisi olan
        // rol İletişim'te işe yarar bir şey bulamıyordu.
        ...(can("sms:read") || (can("whatsapp:read") && features.whatsapp) ? [{ href: "/sms", label: "İletişim", icon: "sms" }] : []),
      ],
    },
    {
      label: "Finans",
      items: [
        ...(can("finance:center") ? [{ href: "/muhasebe", label: "Muhasebe", icon: "finance" }] : []),
        // Muhasebe'ye erişen kullanıcı hakedişi zaten Muhasebe > Hakediş
        // sekmesinde görür; ayrı menü öğesi yalnız muhasebe yetkisi olmayan
        // (kendi hakedişini gören) hekime gösterilir.
        ...(can("earnings:read") && !can("finance:center") ? [{ href: "/finans", label: "Hakedişim", icon: "hakediş" }] : []),
        ...(can("reports:read") ? [{ href: "/rapor", label: "Raporlar", icon: "rapor" }] : []),
        // Fiyat listesi normalde Ayarlar içinde; ayar yetkisi olmayan ama
        // fiyatlara bakan/düzenleyen rol (ör. Muhasebe) menüden ulaşabilsin.
        ...(can("prices:read") && !can("settings:read") ? [{ href: "/fiyat", label: "Fiyat Listesi", icon: "finance" }] : []),
      ],
    },
    {
      label: "Stok",
      items: [
        ...(can("stock:read") ? [{ href: "/stok", label: "Stok", icon: "box" }] : []),
        ...(can("finance:read") ? [{ href: "/firma", label: "Satın Alma", icon: "firma" }] : []),
      ],
    },
    {
      label: "Yönetim",
      items: [
        ...(can("staff:read") ? [{ href: "/personel", label: "Personel", icon: "person" }] : []),
        ...(can("settings:read") ? [{ href: "/ayar", label: "Ayarlar", icon: "settings" }] : []),
        ...(can("audit:read") ? [{ href: "/log", label: "İşlem Kayıtları", icon: "log" }] : []),
        ...(can("audit:read") ? [{ href: "/sistem-izleme", label: "Sistem Durumu", icon: "chart" }] : []),
      ],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

const ACTIVE_FOR: Record<string, string[]> = {
  "/hasta": ["/hasta-detay", "/tedavi-plani", "/recete"],
  "/firma": ["/firma-detay"],
  "/personel": ["/personel-ekle"],
  "/muhasebe": ["/kasa", "/gider", "/taksit"],
};

const PREVIEW_ROLES = [
  { key: "YONETICI",  label: "Yönetici",  color: "bg-violet-600" },
  { key: "DOKTOR",    label: "Doktor",    color: "bg-emerald-600" },
  { key: "ASISTAN",   label: "Asistan",   color: "bg-sky-600" },
  { key: "BANKO",     label: "Banko",     color: "bg-amber-600" },
  { key: "MUHASEBE",  label: "Muhasebe",  color: "bg-rose-600" },
];

export function Sidebar({ user, initialBrandName = "" }: { user: { fullName: string; role: string; photoUrl?: string | null }; initialBrandName?: string }) {
  const { permissions, scopeKey, hasFeature } = usePermissions();
  const unreadStorageKey = scopedStorageKey("clinic-unread-messages", scopeKey);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messageUnread, setMessageUnread] = useState(0);
  const [desktopHovered, setDesktopHovered] = useState(false);
  const [desktopPinned, setDesktopPinned] = useState(true);
  const pinnedStorageKey = scopedStorageKey("sidebar-pinned", scopeKey);
  const desktopNavRef = useRef<HTMLElement>(null);
  // Kısa ekranda alttaki menü öğeleri görünmüyordu; o sayfadayken seçili öğe
  // görünür alana kaydırılır.
  useEffect(() => {
    const active = desktopNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  useEffect(() => {
    try {
      if (localStorage.getItem(pinnedStorageKey) === "0") setDesktopPinned(false);
    } catch {
      // depolama kapalıysa varsayılan (açık menü) kalır
    }
  }, [pinnedStorageKey]);
  const changePinned = (next: boolean) => {
    setDesktopPinned(next);
    try { localStorage.setItem(pinnedStorageKey, next ? "1" : "0"); } catch { /* yoksay */ }
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  useEscapeClose(() => setMobileOpen(false), mobileOpen);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  // Klinik adı sunucudan gelir: açılışta önce "Klinik Paneli" yazıp sonra
  // gerçek ada dönen yanıp sönme olmasın. Logo ayarlardan ayrıca yüklenir.
  const [brand, setBrand] = useState({ name: initialBrandName || "Klinik Paneli", logoUrl: "" });

  const isSuperAdmin = user.role === "SUPERADMIN";

  useEffect(() => {
    let active = true;
    const loadBrand = async () => {
      const response = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (active && response?.ok && data) {
        setBrand({ name: data.institutionName || "Klinik Paneli", logoUrl: data.logoUrl || "" });
      }
    };
    void loadBrand();
    window.addEventListener("clinic-brand-change", loadBrand);
    return () => { active = false; window.removeEventListener("clinic-brand-change", loadBrand); };
  }, []);

  const BrandMark = () => (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ${brand.logoUrl ? "border border-slate-200 bg-white" : "bg-primary"}`}>
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="Kurum logosu" className="h-full w-full object-contain p-1" />
      ) : (
        <Hospital theme="two-tone" size={19} strokeWidth={3} fill={["currentColor", "rgb(255 255 255 / 0.65)"]} className="text-white" />
      )}
    </div>
  );

  useEffect(() => {
    if (isSuperAdmin) {
      const cookieValue = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${ROLE_PREVIEW_COOKIE}=`))
        ?.split("=")[1];
      // Sunucunun kullandığı çerez tek doğru kaynaktır: kliniğe yeni girişte
      // çerez sıfırlanır, sekmede kalmış eski önizleme yazısı da silinmeli.
      const saved = parseRolePreview(cookieValue ? decodeURIComponent(cookieValue) : null);
      setPreviewRole(saved);
      try {
        if (saved) sessionStorage.setItem(ROLE_PREVIEW_STORAGE, saved);
        else sessionStorage.removeItem(ROLE_PREVIEW_STORAGE);
      } catch { /* depolama kapalı olabilir */ }
      window.dispatchEvent(new Event("preview-role-change"));
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const h = () => setMobileOpen((v) => !v);
    window.addEventListener("toggle-mobile-sidebar", h as EventListener);
    return () => window.removeEventListener("toggle-mobile-sidebar", h as EventListener);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!rolePickerOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-role-preview-root]")) return;
      setRolePickerOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [rolePickerOpen]);

  const handlePreviewRole = (role: string | null) => {
    if (role) {
      sessionStorage.setItem(ROLE_PREVIEW_STORAGE, role);
      document.cookie = `${ROLE_PREVIEW_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } else {
      sessionStorage.removeItem(ROLE_PREVIEW_STORAGE);
      document.cookie = `${ROLE_PREVIEW_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${location.protocol === "https:" ? "; Secure" : ""}`;
    }
    setPreviewRole(role);
    setRolePickerOpen(false);
    window.dispatchEvent(new Event("preview-role-change"));
    // Tam yeniden yükleme: açık sayfa eski yetkilerle istek atıp "veri
    // alınamadı" uyarısı göstermesin; menü ve yetkiler birlikte değişsin.
    window.location.assign("/anasayfa");
  };

  const userRole = user.role;
  // SuperAdmin ise seçili preview rolü, yoksa gerçek rol
  const effectiveRole = (isSuperAdmin && previewRole) ? previewRole : userRole;
  const navGroups = buildNavGroups(permissions, { whatsapp: hasFeature("whatsapp") });
  const alerts = usePanelAlerts(effectiveRole, permissions, scopeKey);

  const activePreview = PREVIEW_ROLES.find(r => r.key === previewRole);

  useEffect(() => {
    const syncUnread = () => {
      const raw = localStorage.getItem(unreadStorageKey) || "0";
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
  }, [unreadStorageKey]);

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (path === "/anasayfa") return pathname === "/anasayfa";
    // Detay/alt sayfalar ait oldukları menü öğesini aktif gösterir (ör. hasta
    // dosyası açıkken "Hastalar"); önceden hiçbir öğe seçili görünmüyordu.
    if (ACTIVE_FOR[path]?.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) return true;
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
    if (href === "/gorevler") return alerts.tasks;
    return 0;
  };

  const collapsed = !desktopPinned && !desktopHovered && !rolePickerOpen;
  const w = collapsed ? "w-[72px]" : "w-[264px]";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[170] bg-black/40 md:hidden"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMobileOpen(false);
          }}
        >
          <div className="relative flex h-dvh max-h-dvh">
            <div className="flex h-dvh max-h-dvh w-[min(86vw,288px)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl">
              <div className="shrink-0 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BrandMark />
                  <p className="max-w-[190px] truncate text-sm font-black text-slate-900">{brand.name}</p>
                </div>
                <button onClick={() => setMobileOpen(false)} aria-label="Kapat" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isSuperAdmin && (
                <div className="relative mb-2" data-role-preview-root>
                  <button
                    type="button"
                    onClick={() => setRolePickerOpen((prev) => !prev)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      previewRole
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    aria-expanded={rolePickerOpen}
                  >
                    <Code2 className="h-3.5 w-3.5 shrink-0 text-violet-500" strokeWidth={1.9} />
                    <span className="flex-1 text-left">{previewRole ? `Görünüm: ${activePreview?.label}` : "Rol Görünümü"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${rolePickerOpen ? "rotate-180" : ""}`} strokeWidth={2} />
                  </button>
                  {rolePickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Önizlenecek rol</p>
                    <div className="flex flex-col gap-0.5">
                      {PREVIEW_ROLES.map(r => (
                        <button
                          key={r.key}
                          onClick={() => {
                            handlePreviewRole(previewRole === r.key ? null : r.key);
                          }}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                            previewRole === r.key ? `${r.color} text-white` : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.color}`} />
                          {r.label}
                          {previewRole === r.key && <span className="ml-auto text-xs opacity-80">aktif</span>}
                        </button>
                      ))}
                      {previewRole && (
                        <button
                          onClick={() => {
                            handlePreviewRole(null);
                            setMobileOpen(false);
                          }}
                          className="mt-0.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          <X className="h-3.5 w-3.5" />
                          Önizlemeyi kapat
                        </button>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              )}
              </div>

              <nav aria-label="Klinik menüsü" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-3 [-webkit-overflow-scrolling:touch]">
                {navGroups.map((group) => (
                  <div key={group.label || "ana"} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                    {group.label && <p className="px-3 pb-1.5 text-xs font-semibold text-slate-500">{group.label}</p>}
                    <div className="flex flex-col gap-1">
                      {group.items.map((it) => {
                        const active = isActive(it.href);
                        return (
                        <Link key={it.href} href={it.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`group grid h-11 grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] active:duration-75 ${active ? "bg-primary-50 text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}>
                          <ModuleIcon module={it.icon as ModuleKey} active={active} />
                          <span className="truncate">{it.label}</span>
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
      {/* Daraltılmış/genişlemiş genişlik burada gerçek bir flex öğesi olarak
          tutulur (önceden aside `absolute` ile bu track'in dışına taşıp
          genişlediğinde header/ana içerik yeniden akmıyordu — sidebar
          genişleyince altındaki banner/içerik metnini kesip örtüyordu, bkz.
          denetim raporu). Artık genişlik değişimi normal flex reflow ile
          header ve ana içeriğe otomatik yansır. */}
      <div className={`relative hidden h-screen ${w} shrink-0 transition-[width] duration-200 ease-out md:block`}>
      <aside
        className="flex h-screen w-full flex-col border-r border-slate-200/80 bg-white shadow-[4px_0_18px_rgb(15_23_42/0.045),1px_0_0_rgb(15_23_42/0.03)] md:flex"
        onMouseEnter={() => setDesktopHovered(true)}
        onMouseLeave={() => { setDesktopHovered(false); setRolePickerOpen(false); }}
        onFocusCapture={() => setDesktopHovered(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDesktopHovered(false);
        }}
      >
      {/* Menü adları başlangıçta görünür; kullanıcı isterse dar görünümü seçer. */}
      <div className="flex h-16 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-3">
          <BrandMark />
          {!collapsed && <p className="max-w-[165px] truncate text-[13px] font-black tracking-tight text-slate-900">{brand.name}</p>}
        </div>
        {!collapsed && <button type="button" aria-label={desktopPinned ? "Menüyü daralt" : "Menüyü açık tut"} aria-pressed={desktopPinned} onClick={() => { changePinned(!desktopPinned); setDesktopHovered(false); }} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronDown className={`h-4 w-4 ${desktopPinned ? "rotate-90" : "-rotate-90"}`} />
        </button>}
      </div>

      {/* ── Rol Görünümü (sadece SUPERADMIN) ─────────────────────────────── */}
      {isSuperAdmin && (
        <div className="relative mx-2 mb-2 h-[42px] shrink-0" data-role-preview-root>
          {!collapsed ? (
            <>
              <button
                type="button"
                onClick={() => setRolePickerOpen((prev) => !prev)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  previewRole
                    ? "border-violet-300 bg-violet-50 text-violet-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                }`}
                aria-expanded={rolePickerOpen}
              >
                  <Code2 className="h-3.5 w-3.5 shrink-0 text-violet-500" strokeWidth={1.9} />
                  <span className="flex-1 text-left">
                    {previewRole ? `Görünüm: ${activePreview?.label}` : "Rol Görünümü"}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${rolePickerOpen ? "rotate-180" : ""}`} strokeWidth={2} />
                </button>
              {rolePickerOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Önizlenecek rol</p>
                  <div className="flex flex-col gap-0.5">
                    {PREVIEW_ROLES.map(r => (
                      <button
                        key={r.key}
                        onClick={() => handlePreviewRole(previewRole === r.key ? null : r.key)}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                          previewRole === r.key
                            ? `${r.color} text-white`
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
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
                        className="mt-0.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                        Önizlemeyi kapat
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Collapsed: dev icon + tooltip */
            <div className="relative group">
              <button
                onClick={() => setRolePickerOpen(prev => !prev)}
                className={`flex h-[42px] w-full items-center justify-center rounded-lg transition ${
                  previewRole ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
                title="Rol Görünümü"
                aria-expanded={rolePickerOpen}
              >
                <Code2 className="h-4 w-4" strokeWidth={1.9} />
              </button>
              {/* Collapsed tooltip ile mini picker */}
              {rolePickerOpen && (
                <div className="absolute left-full top-0 z-50 ml-2 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Önizlenecek rol</p>
                  {PREVIEW_ROLES.map(r => (
                    <button
                      key={r.key}
                      onClick={() => handlePreviewRole(previewRole === r.key ? null : r.key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                        previewRole === r.key
                          ? `${r.color} text-white`
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.color}`} />
                      {r.label}
                    </button>
                  ))}
                  {previewRole && (
                    <button
                      onClick={() => handlePreviewRole(null)}
                      className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
                    >
                      <X className="h-3.5 w-3.5" />
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
        </div>
      )}

      {/* Nav */}
      <nav ref={desktopNavRef} aria-label="Klinik menüsü" className="flex-1 overflow-y-auto px-2 pb-2">
        {navGroups.map((group, gi) => {
          return (
          <div key={group.label || "ana"} className={gi > 0 ? "mt-1.5 border-t border-slate-100 pt-1.5" : ""}>
            {!collapsed && group.label && <p className="px-3 pb-1.5 pt-1 text-xs font-semibold text-slate-500">{group.label}</p>}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const badge = dynamicBadge(item.href) || (item.badge ? parseInt(item.badge) : 0);
              return (
                <div key={item.href} className="relative group">
                  <Link
                    href={item.href}
                    prefetch={false}
                    onMouseEnter={() => router.prefetch(item.href)}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={
                      "relative h-11 rounded-lg px-3 text-sm transition-all duration-150 active:scale-[0.98] active:duration-75 " +
                      (collapsed ? NAV_ITEM_CLOSED : NAV_ITEM_OPEN) + " " +
                      (active
                        ? "bg-primary-50/80 font-bold text-primary shadow-[inset_3px_0_0_rgb(var(--app-primary))]"
                        : "font-semibold text-slate-700 hover:bg-slate-100/70 hover:text-slate-950") +
                      " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/70"
                    }
                  >
                    <ModuleIcon module={item.icon as ModuleKey} active={active} />
                    {!collapsed && (
                      <span className={`${NAV_LABEL_BASE} ${NAV_LABEL_OPEN} ${active ? "font-bold" : "font-semibold"}`}>
                        {item.label}
                      </span>
                    )}
                    {!collapsed && badge > 0 && (
                      <span className="rounded-full bg-gradient-to-b from-red-500 to-red-600 px-2 py-1 text-xs font-bold text-white leading-none shadow-[0_2px_6px_rgba(220,38,38,0.35)]">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-600 px-1 text-[10px] font-bold text-white shadow-[0_2px_6px_rgba(220,38,38,0.35)] ring-2 ring-white">
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
          );
        })}
      </nav>

    </aside>
    </div>
  </div>
  );
}
