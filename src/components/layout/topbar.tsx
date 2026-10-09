"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
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
  ClipboardPlus,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  PackageSearch,
  FlaskConical,
  Wallet,
} from "lucide-react";
import { getAlertPermissions, usePanelAlerts } from "@/components/layout/use-panel-alerts";
import { cachedGet } from "@/lib/client-cache";
import { useOutsideClickGroup } from "@/lib/use-outside-click";
import { scopedStorageKey } from "@/lib/scoped-client-storage";
import { Tooltip } from "@/components/ui/Tooltip";
import { showToastSafe } from "@/lib/toast-client";
import { UserCheck } from "lucide-react";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { Spinner } from "@/components/ui/Spinner";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { CreateMenu, UserMenu } from "@/components/layout/header-menus";
import { roleLabel } from "@/lib/staff-roles";
import { clientMutation } from "@/lib/client-mutation";
import { routes } from "@/lib/routes";
import { pageTitleFor } from "@/lib/page-titles";

type Props = { user: { fullName: string; role: string; photoUrl?: string | null } };

type MessageLite = { id: string; userId: string; createdAt: string };

// Üst bar artık sayfa adını yazmaz (sayfanın kendi başlığı var — aynı ad iki
// kez görünüyordu) ve sayfaya göre değişen hızlı düğmeler göstermez: bütün
// ekranlarda aynı yerde aynı "Yeni" menüsü ve aynı hesap menüsü durur.
const SEARCH_PLACEHOLDER = "Hasta ara: ad, TC veya telefon…";

