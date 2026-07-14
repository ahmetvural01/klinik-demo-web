"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Menu,
  Search,
  X,
  Bell,
  CalendarPlus,
  UserPlus,
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  PackageSearch,
  FlaskConical,
  Loader2,
} from "lucide-react";
import type { ComponentType } from "react";
import { getAlertPermissions, usePanelAlerts } from "@/components/layout/use-panel-alerts";
import { cachedGet } from "@/lib/client-cache";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Props = { user: { fullName: string; role: string; photoUrl?: string | null } };

const roleLabel: Record<string, string> = {
  YONETICI:   "Yönetici",
  DOKTOR:     "Diş Hekimi",
  ASISTAN:    "Asistan",
  BANKO:      "Banko Görevlisi",
  MUHASEBE:   "Muhasebe",
  SUPERADMIN: "Süper Admin",
};

const PAGE_TITLES: Record<string, string> = {
  "/anasayfa":      "Anasayfa",
  "/muhasebe":      "Muhasebe Merkezi",
  "/randevu":       "Randevular",
  "/hasta":         "Hastalar",
  "/hasta-ekle":    "Yeni Hasta Kaydı",
  "/hasta-takip":   "Hasta Takip",
  "/hasta-detay":   "Hasta Detayı",
  "/gorevler":      "Görev Merkezi",
  "/tedavi-plani":  "Tedavi Planları",
  "/lab":           "Laboratuvar Takibi",
  "/recete":        "Reçete Görüntüleme",
  "/muayene":       "Muayene",
  "/kasa":          "Kasa / Banka",
  "/finans":        "Doktor Hakedişim",
  "/taksit":        "Taksit Takibi",
  "/gider":         "Giderler",
  "/rapor":         "Raporlar",
  "/firma":         "Satın Alma",
  "/firma-detay":   "Tedarikçi Detayı",
  "/stok":          "Stok Yönetimi",
  "/personel":      "Personeller",
  "/personel-ekle": "Yeni Personel",
  "/fiyat":         "Fiyat Listesi",
  "/sms":           "SMS Kayıtları",
  "/sistem-izleme": "Sistem İzleme",
  "/ayar":          "Sistem Ayarları",
  "/log":           "İşlem Kayıtları",
  "/profil":        "Profilim",
  "/destek":        "Destek",
  "/dashboard":     "Dashboard",
};

type MessageLite = { id: string; userId: string; createdAt: string };

type TopbarQuickAction = { href: string; label: string; icon: ComponentType<{ className?: string }> };
type TopbarPageConfig = {
  showDateTime: boolean;
  showAlerts: boolean;
  showPageTitle: boolean;
  showSearch: boolean;
  compact: boolean;
  searchPlaceholder: string;
  quickActions: TopbarQuickAction[];
};

