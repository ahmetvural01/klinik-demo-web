"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";
import type { ComponentType } from "react";
import { getAlertPermissions, usePanelAlerts } from "@/components/layout/use-panel-alerts";
import { cachedGet } from "@/lib/client-cache";
import { useOutsideClickGroup } from "@/lib/use-outside-click";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { showToastSafe } from "@/lib/toast-client";
import { UserCheck } from "lucide-react";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";
import { Spinner } from "@/components/ui/Spinner";

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
  "/sms":           "SMS Yönetimi",
  "/sistem-izleme": "Sistem İzleme",
  "/ayar":          "Sistem Ayarları",
  "/log":           "İşlem Kayıtları",
  "/profil":        "Profilim",
  "/destek":        "Destek",
  "/dashboard":     "Dashboard",
};

// Sidebar'daki modül ikonuyla aynı görsel kimliği sayfa başlığında da
// göstermek için — bir modülün sidebar'da bir ikonu, sayfa içinde başka
// (jenerik) bir ikonu olmamalı.
const PAGE_MODULE: Record<string, ModuleKey> = {
  "/anasayfa": "home",
  "/dashboard": "home",
  "/randevu": "calendar",
  "/hasta": "users",
  "/hasta-ekle": "users",
  "/hasta-detay": "users",
  "/hasta-takip": "follow",
  "/gorevler": "clipboard",
  "/tedavi-plani": "clipboard",
  "/lab": "flask",
  "/recete": "clipboard",
  "/muhasebe": "finance",
  "/kasa": "finance",
  "/finans": "finance",
  "/taksit": "finance",
  "/gider": "finance",
  "/rapor": "rapor",
  "/firma": "firma",
  "/firma-detay": "firma",
  "/stok": "box",
  "/personel": "person",
  "/personel-ekle": "person",
  "/sms": "sms",
  "/sistem-izleme": "chart",
  "/ayar": "settings",
  "/log": "log",
  "/profil": "profile",
  "/destek": "support",
};