export function Topbar({ user }: Props) {
  const { permissions, can, scopeKey } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const baseTitleRef = useRef<string>("Klinik Yönetim Paneli");
  const [q, setQ] = useState("");
  const [showQuickPatientCreate, setShowQuickPatientCreate] = useState(false);
  const [searchResults, setSearchResults] = useState<{id: string; fullName: string; tcNo: string; phone: string}[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
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
  const hidePhone = !can("patients:phone");
  const alerts = usePanelAlerts(effectiveRole, permissions, scopeKey);
  const unreadStorageKey = scopedStorageKey("clinic-unread-messages", scopeKey);
  const lastSeenStorageKey = scopedStorageKey("clinic-messages-last-seen", scopeKey);
  const alertPermissions = getAlertPermissions(effectiveRole, permissions);
  const { canSeeStok, canSeeLab, canSeeWaiting, canSeeTasks } = alertPermissions;
  // Taksit uyarısı yalnız taksit listesini (Muhasebe > Alacaklar) açabilen
  // kullanıcıya gösterilir; önceden Doktor/Asistan "yetkiniz yok" sayfasına,
  // Banko taksit listesi olmayan deftere düşüyordu.
  const canSeeTaksit = alertPermissions.canSeeTaksit && can("finance:center") && can("finance:read");
  const [loggingOut, setLoggingOut] = useState(false);

  // "Yeni" menüsü: yalnız kullanıcının gerçekten kaydedebileceği işler
  // görünür (ör. Muhasebe rolünde "Yeni hasta" yok — formu doldurduktan sonra
  // "yetkiniz yok" almasın). Bağlantılar ilgili sayfanın formunu açar.
  const createItems = [
    ...(can("appointments:write") ? [{ key: "randevu", label: "Randevu", description: "Takvimde boş saate randevu ver", icon: CalendarPlus, href: "/randevu?yeni=1" }] : []),
    ...(can("patients:write") ? [{ key: "hasta", label: "Hasta", description: "Yeni hasta dosyası aç", icon: UserPlus, onSelect: () => setShowQuickPatientCreate(true) }] : []),
    ...(can("payments:write") && can("finance:center") ? [{ key: "tahsilat", label: "Tahsilat", description: "Hastadan ödeme al", icon: Wallet, href: "/muhasebe?islem=gelir" }] : []),
    ...(can("clinictasks:write") ? [{ key: "gorev", label: "Görev", description: "Ekipten birine iş ata", icon: ClipboardPlus, href: "/gorevler?yeni=1" }] : []),
    ...(can("lab:write") ? [{ key: "lab", label: "Lab işi", description: "Laboratuvara iş gönder", icon: FlaskConical, href: "/lab?yeni=1" }] : []),
  ];

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await clientMutation("/api/auth/logout", { method: "POST" }, "Oturum kapatılamadı.");
      window.location.href = "/giris";
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Oturum kapatılamadı." });
      setLoggingOut(false);
    }
  };

  // "Hasta geldi" bildirimi yalnız GERÇEKTEN yeni gelen hasta için çıkmalı.
  // Önceden sayfa her yeniden yüklendiğinde (F5, şube değişimi) bekleme
  // odasında zaten oturan herkes için bildirim tekrar çıkıyordu: ilk anda
  // liste boş geldiği için herkes "yeni" sayılıyordu. Duyurulan randevular
  // bu sekmede gün bazında saklanır; sekmenin ilk açılışında ise ilk 20 sn
  // içinde gelen liste "zaten bekleyenler" kabul edilir, bildirim çıkmaz.
  const waitingMountedAtRef = useRef(Date.now());
  const waitingHasStoredBaselineRef = useRef(false);
  useEffect(() => {
    if (!canSeeWaiting) return;
    const dayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    const storageKey = scopedStorageKey(`waiting-announced-${dayKey}`, scopeKey);
    if (seenWaitingIdsRef.current === null) {
      let stored: string[] | null = null;
      try {
        const raw = sessionStorage.getItem(storageKey);
        stored = raw ? (JSON.parse(raw) as string[]) : null;
      } catch {
        stored = null;
      }
      waitingHasStoredBaselineRef.current = Array.isArray(stored);
      seenWaitingIdsRef.current = new Set(Array.isArray(stored) ? stored : []);
    }
    const seen = seenWaitingIdsRef.current;
    const newlyArrived = alerts.waitingList.filter((w) => !seen.has(w.id));
    if (newlyArrived.length === 0) return;
    const buildingBaseline = !waitingHasStoredBaselineRef.current && Date.now() - waitingMountedAtRef.current < 20_000;
    if (!buildingBaseline) {
      newlyArrived.forEach((w) => {
        showToastSafe({
          type: "info",
          title: "Hasta geldi",
          message: `${w.patientName} geldi — Dr. ${w.doctorName} bekleniyor`,
          duration: 6000,
        });
      });
    }
    newlyArrived.forEach((w) => seen.add(w.id));
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...seen]));
    } catch {
      // Gizli sekme vb. depolama kapalıysa yalnız bellekteki küme kullanılır.
    }
  }, [alerts.waitingList, canSeeWaiting, scopeKey]);

  const [showAlerts, setShowAlerts] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [waitingPopoverPos, setWaitingPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [alertPopoverPos, setAlertPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [messageUnread, setMessageUnread] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const waitingRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (pathname.startsWith("/anasayfa")) return;

    const updateUnread = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) return;
        const list = (await res.json()) as MessageLite[];
        const lastSeenRaw = localStorage.getItem(lastSeenStorageKey) || "";
        const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;

        const unread = Array.isArray(list)
          ? list.filter((m) => new Date(m.createdAt).getTime() > lastSeen && m.userId !== currentUserId).length
          : 0;

        setMessageUnread(unread);
        localStorage.setItem(unreadStorageKey, String(unread));
        window.dispatchEvent(new Event("clinic-unread-messages-change"));
      } catch {}
    };

    updateUnread();
    timer = setInterval(updateUnread, 60000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentUserId, lastSeenStorageKey, pathname, unreadStorageKey]);

  // Tarayıcı sekmesinde sayfa adı + okunmamış mesaj sayısı (ör. "(2) Randevular · CepKlinik").
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = baseTitleRef.current || "Klinik Yönetim Paneli";
    const page = pageTitleFor(pathname);
    const title = page ? `${page} · ${base}` : base;
    document.title = messageUnread > 0 ? `(${messageUnread}) ${title}` : title;
  }, [messageUnread, pathname]);

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
    const normalizedQuery = q.trim();
    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    // Her aramada güncel rolü oku
    setEffectiveRole(getEffectiveRole());
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(normalizedQuery)}&take=8&summary=false`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("PATIENT_SEARCH_FAILED");
        const json = await res.json();
        const patients = Array.isArray(json) ? json : (json?.patients ?? []);
        setSearchResults(patients.slice(0, 8));
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchError(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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

  const totalAlerts = (canSeeTaksit ? alerts.taksit : 0) + (canSeeStok ? alerts.stok : 0) + (canSeeLab ? alerts.lab : 0) + (canSeeTasks ? alerts.tasks : 0);
  const displayName = user.fullName || "Kullanıcı";
  const displayRole = roleLabel(effectiveRole) || user.role;

  return (
    <>
    <header className="relative z-[160] isolate flex min-h-14 w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[rgb(var(--app-surface))] px-3 py-2 sm:gap-3 sm:px-4 lg:px-5">
      {/* Sol: menü (mobil), şube, hasta arama */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
          aria-label="Menüyü aç"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <BranchSwitcher />
        {/* Hastalar sayfasının kendi araması var; orada ikinci kutu kafa karıştırıyordu. */}
        {can("patients:read") && pathname !== "/hasta" && <div className="relative flex min-w-0 max-w-md flex-1 sm:min-w-[280px]">
          <form onSubmit={search} className="min-w-0 w-full">
            <div ref={searchRef} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 shadow-[var(--shadow-rest)] transition focus-within:border-primary/35 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/12">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                placeholder={SEARCH_PLACEHOLDER}
                role="combobox"
                aria-controls="search-results"
                aria-label="Hasta ara - ad, TC no veya telefon ile"
                aria-expanded={showSearchDropdown}
                aria-autocomplete="list"
                aria-activedescendant={selectedResultIdx >= 0 ? `search-result-${selectedResultIdx}` : undefined}
                className="flex-1 border-none bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder-slate-400"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setSearchResults([]); setShowSearchDropdown(false); }}
                  aria-label="Aramayı temizle"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
                {searchResults.length > 0 && showSearchDropdown && (
                <div id="search-results" role="listbox" className="ui-popover absolute left-0 right-0 top-full z-[220] mt-2 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-100/80 px-4 py-2 text-xs font-bold text-slate-500">
                    <span>{searchResults.length} sonuç</span>
                  </div>
                  {searchResults.map((p, idx) => (
                    <button
                      key={p.id}
                      id={`search-result-${idx}`}
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
              {showSearchDropdown && q.trim().length >= 2 && searchResults.length === 0 && (
                <div className="ui-popover absolute left-0 right-0 top-full z-[220] mt-2 px-4 py-3 text-center text-sm text-slate-500">
                  {searchLoading ? (
                    <div role="status" className="inline-flex items-center gap-2">
                      <Spinner className="h-3.5 w-3.5 text-primary" />
                      Hastalar aranıyor...
                    </div>
                  ) : searchError ? (
                    <p role="alert" className="text-red-600">Arama şu anda yapılamıyor. Lütfen tekrar deneyin.</p>
                  ) : (
                    <p>Bu aramayla eşleşen hasta bulunamadı.</p>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>}
      </div>

      {/* Sağ taraf */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <CreateMenu items={createItems} />

        {/* Bekleme odası — hasta "Bekliyor" (geldi) işaretlendiğinde sayfa/kat
            farkı olmadan tüm klinik personeli bunu hemen görebilsin diye,
            uygulamanın her ekranında görünen topbar'a bağımsız bir gösterge
            olarak eklendi (bkz. Randevu ekranındaki "Bekliyor" işaretlemesi,
            ham durum hâlâ GELDI — bkz. src/lib/appointment-status.ts). */}
        {canSeeWaiting && <div className="relative hidden sm:block" ref={waitingRef}>
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
                    <Link
                      key={w.id}
                      href={routes.appointment(w.id, new Date(w.startAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }))}
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
                    </Link>
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
        <div className="relative" ref={alertRef}>
          <Tooltip label="Bildirimler" side="bottom">
            <button
              onClick={() => setShowAlerts(v => !v)}
              aria-label="Bildirimler"
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
                <p className="text-sm font-bold text-slate-800">Bildirimler</p>
              </div>
              <div className="divide-y divide-slate-50 py-1">
                {/* Taksit bildirimi — sadece yetkili roller */}
                {canSeeTaksit && (alerts.taksit > 0 ? (
                  <Link href="/muhasebe?tab=alacak" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.taksit} Gecikmiş Taksit</p>
                      <p className="text-xs text-slate-500">Taksit takibine git</p>
                    </div>
                  </Link>
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
                  <Link href="/stok" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
                      <PackageSearch className="h-4 w-4 text-amber-500" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.stok} Kritik Stok Kalemi</p>
                      <p className="text-xs text-slate-500">Stok yönetimine git</p>
                    </div>
                  </Link>
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
                  <Link href="/lab" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <FlaskConical className="h-4 w-4 text-primary" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.lab} Bekleyen Laboratuvar İşi</p>
                      <p className="text-xs text-slate-500">Laboratuvar sayfasına git</p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </span>
                    <p className="text-sm text-slate-600">Bekleyen lab siparişi yok</p>
                  </div>
                ))}
                {canSeeTasks && (alerts.tasks > 0 ? (
                  <Link href="/gorevler" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50">
                      <ClipboardList className="h-4 w-4 text-rose-500" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.tasks} Görev Aksiyon Bekliyor</p>
                      <p className="text-xs text-slate-500">Atanan görevleri aç</p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </span>
                    <p className="text-sm text-slate-600">Aksiyon bekleyen görev yok</p>
                  </div>
                ))}
                {/* Hiçbir bildirim grubu yoksa */}
                {!canSeeTaksit && !canSeeStok && !canSeeLab && !canSeeTasks && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-slate-400">Bekleyen iş yok</p>
                  </div>
                )}
              </div>
              {totalAlerts === 0 && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Bekleyen iş yok</p>
                </div>
              )}
            </div>,
            document.body
          )}
        </div>

        {/* Hesap: ad, rol, profil, destek ve çıkış tek yerde */}
        <div className="border-l border-slate-100 pl-1.5 sm:pl-2">
          <UserMenu
            name={displayName}
            roleLabel={displayRole}
            photoUrl={user.photoUrl}
            showSupport={can("support:read")}
            onLogout={handleLogout}
            loggingOut={loggingOut}
          />
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
