"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type KeyboardEvent } from "react";
import {
  Bell,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  ClipboardPlus,
  FlaskConical,
  Inbox,
  Menu,
  MessagesSquare,
  PackageSearch,
  PhoneCall,
  Plus,
  Receipt,
  UserCheck,
  UserPlus,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { CountBadge, type CountBadgeTone } from "@/components/ui/CountBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Spinner } from "@/components/ui/Spinner";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { BranchSwitcher, type BranchSwitcherData } from "@/components/layout/BranchSwitcher";
import { UserMenu } from "@/components/layout/header-menus";
import { ShellPopover } from "@/components/layout/shell-popover";
import {
  refreshPanelSummary,
  usePanelSummary,
  usePanelSummarySync,
  type PanelSummaryCounts,
  type WaitingPatient,
} from "@/components/layout/use-panel-alerts";
import { useOutsideClick } from "@/lib/use-outside-click";
import { scopedStorageKey } from "@/lib/scoped-client-storage";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { clientMutation } from "@/lib/client-mutation";
import { routes } from "@/lib/routes";
import { pageTitleFor } from "@/lib/page-titles";
import { formatPhoneNumber } from "@/lib/format";
import { maskedIdentityLabel } from "@/lib/patient-display";

// Hasta formu yalnız "Yeni > Hasta" seçilince yüklenir; her sayfanın ilk
// yüklemesine ~9 KB gzip eklemesin (perf G18).
const PatientFormModal = dynamic(
  () => import("@/components/patient/PatientFormModal").then((mod) => mod.PatientFormModal),
  { ssr: false },
);

type TopbarUser = { id?: string; fullName: string; role: string; photoUrl?: string | null; ghost?: boolean };
type Props = { user: TopbarUser; branchContext?: BranchSwitcherData | null };

type SearchResult = { id: string; fullName: string; tcNo?: string | null; isForeigner?: boolean | null; phone?: string | null };

type PendingRow = {
  key: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: CountBadgeTone;
  count: number;
  title: string;
  detail?: string;
};

const ICON_TONE: Record<CountBadgeTone, string> = {
  critical: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-primary/10 text-primary",
  neutral: "bg-slate-100 text-slate-500",
  success: "bg-emerald-50 text-emerald-600",
};

// Üst bar artık sayfa adını yazmaz (sayfanın kendi başlığı var) ve sayfaya
// göre değişen hızlı düğmeler göstermez: her ekranda aynı yerde aynı arama,
// aynı "Yeni" menüsü, aynı Bekleyen işler ve hesap menüsü durur.
const SEARCH_PLACEHOLDER = "Hasta ara: ad, TC veya telefon…";
/** Telefon ve TC göremeyen rol (patients:phone yok) bunlarla arayamaz; yer tutucu yalnız adı söyler. */
const SEARCH_PLACEHOLDER_NAME_ONLY = "Hasta ara: ad…";

/**
 * Hasta dosyasının yazdığı bağlam (hasta paketi: sessionStorage["ks:hasta-baglam"]
 * = { id, fullName }). "Yeni" menüsündeki Tahsilat, Hasta araması ve Görev o
 * hasta seçili açılsın diye ad buradan okunur; kimlik eşleşmezse ad kullanılmaz.
 */
const PATIENT_CONTEXT_KEY = "ks:hasta-baglam";

function readContextPatientName(patientId: string | undefined): string | undefined {
  if (!patientId) return undefined;
  try {
    const raw = sessionStorage.getItem(PATIENT_CONTEXT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as { id?: unknown; fullName?: unknown };
    if (record.id !== patientId || typeof record.fullName !== "string") return undefined;
    return record.fullName.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** "Dr." zaten adın içindeyse ikinci kez eklenmez ("Dr. Dr. Mert Aydın" olmasın). */
function doctorLabel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /^(dr|dt|doç|doc|prof|uzm|op)\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

function pendingRows(counts: PanelSummaryCounts): PendingRow[] {
  const rows: PendingRow[] = [];
  if (counts.onlineRequests) {
    rows.push({ key: "talepler", href: routes.bookingRequests(), icon: Inbox, tone: "warning", count: counts.onlineRequests, title: `${counts.onlineRequests} online randevu talebi`, detail: "Randevu verilmeyi bekliyor" });
  }
  if (counts.tasksDue) {
    rows.push({ key: "gorevler", href: routes.todos("gorev", { durum: "zamani-gelen" }), icon: ClipboardList, tone: "warning", count: counts.tasksDue, title: `${counts.tasksDue} görevin zamanı geldi`, detail: "Size atanan ekip görevleri" });
  }
  if (counts.lab?.atLab) {
    const late = counts.lab.late;
    rows.push({ key: "lab", href: routes.labList("laboratuvarda"), icon: FlaskConical, tone: late > 0 ? "critical" : "info", count: counts.lab.atLab, title: `${counts.lab.atLab} iş laboratuvarda`, detail: late > 0 ? `${late} iş zamanında dönmedi` : "Dönünce teslim alın" });
  }
  if (counts.stockCritical) {
    rows.push({ key: "stok", href: routes.stockList("kritik"), icon: PackageSearch, tone: "critical", count: counts.stockCritical, title: `${counts.stockCritical} malzeme kritik seviyede`, detail: "Sipariş verilmemiş" });
  }
  if (counts.installmentsOverdue) {
    rows.push({ key: "taksit", href: routes.overdueInstallments(), icon: AlertCircle, tone: "critical", count: counts.installmentsOverdue, title: `${counts.installmentsOverdue} taksidin vadesi geçti`, detail: "Muhasebe > Alacaklar" });
  }
  if (counts.unreadMessages) {
    rows.push({ key: "mesaj", href: routes.teamMessages(), icon: MessagesSquare, tone: "info", count: counts.unreadMessages, title: `${counts.unreadMessages} yeni ekip mesajı`, detail: "Ana sayfada" });
  }
  return rows;
}

function WaitingList({ items, myPatientsFor, onNavigate }: { items: WaitingPatient[]; myPatientsFor: string | null; onNavigate: () => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const mine = Boolean(myPatientsFor && item.doctorId === myPatientsFor);
        return (
          <li key={item.id}>
            <Link
              href={routes.appointment(item.id, item.date || undefined)}
              onClick={onNavigate}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
            >
              <Avatar name={item.patientName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{item.patientName}</span>
                <span className="block truncate text-xs text-slate-500">
                  {item.time}{item.doctorName ? ` · ${doctorLabel(item.doctorName)}` : ""}{mine ? " · sizin hastanız" : ""}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Topbar({ user, branchContext }: Props) {
  const { can, scopeKey, role } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  usePanelSummarySync(scopeKey);
  const summary = usePanelSummary();
  const counts = summary.data?.counts ?? null;

  const [loggingOut, setLoggingOut] = useState(false);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const pendingRef = useRef<HTMLButtonElement>(null);
  const waitingRef = useRef<HTMLButtonElement>(null);

  // ── Hasta arama ───────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const hidePhone = !can("patients:phone");
  // Dışarı tıklanınca liste kapanır ama yazılan arama silinmez (önceden siliniyordu).
  useOutsideClick(searchRef, () => setShowResults(false), showResults);

  useEffect(() => {
    const normalized = q.trim();
    if (normalized.length < 2) {
      setResults([]);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients?q=${encodeURIComponent(normalized)}&take=8&summary=false`, { signal: controller.signal });
        if (!response.ok) throw new Error("PATIENT_SEARCH_FAILED");
        const json = await response.json();
        const patients = Array.isArray(json) ? json : (json?.patients ?? []);
        setResults(Array.isArray(patients) ? patients.slice(0, 8) : []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
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

  const resetSearch = () => {
    setShowResults(false);
    setQ("");
    setResults([]);
    setActiveIndex(-1);
  };

  const openPatient = (patientId: string) => {
    router.push(routes.patient(patientId));
    resetSearch();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setShowResults(false);
      setActiveIndex(-1);
      return;
    }
    if (!showResults || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      openPatient(results[activeIndex].id);
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (q.trim()) {
      router.push(routes.patients(q.trim()));
      setShowResults(false);
    }
  };

  // ── "Yeni" menüsü ─────────────────────────────────────────────────────────
  // Yalnız kullanıcının gerçekten kaydedebileceği işler görünür. Hasta
  // dosyasındayken randevu ve lab işi o hasta seçili açılır (sözleşme §5);
  // Tahsilat, Hasta araması ve Görev de hastanın adı biliniyorsa (bkz.
  // PATIENT_CONTEXT_KEY) o hasta seçili açılır. Ad, menü açılmadan hemen önce
  // okunur: hasta dosyası bağlamı kendi verisi yüklenince yazar.
  const contextPatientId = pathname === "/hasta-detay" ? searchParams.get("id") || undefined : undefined;
  const [contextPatient, setContextPatient] = useState<{ id: string; name: string } | null>(null);
  const refreshContextPatient = () => {
    const name = readContextPatientName(contextPatientId);
    const next = contextPatientId && name ? { id: contextPatientId, name } : null;
    setContextPatient((current) => (current?.id === next?.id && current?.name === next?.name ? current : next));
  };
  const contextPatientName = contextPatient && contextPatient.id === contextPatientId ? contextPatient.name : undefined;
  // Adı bilinmeyen hasta bu üç forma taşınmaz: formlar hastayı adıyla gösterir.
  const namedPatientContext = contextPatientId && contextPatientName ? { patientId: contextPatientId, patientName: contextPatientName } : {};
  const createItems: ActionMenuItem[] = [];
  if (can("appointments:write")) createItems.push({ key: "randevu", label: "Randevu", description: "Takvimde boş saate randevu ver", icon: CalendarPlus, href: routes.newAppointment({ patientId: contextPatientId, patientName: contextPatientName }) });
  if (can("patients:write")) createItems.push({ key: "hasta", label: "Hasta", description: "Yeni hasta dosyası aç", icon: UserPlus, onSelect: () => setShowPatientForm(true) });
  if (can("payments:write") && can("finance:center")) createItems.push({ key: "tahsilat", label: "Tahsilat", description: "Hastadan ödeme al", icon: Wallet, href: routes.newCollection(namedPatientContext) });
  if (can("hastatracking:write")) createItems.push({ key: "arama", label: "Hasta araması", description: "Geri aranacak hastayı kaydet", icon: PhoneCall, href: routes.newFollowUp(namedPatientContext) });
  if (can("clinictasks:write")) createItems.push({ key: "gorev", label: "Görev", description: "Ekipten birine iş ata", icon: ClipboardPlus, href: routes.newTask(namedPatientContext) });
  if (can("lab:write")) createItems.push({ key: "lab", label: "Lab işi", description: "Laboratuvara iş gönder", icon: FlaskConical, href: routes.newLabOrder(contextPatientId) });
  // Muhasebecinin asıl işi; önceden menüde yalnız "Tahsilat" vardı.
  if (can("finance:write") && can("finance:center")) createItems.push({ key: "gider", label: "Gider", description: "Gider veya ödeme kaydet", icon: Receipt, href: routes.newExpense() });

  // ── Bekleme salonu ────────────────────────────────────────────────────────
  // Bekleme salonu klinik akışıdır (sunucu yalnız hasta kaydını açabilen role
  // döndürür). Doktorun rozeti ve "Hasta geldi" bildirimi yalnız kendi hastası
  // içindir; liste salondaki herkesi gösterir, kendi hastaları önce gelir.
  const waitingItems = useMemo(() => counts?.waiting?.items ?? [], [counts]);
  const canSeeWaiting = can("appointments:read") && can("patients:read");
  const myPatientsFor = role === "DOKTOR" && user.id ? user.id : null;
  const sortedWaiting = useMemo(() => {
    if (!myPatientsFor) return waitingItems;
    return [...waitingItems.filter((item) => item.doctorId === myPatientsFor), ...waitingItems.filter((item) => item.doctorId !== myPatientsFor)];
  }, [myPatientsFor, waitingItems]);
  const waitingForMe = myPatientsFor ? waitingItems.filter((item) => item.doctorId === myPatientsFor).length : waitingItems.length;

  // "Hasta geldi" bildirimi yalnız GERÇEKTEN yeni gelen hasta için çıkar:
  // duyurulanlar sekmede gün bazında saklanır; sekmenin ilk açılışında ilk
  // 20 sn içinde gelen liste "zaten bekleyenler" sayılır (F5, şube değişimi).
  const mountedAtRef = useRef(0);
  const seenWaitingRef = useRef<Set<string> | null>(null);
  const storedBaselineRef = useRef(false);
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);
  useEffect(() => {
    if (!counts?.waiting) return;
    const items = counts.waiting.items;
    const dayKey = items[0]?.date || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    const storageKey = scopedStorageKey(`waiting-announced-${dayKey}`, scopeKey);
    if (seenWaitingRef.current === null) {
      let stored: string[] | null = null;
      try {
        const raw = sessionStorage.getItem(storageKey);
        stored = raw ? (JSON.parse(raw) as string[]) : null;
      } catch {
        stored = null;
      }
      storedBaselineRef.current = Array.isArray(stored);
      seenWaitingRef.current = new Set(Array.isArray(stored) ? stored : []);
    }
    const seen = seenWaitingRef.current;
    const arrived = items.filter((item) => !seen.has(item.id));
    if (arrived.length === 0) return;
    const buildingBaseline = !storedBaselineRef.current && Date.now() - mountedAtRef.current < 20_000;
    if (!buildingBaseline) {
      arrived
        .filter((item) => !myPatientsFor || item.doctorId === myPatientsFor)
        .forEach((item) => {
          showToastSafe({
            type: "info",
            title: "Hasta geldi",
            message: `${item.patientName} geldi${item.doctorName ? ` · ${doctorLabel(item.doctorName)}` : ""}`,
            duration: 6000,
          });
        });
    }
    arrived.forEach((item) => seen.add(item.id));
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...seen]));
    } catch {
      // Depolama kapalıysa yalnız bellekteki küme kullanılır.
    }
  }, [counts, myPatientsFor, scopeKey]);

  // ── Bekleyen işler (zil) ──────────────────────────────────────────────────
  const rows = useMemo(() => (counts ? pendingRows(counts) : []), [counts]);
  const rowsTotal = rows.reduce((sum, row) => sum + row.count, 0);
  const hasCritical = rows.some((row) => row.tone === "critical");
  const unreadMessages = counts?.unreadMessages ?? 0;
  const showWaitingInBell = canSeeWaiting && sortedWaiting.length > 0;

  // Tarayıcı sekmesinde sayfa adı + okunmamış mesaj (ör. "(2) Randevular · CepKlinik").
  const baseTitleRef = useRef("");
  useEffect(() => {
    if (!baseTitleRef.current) baseTitleRef.current = document.title || "CepKlinik";
    const base = baseTitleRef.current;
    const page = pageTitleFor(pathname);
    const title = page ? `${page} · ${base}` : base;
    document.title = unreadMessages > 0 ? `(${unreadMessages}) ${title}` : title;
  }, [pathname, unreadMessages]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await clientMutation("/api/auth/logout", { method: "POST" }, "Oturum kapatılamadı.");
      // Doğrudan klinik girişi (/giris → /klinik/giris ikinci yönlendirmesi olmadan).
      window.location.href = "/klinik/giris";
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Oturum kapatılamadı." });
      setLoggingOut(false);
    }
  };

  const displayName = user.fullName || "Kullanıcı";
  const displayRole = roleLabel(user.role) || user.role;
  const summaryUnknown = !summary.data;
  // Telefonda bekleme salonu da bu penceredir; ekran okuyucu rozetteki sayıyı duysun.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const pendingTotal = rowsTotal + (isPhone ? waitingForMe : 0);
  const pendingLabel = pendingTotal > 0 ? `Bekleyen işler, ${pendingTotal} iş` : "Bekleyen işler";

  return (
    <>
      <header className="relative z-[160] isolate flex h-14 w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[rgb(var(--app-surface))] px-3 sm:gap-3 sm:px-4 lg:px-5">
        {/* Sol: menü (telefon/tablet), şube, hasta arama */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="shrink-0 lg:hidden">
            <IconButton
              icon={Menu}
              title="Menüyü aç"
              tooltipSide="bottom"
              onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
              aria-haspopup="dialog"
              aria-controls="panel-mobil-menu"
            />
          </div>
          <BranchSwitcher data={branchContext} />
          {/* Hastalar sayfasının kendi araması var; orada ikinci kutu aynı işi tekrar ederdi. */}
          {can("patients:read") && pathname !== "/hasta" && (
            <div ref={searchRef} className="relative min-w-0 max-w-md flex-1">
              <form onSubmit={submitSearch} role="search">
                <SearchInput
                  value={q}
                  onChange={(value) => {
                    setQ(value);
                    setShowResults(true);
                    setActiveIndex(-1);
                  }}
                  onFocus={() => {
                    if (q.trim().length >= 2) setShowResults(true);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder={hidePhone ? SEARCH_PLACEHOLDER_NAME_ONLY : SEARCH_PLACEHOLDER}
                  aria-label={hidePhone ? "Hasta ara: ad" : "Hasta ara: ad, TC kimlik no veya telefon"}
                  role="combobox"
                  aria-controls="ust-bar-hasta-sonuclari"
                  aria-expanded={showResults && q.trim().length >= 2}
                  aria-autocomplete="list"
                  aria-activedescendant={activeIndex >= 0 ? `ust-bar-hasta-${activeIndex}` : undefined}
                />
              </form>
              {showResults && q.trim().length >= 2 && (
                <div id="ust-bar-hasta-sonuclari" role="listbox" aria-label="Hasta arama sonuçları" className="ui-popover absolute left-0 right-0 top-full z-[220] mt-2 max-h-[min(70vh,28rem)] overflow-y-auto py-1">
                  {results.length > 0 ? results.map((patient, index) => {
                    // TC tam yazılmaz: diğer hasta seçicilerindeki gibi son 4 hane ("TC •••• 4530").
                    const detail = [maskedIdentityLabel(patient), !hidePhone && patient.phone ? formatPhoneNumber(patient.phone) : ""].filter(Boolean).join(" · ");
                    return (
                      <button
                        key={patient.id}
                        id={`ust-bar-hasta-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => openPatient(patient.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${activeIndex === index ? "bg-primary/10" : "hover:bg-slate-50"}`}
                      >
                        <Avatar name={patient.fullName} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{patient.fullName}</span>
                          {detail && <span className="block truncate text-xs text-slate-500">{detail}</span>}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      </button>
                    );
                  }) : (
                    <div className="px-4 py-3 text-center text-sm text-slate-500">
                      {searchLoading ? (
                        <span role="status" className="inline-flex items-center gap-2"><Spinner className="h-3.5 w-3.5 text-primary" />Hastalar aranıyor…</span>
                      ) : searchError ? (
                        <span role="alert" className="text-red-600">Arama şu anda yapılamıyor. Biraz sonra yeniden deneyin.</span>
                      ) : (
                        <span>Bu aramayla eşleşen hasta yok.</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sağ: Yeni, bekleme salonu, bekleyen işler, hesap */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Telefonda yalnız "+" görünür (ad ekran okuyucuya "Yeni" olarak kalır);
              geniş düğme arama kutusunu ~100 px'e sıkıştırıyordu. Menü açılmadan
              önce (dokunma, odak, tuş) hasta dosyasının bağlamı yeniden okunur. */}
          {createItems.length > 0 && (
            <div className="flex shrink-0" onPointerDownCapture={refreshContextPatient} onFocusCapture={refreshContextPatient} onKeyDownCapture={refreshContextPatient}>
              <ActionMenu
                trigger="button"
                variant="secondary"
                size="md"
                icon={Plus}
                label="Yeni"
                items={createItems}
                iconOnlyOnMobile
              />
            </div>
          )}

          {canSeeWaiting && (
            <div className="hidden sm:block">
              <IconButton
                ref={waitingRef}
                icon={UserCheck}
                tone="ghost"
                tooltipSide="bottom"
                title={waitingForMe > 0 ? `Bekleme salonu, ${waitingForMe} hasta` : "Bekleme salonu"}
                onClick={() => setShowWaiting((value) => !value)}
                aria-haspopup="dialog"
                aria-expanded={showWaiting}
              >
                <CountBadge count={waitingForMe} tone="warning" placement="corner" max={9} />
              </IconButton>
              <ShellPopover open={showWaiting} onClose={() => setShowWaiting(false)} anchorRef={waitingRef} title="Bekleme salonu" width={320}>
                {sortedWaiting.length > 0 ? (
                  <WaitingList items={sortedWaiting} myPatientsFor={myPatientsFor} onNavigate={() => setShowWaiting(false)} />
                ) : summaryUnknown ? (
                  <div role="status" className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
                    <Spinner className="h-4 w-4 text-primary" />
                    Yükleniyor…
                  </div>
                ) : (
                  <EmptyState compact title="Bekleme salonunda hasta yok" />
                )}
              </ShellPopover>
            </div>
          )}

          <div>
            <IconButton
              ref={pendingRef}
              icon={Bell}
              tone="ghost"
              tooltipSide="bottom"
              title={pendingLabel}
              onClick={() => setShowPending((value) => !value)}
              aria-haspopup="dialog"
              aria-expanded={showPending}
            >
              {/* Telefonda bekleme salonu da bu pencerededir; sayısı rozete eklenir. */}
              <CountBadge count={rowsTotal + waitingForMe} tone={hasCritical ? "critical" : "warning"} placement="corner" max={9} className="sm:hidden" />
              <CountBadge count={rowsTotal} tone={hasCritical ? "critical" : "warning"} placement="corner" max={9} className="hidden sm:inline-flex" />
            </IconButton>
            <ShellPopover open={showPending} onClose={() => setShowPending(false)} anchorRef={pendingRef} title="Bekleyen işler" width={340}>
              {showWaitingInBell && (
                <div className="border-b border-slate-100 sm:hidden">
                  <p className="px-4 pb-1 pt-3 text-xs font-semibold text-slate-500">Bekleme salonu</p>
                  <WaitingList items={sortedWaiting} myPatientsFor={myPatientsFor} onNavigate={() => setShowPending(false)} />
                </div>
              )}
              {rows.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const Icon = row.icon;
                    return (
                      <li key={row.key}>
                        <Link
                          href={row.href}
                          onClick={() => setShowPending(false)}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_TONE[row.tone]}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-800">{row.title}</span>
                            {row.detail && <span className="block truncate text-xs text-slate-500">{row.detail}</span>}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rows.length === 0 && (summaryUnknown ? (
                summary.failures > 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                    <p className="text-sm text-slate-600">Bekleyen işler şu an alınamadı.</p>
                    <Button size="sm" variant="secondary" onClick={refreshPanelSummary}>Yeniden dene</Button>
                  </div>
                ) : (
                  <div role="status" className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
                    <Spinner className="h-4 w-4 text-primary" />
                    Yükleniyor…
                  </div>
                )
              ) : (
                <div className={showWaitingInBell ? "hidden sm:block" : ""}>
                  <EmptyState compact title="Bekleyen iş yok" />
                </div>
              ))}
            </ShellPopover>
          </div>

          <div className="border-l border-slate-100 pl-1.5 sm:pl-2">
            <UserMenu
              name={displayName}
              roleLabel={displayRole}
              photoUrl={user.photoUrl}
              showSupport={can("support:read") && !user.ghost}
              showProfile={!user.ghost}
              onLogout={handleLogout}
              loggingOut={loggingOut}
            />
          </div>
        </div>
      </header>
      {showPatientForm && (
        <PatientFormModal
          open
          onClose={() => setShowPatientForm(false)}
          onSaved={(patient) => {
            setShowPatientForm(false);
            router.push(routes.patient(patient.id));
          }}
          // "Kaydet ve randevu ver": yeni hasta seçili randevu formu (Hastalar sayfasıyla aynı).
          onBookAppointment={can("appointments:write")
            ? (patient) => router.push(routes.newAppointment({ patientId: patient.id, patientName: patient.fullName }))
            : undefined}
        />
      )}
    </>
  );
}