function moduleForPath(pathname: string): ModuleKey | null {
  return PAGE_MODULE[pathname] ?? null;
}

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

  if (pathname.startsWith("/hasta")) {
    return { ...base, quickActions: [{ href: "/randevu", label: "Randevu Oluştur", icon: CalendarPlus }] };
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
    // Lab, diğer tüm sayfalar gibi kendi başlığını topbar'da göstermeliydi —
    // önceden yalnızca burada gizleniyordu, bu da sayfanın kimliksiz/başlıksız
    // görünmesine yol açıyordu (bkz. kullanıcı ekran görüntüsü geri bildirimi).
    return {
      ...base,
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
  const [showQuickPatientCreate, setShowQuickPatientCreate] = useState(false);
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
  const { canSeeTaksit, canSeeStok, canSeeLab, canSeeWaiting } = getAlertPermissions(effectiveRole);

  useEffect(() => {
    if (!canSeeWaiting) return;
    const currentIds = new Set(alerts.waitingList.map((w) => w.id));
    if (seenWaitingIdsRef.current === null) {
      // İlk yükleme: mevcut bekleyenler için toast göstermeden yalnızca kaydet.
      seenWaitingIdsRef.current = currentIds;
      return;
    }
    const previous = seenWaitingIdsRef.current;
    const newlyArrived = alerts.waitingList.filter((w) => !previous.has(w.id));
    newlyArrived.forEach((w) => {
      showToastSafe({
        type: "info",
        title: "Hasta geldi",
        message: `${w.patientName} geldi — Dr. ${w.doctorName} bekleniyor`,
        duration: 6000,
      });
    });
    seenWaitingIdsRef.current = currentIds;
  }, [alerts.waitingList, canSeeWaiting]);

  const [showAlerts, setShowAlerts] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [waitingPopoverPos, setWaitingPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [alertPopoverPos, setAlertPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [messageUnread, setMessageUnread] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const waitingRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  const pageConfig = getTopbarConfig(pathname || "");

  // Sayfa başlığı
  const pageTitle = PAGE_TITLES[pathname ?? ""] ?? "";
  const pageModule = moduleForPath(pathname ?? "");

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateWaitingPopover = () => {
      const rect = waitingRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 288;
      setWaitingPopoverPos({
        top: Math.round(rect.bottom + 10),
        left: Math.round(Math.min(rect.right - width, window.innerWidth - width - 16)),
        width,
      });
    };

    const updateAlertPopover = () => {
      const rect = alertRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 288;
      setAlertPopoverPos({
        top: Math.round(rect.bottom + 10),
        left: Math.round(Math.min(rect.right - width, window.innerWidth - width - 16)),
        width,
      });
    };

    if (showWaiting) updateWaitingPopover();
    if (showAlerts) updateAlertPopover();

    const handleReflow = () => {
      if (showWaiting) updateWaitingPopover();
      if (showAlerts) updateAlertPopover();
    };

    window.addEventListener("resize", handleReflow);
    window.addEventListener("scroll", handleReflow, true);
    return () => {
      window.removeEventListener("resize", handleReflow);
      window.removeEventListener("scroll", handleReflow, true);
    };
  }, [showWaiting, showAlerts]);

  // Banko bir hastayı "Bekliyor" (geldi) işaretlediğinde, diğer katlarda/
  // odalarda çalışan doktor/asistanlar sayfayı yenilemeden fark edebilsin
  // diye, bekleme listesine yeni giren her hasta için bir toast bildirimi
  // gösteriyoruz (ilk yüklemede zaten bekleyenler için değil, sadece
  // bu oturum açıkken sonradan eklenenler için).
  const seenWaitingIdsRef = useRef<Set<string> | null>(null);

  // Dışarı tıklanınca kapat — sistem genelindeki ortak dış-tıklama
  // sözleşmesi (bkz. src/lib/use-outside-click.ts); önceden burada tek
  // başına `mousedown` kullanılıyordu, diğer tüm dropdown/popover'lar
  // `pointerdown` kullanıyordu (dokunmatik ekranlarda daha tutarlı) —
  // artık hepsi aynı olayı dinliyor.
  useOutsideClickGroup([
    { ref: alertRef, onOutside: () => setShowAlerts(false) },
    { ref: waitingRef, onOutside: () => setShowWaiting(false) },
    { ref: searchRef, onOutside: () => { setShowSearchDropdown(false); setQ(""); setSearchResults([]); } },
  ]);

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
        const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&take=8&summary=false`);
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
    <>
    <header className={`relative z-[160] isolate flex w-full min-w-0 shrink-0 items-center justify-between border-b border-slate-200 bg-[rgb(var(--app-surface))]/95 shadow-[0_1px_0_rgb(15_23_42/0.025),0_6px_20px_rgb(15_23_42/0.025)] backdrop-blur ${pageConfig.compact ? "min-h-14 gap-2 px-3 py-2 sm:gap-3 sm:px-4" : "min-h-16 gap-2 px-3 py-2 sm:gap-4 sm:px-5"}`}>
      {/* Sol: Sayfa başlığı veya arama */}
      <div className={`flex min-w-0 flex-1 items-center ${pageConfig.compact ? "gap-2" : "gap-4"}`}>
        <button
          onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
          aria-label="Menüyü aç"
          className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-[var(--shadow-rest)] hover:border-slate-300 hover:bg-slate-50 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {pageConfig.showPageTitle && pageTitle && (
          <span key={pathname} className="ui-page-title-in group hidden shrink-0 items-center gap-2.5 lg:flex">
            {pageModule && <ModuleIcon module={pageModule} size="sm" />}
            <span className="font-display text-[15px] font-bold text-slate-900">{pageTitle}</span>
          </span>
        )}
        {pageConfig.showSearch && <div className="relative flex min-w-0 max-w-sm flex-1">
          <form onSubmit={search} className="min-w-0 w-full">
            <div ref={searchRef} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 shadow-[var(--shadow-rest)] transition focus-within:border-primary/35 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/12">
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
                className="flex-1 border-none bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder-slate-400"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setSearchResults([]); setShowSearchDropdown(false); }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
                {searchResults.length > 0 && showSearchDropdown && (
                <div id="search-results" className="ui-popover absolute left-0 right-0 top-full z-[220] mt-2 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-100/80 px-4 py-2 text-xs font-bold text-slate-500">
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
                <div className="ui-popover absolute left-0 right-0 top-full z-[220] mt-2 px-4 py-3 text-center text-sm text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <Spinner className="h-3.5 w-3.5 text-primary" />
                    Hastalar aranıyor…
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>}
      </div>

      {/* Sağ taraf */}
      <div className={`flex shrink-0 items-center ${pageConfig.compact ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3"}`}>
        {/* Hızlı Erişim */}
        {pageConfig.quickActions.length > 0 && (
          <div className="hidden items-center gap-2 xl:flex">
            {pageConfig.quickActions.map((action) => action.href === "/hasta-ekle" ? (
              <Button key={action.href + action.label} type="button" onClick={() => setShowQuickPatientCreate(true)} variant="secondary" size="sm" icon={action.icon}>
                {action.label}
              </Button>
            ) : (
              <Button key={action.href + action.label} href={action.href} variant="secondary" size="sm" icon={action.icon}>
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Tarih & Saat */}
        {pageConfig.showDateTime && (
          <div className="hidden items-center gap-2 border-l border-slate-100 pl-3 text-xs text-slate-400 xl:flex">
            <span className="text-slate-500">{today}</span>
            <span className="h-3.5 w-px bg-slate-200" />
            <Clock />
          </div>
        )}

        {/* Bekleme odası — hasta "Bekliyor" (geldi) işaretlendiğinde sayfa/kat
            farkı olmadan tüm klinik personeli bunu hemen görebilsin diye,
            uygulamanın her ekranında görünen topbar'a bağımsız bir gösterge
            olarak eklendi (bkz. Randevu ekranındaki "Bekliyor" işaretlemesi,
            ham durum hâlâ GELDI — bkz. src/lib/appointment-status.ts). */}
        {pageConfig.showAlerts && canSeeWaiting && <div className="relative hidden sm:block" ref={waitingRef}>
          <Tooltip label="Bekleyen hastalar" side="bottom">
            <button
              onClick={() => setShowWaiting(v => !v)}
              aria-label="Bekleyen hastalar"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            >
              <UserCheck className="h-4 w-4" />
              {alerts.waiting > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                  {alerts.waiting > 9 ? "9+" : alerts.waiting}
                </span>
              )}
            </button>
          </Tooltip>
          {showWaiting && waitingPopoverPos && typeof document !== "undefined" && createPortal(
            <div
              className="ui-popover z-[260] overflow-hidden"
              style={{ position: "fixed", top: waitingPopoverPos.top, left: waitingPopoverPos.left, width: waitingPopoverPos.width }}
            >
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">Bekleme Odası</p>
              </div>
              {alerts.waitingList.length > 0 ? (
                <div className="max-h-80 divide-y divide-slate-50 overflow-y-auto py-1">
                  {alerts.waitingList.map((w) => (
                    <a
                      key={w.id}
                      href="/randevu"
                      onClick={() => setShowWaiting(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                        <UserCheck className="h-4 w-4 text-emerald-600" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{w.patientName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {new Date(w.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · Dr. {w.doctorName}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-slate-400">Şu an bekleyen hasta yok</p>
                </div>
              )}
            </div>,
            document.body
          )}
        </div>}

        {/* Alarm zili */}
        {pageConfig.showAlerts && <div className="relative" ref={alertRef}>
          <Tooltip label="Uyarılar" side="bottom">
            <button
              onClick={() => setShowAlerts(v => !v)}
              aria-label="Uyarılar"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            >
              <Bell className="h-4 w-4" />
              {totalAlerts > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {totalAlerts > 9 ? "9+" : totalAlerts}
                </span>
              )}
            </button>
          </Tooltip>
          {/* Dropdown */}
          {showAlerts && alertPopoverPos && typeof document !== "undefined" && createPortal(
            <div
              className="ui-popover z-[260] overflow-hidden"
              style={{ position: "fixed", top: alertPopoverPos.top, left: alertPopoverPos.left, width: alertPopoverPos.width }}
            >
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
                      <p className="text-sm font-semibold text-slate-800">{alerts.lab} Bekleyen Laboratuvar İşi</p>
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
            </div>,
            document.body
          )}
        </div>}

        {/* Kullanıcı */}
        <div className="flex items-center gap-2.5 border-l border-slate-100 pl-2 sm:pl-3">
          <div className="hidden text-right lg:block">
            <p className="text-sm font-bold leading-tight text-slate-800">{displayName}</p>
            <Badge tone="info" size="sm">{displayRole}</Badge>
          </div>
          <a href="/profil" className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/20 transition hover:ring-primary/50" title="Profilim">
            {user.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary-strong text-xs font-bold text-white">{initials}</span>
            )}
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </a>
        </div>
      </div>
    </header>
    <PatientFormModal
      open={showQuickPatientCreate}
      onClose={() => setShowQuickPatientCreate(false)}
      onSaved={(patient) => { setShowQuickPatientCreate(false); router.push(`/hasta-detay?id=${patient.id}`); }}
    />
    </>
  );
}