function getTopbarConfig(pathname: string): TopbarPageConfig {
  const base: TopbarPageConfig = {
    showDateTime: true,
    showAlerts: true,
    showPageTitle: true,
    showSearch: true,
    compact: false,
    searchPlaceholder: "İsim, TC veya telefon ile hasta ara...",
    quickActions: [
      { href: "/randevu", label: "Randevu Oluştur", icon: CalendarPlus },
      { href: "/hasta-ekle", label: "Hasta Ekle", icon: UserPlus },
    ],
  };

  if (pathname.startsWith("/hasta-takip")) {
    return { ...base, quickActions: [{ href: "/gorevler", label: "Görev Merkezi", icon: ClipboardList }] };
  }

  if (pathname.startsWith("/randevu")) {
    return { ...base, quickActions: [{ href: "/hasta-ekle", label: "Yeni Hasta", icon: UserPlus }] };
  }

  if (pathname.startsWith("/gorevler")) {
    return { ...base, quickActions: [{ href: "/hasta-takip", label: "Hasta Takip", icon: ClipboardList }] };
  }

  if (pathname.startsWith("/hasta-detay")) {
    return {
      ...base,
      quickActions: [
        { href: "/randevu", label: "Randevular", icon: CalendarPlus },
        { href: "/gorevler", label: "Görev Merkezi", icon: ClipboardList },
      ],
    };
  }

  if (pathname.startsWith("/lab") || pathname.startsWith("/stok") || pathname.startsWith("/muhasebe")) {
    return {
      ...base,
      showPageTitle: pathname.startsWith("/lab") ? false : base.showPageTitle,
      showSearch: pathname.startsWith("/lab") ? true : base.showSearch,
      compact: pathname.startsWith("/lab") ? true : base.compact,
      quickActions: [{ href: "/gorevler", label: "Görev Merkezi", icon: ClipboardList }],
    };
  }

  return base;
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      setTime(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    fmt();
    const t = setInterval(fmt, 30000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums text-sm font-semibold text-slate-700">{time}</span>;
}

export function Topbar({ user }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const baseTitleRef = useRef<string>("Klinik Yönetim Paneli");
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<{id: string; fullName: string; tcNo: string; phone: string}[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const getEffectiveRole = useCallback(() => sessionStorage.getItem("dev-preview-role") || user.role, [user.role]);
  const [effectiveRole, setEffectiveRole] = useState(user.role);
  useEffect(() => {
    setEffectiveRole(getEffectiveRole());
    const onStorage = () => setEffectiveRole(getEffectiveRole());
    window.addEventListener("storage", onStorage);
    // sidebar aynı pencerede sessionStorage'ı değiştirdiğinde storage event fırlamaz,
    // bu yüzden custom event de dinle
    window.addEventListener("preview-role-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("preview-role-change", onStorage);
    };
  }, [getEffectiveRole]);
  const hidePhone = effectiveRole === "DOKTOR" || effectiveRole === "ASISTAN";
  const alerts = usePanelAlerts(effectiveRole);
  const [showAlerts, setShowAlerts] = useState(false);
  const [messageUnread, setMessageUnread] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  const pageConfig = getTopbarConfig(pathname || "");

  // Sayfa başlığı
  const pageTitle = PAGE_TITLES[pathname ?? ""] ?? "";

  useEffect(() => {
    if (typeof document !== "undefined") {
      baseTitleRef.current = document.title || "Klinik Yönetim Paneli";
    }
  }, []);

  useEffect(() => {
    cachedGet<{ id?: string }>("/api/auth/me", 60_000)
      .then((d) => setCurrentUserId(d?.id || ""))
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (pathname.startsWith("/anasayfa")) return;

    const updateUnread = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) return;
        const list = (await res.json()) as MessageLite[];
        const lastSeenRaw = localStorage.getItem("clinic-messages-last-seen") || "";
        const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;

        const unread = Array.isArray(list)
          ? list.filter((m) => new Date(m.createdAt).getTime() > lastSeen && m.userId !== currentUserId).length
          : 0;

        setMessageUnread(unread);
        localStorage.setItem("clinic-unread-messages", String(unread));
        window.dispatchEvent(new Event("clinic-unread-messages-change"));
      } catch {}
    };

    updateUnread();
    timer = setInterval(updateUnread, 60000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentUserId, pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = baseTitleRef.current || "Klinik Yönetim Paneli";
    document.title = messageUnread > 0 ? `(${messageUnread}) ${base}` : base;
  }, [messageUnread]);

  const { canSeeTaksit, canSeeStok, canSeeLab } = getAlertPermissions(effectiveRole);

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
        setQ("");
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced search
  useEffect(() => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    // Her aramada güncel rolü oku
    setEffectiveRole(getEffectiveRole());
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&take=8`);
        if (res.ok) {
          const json = await res.json();
          const patients = Array.isArray(json) ? json : (json?.patients ?? []);
          setSearchResults(patients.slice(0, 8));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const [selectedResultIdx, setSelectedResultIdx] = useState(-1);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSearchDropdown(false);
      setQ("");
      setSearchResults([]);
      setSelectedResultIdx(-1);
      return;
    }

    if (!showSearchDropdown || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedResultIdx(idx => Math.min(idx + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedResultIdx(idx => Math.max(idx - 1, -1));
    } else if (e.key === "Enter" && selectedResultIdx >= 0) {
      e.preventDefault();
      router.push(`/hasta-detay?id=${searchResults[selectedResultIdx].id}`);
      setShowSearchDropdown(false);
      setQ("");
      setSearchResults([]);
      setSelectedResultIdx(-1);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/hasta?q=${encodeURIComponent(q.trim())}`);
  };

  const totalAlerts = alerts.taksit + alerts.stok + alerts.lab;
  const displayName = user.fullName || "Kullanıcı";
  const initials = displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const displayRole = roleLabel[effectiveRole] || user.role;

  return (
    <header className={`flex items-center justify-between border-b border-slate-200 bg-white shadow-sm ${pageConfig.compact ? "min-h-14 gap-2 px-3 py-2 sm:gap-3 sm:px-4" : "min-h-16 gap-2 px-3 py-2 sm:gap-4 sm:px-5"}`}>
      {/* Sol: Sayfa başlığı veya arama */}
      <div className={`flex flex-1 items-center ${pageConfig.compact ? "gap-2" : "gap-4"}`}>
        <button
          onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
          aria-label="Menüyü aç"
          className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {pageConfig.showPageTitle && pageTitle && (
          <span className="hidden text-base font-bold text-slate-800 md:block">{pageTitle}</span>
        )}
        {pageConfig.showSearch && <div className="relative flex max-w-sm flex-1">
          <form onSubmit={search} className="w-full">
            <div ref={searchRef} className="relative flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                placeholder={pageConfig.searchPlaceholder}
                role="combobox"
                aria-controls="search-results"
                aria-label="Hasta ara - ad, TC no veya telefon ile"
                aria-expanded={showSearchDropdown}
                aria-autocomplete="list"
                className="flex-1 border-none bg-transparent text-sm font-medium text-slate-700 outline-none placeholder-slate-400"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setSearchResults([]); setShowSearchDropdown(false); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
                {searchResults.length > 0 && showSearchDropdown && (
                <div id="search-results" className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs font-bold text-slate-500">
                    <span>{searchResults.length} sonuç</span>
                  </div>
                  {searchResults.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={selectedResultIdx === idx}
                      onMouseEnter={() => setSelectedResultIdx(idx)}
                      onClick={() => {
                        router.push(`/hasta-detay?id=${p.id}`);
                        setShowSearchDropdown(false);
                        setQ("");
                        setSearchResults([]);
                        setSelectedResultIdx(-1);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                        selectedResultIdx === idx ? "bg-primary/10" : "hover:bg-slate-50"
                      } ${idx < searchResults.length - 1 ? "border-b border-slate-50" : ""}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {p.fullName.split(" ").map(w => w[0]).slice(0, 1).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{p.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{p.tcNo}{!hidePhone ? ` · ${p.phone}` : ""}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
              {showSearchDropdown && q.length >= 2 && searchResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-500 shadow-lg">
                  <div className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Hastalar aranıyor…
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>}
      </div>

      {/* Sağ taraf */}
      <div className={`flex items-center ${pageConfig.compact ? "gap-2" : "gap-3"}`}>
        {/* Hızlı Erişim */}
        {pageConfig.quickActions.length > 0 && (
          <div className="hidden items-center gap-2 md:flex">
            {pageConfig.quickActions.map((action) => (
              <Button key={action.href + action.label} href={action.href} variant="secondary" size="sm" icon={action.icon}>
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Tarih & Saat */}
        {pageConfig.showDateTime && (
          <div className="hidden items-center gap-2 border-l border-slate-100 pl-3 text-xs text-slate-400 md:flex">
            <span className="text-slate-500">{today}</span>
            <span className="h-3.5 w-px bg-slate-200" />
            <Clock />
          </div>
        )}

        {/* Alarm zili */}
        {pageConfig.showAlerts && <div className="relative" ref={alertRef}>
          <button
            onClick={() => setShowAlerts(v => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            title="Uyarılar"
          >
            <Bell className="h-4 w-4" />
            {totalAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {totalAlerts > 9 ? "9+" : totalAlerts}
              </span>
            )}
          </button>
          {/* Dropdown */}
          {showAlerts && (
            <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">Sistem Uyarıları</p>
              </div>
              <div className="divide-y divide-slate-50 py-1">
                {/* Taksit bildirimi — sadece yetkili roller */}
                {canSeeTaksit && (alerts.taksit > 0 ? (
                  <a href="/muhasebe?tab=taksit" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.taksit} Gecikmiş Taksit</p>
                      <p className="text-xs text-slate-500">Taksit takibine git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </span>
                    <p className="text-sm text-slate-600">Gecikmiş taksit yok</p>
                  </div>
                ))}
                {/* Stok bildirimi — sadece yetkili roller */}
                {canSeeStok && (alerts.stok > 0 ? (
                  <a href="/stok" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
                      <PackageSearch className="h-4 w-4 text-amber-500" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.stok} Kritik Stok Kalemi</p>
                      <p className="text-xs text-slate-500">Stok yönetimine git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </span>
                    <p className="text-sm text-slate-600">Stok seviyesi normal</p>
                  </div>
                ))}
                {/* Lab bildirimi — sadece yetkili roller */}
                {canSeeLab && (alerts.lab > 0 ? (
                  <a href="/lab" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <FlaskConical className="h-4 w-4 text-primary" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.lab} Bekleyen Lab Siparişi</p>
                      <p className="text-xs text-slate-500">Laboratuvar sayfasına git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </span>
                    <p className="text-sm text-slate-600">Bekleyen lab siparişi yok</p>
                  </div>
                ))}
                {/* Hiçbir bildirim grubu yoksa */}
                {!canSeeTaksit && !canSeeStok && !canSeeLab && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-slate-400">Bu rol için sistem uyarısı bulunmuyor</p>
                  </div>
                )}
              </div>
              {totalAlerts === 0 && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Tüm sistemler normal çalışıyor</p>
                </div>
              )}
            </div>
          )}
        </div>}

        {/* Kullanıcı */}
        <div className="flex items-center gap-2.5 border-l border-slate-100 pl-3">
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold leading-tight text-slate-800">{displayName}</p>
            <Badge tone="info" size="sm">{displayRole}</Badge>
          </div>
          <a href="/profil" className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/20 transition hover:ring-primary/50" title="Profilim">
            {user.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary text-xs font-bold text-white">{initials}</span>
            )}
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </a>
        </div>
      </div>
    </header>
  );
}
