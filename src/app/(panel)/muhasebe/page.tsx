"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { usePanelSummary } from "@/components/layout/use-panel-alerts";
import { turkeyDateKey } from "@/lib/tz";
import type { DatePresetKey } from "@/lib/date-presets";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { LedgerTab, isLedgerType, type LedgerType } from "@/components/muhasebe/LedgerTab";
import type { EntryKind, EntryRequest } from "@/components/muhasebe/EntryModal";
import type { EditTarget } from "@/components/muhasebe/EditEntryModal";
import { isInstallmentStatusFilter, type InstallmentStats } from "@/components/muhasebe/installment-types";
import { useRealtimeRefresh } from "@/components/muhasebe/finance-hooks";

// Görünmeyen sekmeler ve açılmamış pencereler ilk açılışta indirilmez.
const tabSkeleton = () => <PageSkeleton header={false} toolbar="bare" stats={2} body="table" rows={6} />;
const BalancesTab = dynamic(() => import("@/components/muhasebe/BalancesTab").then((mod) => mod.BalancesTab), { loading: tabSkeleton });
const InstallmentsTab = dynamic(() => import("@/components/muhasebe/InstallmentsTab").then((mod) => mod.InstallmentsTab), { loading: tabSkeleton });
const HakedisTab = dynamic(() => import("@/components/muhasebe/HakedisTab").then((mod) => mod.HakedisTab), { loading: tabSkeleton });
const EntryModal = dynamic(() => import("@/components/muhasebe/EntryModal").then((mod) => mod.EntryModal));
const EditEntryModal = dynamic(() => import("@/components/muhasebe/EditEntryModal").then((mod) => mod.EditEntryModal));
const NewPlanModal = dynamic(() => import("@/components/muhasebe/NewPlanModal").then((mod) => mod.NewPlanModal));

type TabId = "defter" | "alacaklar" | "hakedis";
type AlacakView = "hastalar" | "taksitler";
const TAB_IDS: readonly TabId[] = ["defter", "alacaklar", "hakedis"];
const ALACAK_VIEWS: readonly AlacakView[] = ["hastalar", "taksitler"];
const ENTRY_KINDS: readonly EntryKind[] = ["gelir", "gider", "firma", "hakedis"];

/** Eski sekme adresleri (yer imleri, Raporlar/Anasayfa/üst bar bağlantıları) yeni yapıda aynı yeri açar. */
const LEGACY_TABS: Record<string, { tab: TabId; gorunum?: AlacakView; tur?: LedgerType }> = {
  alacak: { tab: "alacaklar", gorunum: "hastalar" },
  taksit: { tab: "alacaklar", gorunum: "taksitler" },
  genel: { tab: "defter" },
  cari: { tab: "defter" },
  gelir: { tab: "defter", tur: "TAHSILAT" },
  gider: { tab: "defter", tur: "GIDER" },
};

/** Adresi sunucuya gitmeden günceller (Next, useSearchParams'ı yerel geçmişle eşitler). */
function replaceQuery(pathname: string, updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
}

/**
 * Muhasebe: üç bölüm.
 * - Gelir ve gider: dönemin tahsilat ve giderleri (gideri göremeyen için "Tahsilatlar").
 * - Alacaklar: Hastalar (kimden ne alacağız) ve Taksitler (vadesi gelen/geciken).
 * - Hakediş: hangi doktora hangi ay ne ödenecek.
 * Başlıktaki eylemler sabittir: "Tahsilat al" (birincil) ve "Gider / ödeme".
 *
 * Adres sözleşmesi: ?tab=defter|alacaklar|hakedis, ?gorunum=hastalar|taksitler,
 * ?donem=…(&from=&to=), ?tur=TAHSILAT|GIDER, ?durum=…&q=… (taksitler), ?doctorId=… (hakediş);
 * ?islem=gelir|gider|firma|hakedis (patientId/patientName ile hasta seçili) ve ?yeni=1 ilgili
 * formu açar. Eski tab=alacak|taksit|genel|gelir|gider|cari adresleri çalışmaya devam eder.
 */
export default function MuhasebePage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, scopeKey } = usePermissions();
  const canReadPayments = can("payments:read");
  const canWritePayments = can("payments:write");
  const canRefundPayments = can("payments:refund");
  const canReadFinance = can("finance:read");
  const canWriteFinance = can("finance:write");
  const canExportFinance = can("finance:export");
  const canReadInstallments = can("installments:read");
  const canWriteInstallments = can("installments:write");
  const canDeleteInstallments = can("installments:delete");
  const canReadPatients = can("patients:read");
  const canSeePatientPhone = can("patients:phone");
  // Tahsilat hatırlatmaları taksit iznine bağlı (sunucu /api/reminder da öyle):
  // takvimi olmayan muhasebe görür, finans yetkisi olmayan rol görmez.
  const canReadReminders = can("installments:read");
  const canWriteReminders = can("installments:write");
  const canReadEarnings = can("earnings:read");

  // Her bölüm kendi izniyle görünür (ör. banko: Tahsilatlar ve Taksitler).
  const tabs = useMemo(() => TAB_IDS.filter((tab) => {
    if (tab === "defter") return canReadPayments || canReadFinance;
    if (tab === "alacaklar") return canReadFinance || canReadInstallments;
    return canReadFinance;
  }), [canReadFinance, canReadInstallments, canReadPayments]);
  const views = useMemo(() => ALACAK_VIEWS.filter((view) => (view === "hastalar" ? canReadFinance : canReadInstallments)), [canReadFinance, canReadInstallments]);

  // ── Adresten durum (eski sekme adları burada çevrilir; yanlış sekme bir an bile yüklenmez).
  const rawTab = searchParams.get("tab");
  const legacy = rawTab ? LEGACY_TABS[rawTab] : undefined;
  const islem = searchParams.get("islem");
  const requestedTab = legacy?.tab ?? (islem === "hakedis" ? "hakedis" : islem ? "defter" : rawTab);
  const activeTab: TabId | null = tabs.includes(requestedTab as TabId) ? (requestedTab as TabId) : tabs[0] ?? null;
  const requestedView = legacy?.gorunum ?? searchParams.get("gorunum");
  const activeView: AlacakView | null = views.includes(requestedView as AlacakView) ? (requestedView as AlacakView) : views[0] ?? null;
  const rawTur = legacy?.tur ?? searchParams.get("tur");
  const ledgerTur: LedgerType = isLedgerType(rawTur) ? rawTur : "HEPSI";
  const durumParam = searchParams.get("durum");
  const installmentStatus = isInstallmentStatusFilter(durumParam) ? durumParam : "ACIK";
  const installmentSearch = searchParams.get("q") || "";
  const selectedDoctorId = searchParams.get("doctorId") || "";
  // Giderleri göremeyen (banko) günlük kasaya bakar: varsayılan dönem "Bugün".
  const defaultPeriod: DatePresetKey = canReadFinance ? "ay" : "bugun";

  const setQuery = useCallback((updates: Record<string, string | null>) => replaceQuery(pathname, updates), [pathname]);

  useEffect(() => {
    if (!legacy) return;
    setQuery({ tab: legacy.tab, gorunum: legacy.gorunum ?? null, ...(legacy.tur ? { tur: legacy.tur } : {}) });
  }, [legacy, setQuery]);

  // ── Ziyaret edilen sekmeler bağlı kalır: geri dönüşte veri ve süzgeçler yerinde, istek tekrarlanmaz.
  const activeKeys = useMemo(
    () => [activeTab, activeTab === "alacaklar" && activeView ? `alacaklar:${activeView}` : null].filter((key): key is string => Boolean(key)),
    [activeTab, activeView],
  );
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(activeKeys));
  useEffect(() => {
    setVisited((previous) => {
      if (activeKeys.every((key) => previous.has(key))) return previous;
      const next = new Set(previous);
      activeKeys.forEach((key) => next.add(key));
      return next;
    });
  }, [activeKeys]);
  const isMounted = (key: string) => visited.has(key) || activeKeys.includes(key);

  // ── Ortak yenileme sinyali: kayıt sonrası ve başka personelin kaydında (gizli sekmede beklenir).
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);
  const markRefreshed = useRealtimeRefresh(bump);
  const handleSaved = useCallback(() => {
    markRefreshed();
    bump();
  }, [bump, markRefreshed]);

  // Vadesi geçen taksitleri "gecikti" olarak işaretleme: ekranlar gecikmeyi zaten canlı hesaplar;
  // her açılışta yazma isteği (ve klinik çapında yenileme dalgası) yerine cihaz başına günde bir kez.
  useEffect(() => {
    if (!canWriteInstallments) return;
    const day = turkeyDateKey();
    const storageKey = `ks:taksit-gecikti:${scopeKey}`;
    try {
      if (window.localStorage.getItem(storageKey) === day) return;
    } catch {
      // Tarayıcı depolaması kapalıysa her açılışta çağrılır (eski davranış).
    }
    void fetch("/api/taksit-plani/mark-gecikti", { method: "POST" })
      .then((response) => {
        // Gövde okunmazsa tarayıcı isteği açık tutuyor (sayfa "ağ sakin" sayılmıyordu).
        void response.body?.cancel().catch(() => undefined);
        if (!response.ok) return;
        try {
          window.localStorage.setItem(storageKey, day);
        } catch {
          // Depolama yoksa yok sayılır.
        }
      })
      .catch(() => undefined);
  }, [canWriteInstallments, scopeKey]);

  // ── Alacaklar sekmesindeki kırmızı sayaç: geciken taksit ADEDİ. Kabuk (sol menüdeki Muhasebe
  // rozeti) bu sayıyı panel özetinde zaten alıyor; sayfa ayrıca ağır taksit istatistiği istemez.
  // Taksitler görünümü yüklendiyse onun özeti daha tazedir: hangisi sonra geldiyse o gösterilir.
  const taksitlerActive = activeTab === "alacaklar" && activeView === "taksitler";
  const { data: shellSummary, loadedAt: shellLoadedAt } = usePanelSummary();
  const shellOverdue = shellSummary?.counts.installmentsOverdue;
  const [tabOverdue, setTabOverdue] = useState<{ count: number; at: number } | null>(null);
  const overdueCount = tabOverdue && (!shellLoadedAt || tabOverdue.at >= shellLoadedAt)
    ? tabOverdue.count
    : shellOverdue ?? tabOverdue?.count;
  const onInstallmentStats = useCallback((stats: InstallmentStats) => {
    setTabOverdue({ count: Number(stats.gecikenTaksit) || 0, at: Date.now() });
  }, []);

  // ── Pencereler (yalnız açıkken bağlanır).
  const [entryRequest, setEntryRequest] = useState<EntryRequest | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [planRequest, setPlanRequest] = useState<{ patient: PickedPatient | null } | null>(null);
  const openEntry = useCallback((kind: EntryKind, extra: Omit<EntryRequest, "kind"> = {}) => {
    setEntryRequest({ kind, ...extra });
  }, []);

  // En sık açılan pencere (tahsilat/gider) boşta önceden indirilir; ilk tıklamada beklenmez.
  useEffect(() => {
    if (!canWritePayments && !canWriteFinance) return;
    const timer = window.setTimeout(() => { void import("@/components/muhasebe/EntryModal"); }, 2000);
    return () => window.clearTimeout(timer);
  }, [canWriteFinance, canWritePayments]);

  // ?islem=… (üst bar "Yeni > Tahsilat", /gider, eski bağlantılar) ve ?yeni=1 — izin varsa formu açar.
  useEffect(() => {
    const action = searchParams.get("islem");
    const isNew = searchParams.get("yeni") === "1";
    if (!action && !isNew) return;
    const patientId = searchParams.get("patientId");
    const patientName = searchParams.get("patientName");
    const patient: PickedPatient | null = patientId ? { id: patientId, fullName: patientName || "Seçili hasta" } : null;
    const kind = action === "cari" ? "firma" : (ENTRY_KINDS as readonly string[]).includes(action || "") ? (action as EntryKind) : null;
    const allowed = (entry: EntryKind) => (entry === "gelir" ? canWritePayments : entry === "firma" ? canWriteFinance && canReadFinance : canWriteFinance);
    const tabParam = legacy?.tab ?? searchParams.get("tab");
    const viewParam = legacy?.gorunum ?? searchParams.get("gorunum");
    if (kind) {
      if (allowed(kind)) setEntryRequest({ kind, patient });
    } else if (tabParam === "alacaklar" && viewParam === "taksitler") {
      if (canWriteInstallments) setPlanRequest({ patient });
    } else if (tabParam === "hakedis") {
      if (canWriteFinance) setEntryRequest({ kind: "hakedis" });
    } else if (canWritePayments) {
      setEntryRequest({ kind: "gelir", patient });
    } else if (canWriteFinance) {
      setEntryRequest({ kind: "gider" });
    }
    setQuery({ islem: null, yeni: null, patientId: null, patientName: null, ...(kind ? { tab: kind === "hakedis" ? "hakedis" : "defter" } : {}) });
  }, [canReadFinance, canWriteFinance, canWriteInstallments, canWritePayments, legacy, searchParams, setQuery]);

  // Hastalar'daki "₺… taksitte" bağlantısı: adres aynı kalsa da (aynı hastaya ikinci tıklama,
  // arada süzgeç elle değiştirilmiş) Taksitler görünümü o hastanın planlarını yeniden süzer.
  const [plansFocusKey, setPlansFocusKey] = useState(0);
  const openPlans = useCallback((patientName: string) => {
    setQuery({ gorunum: "taksitler", durum: "HEPSI", q: patientName });
    setPlansFocusKey((value) => value + 1);
  }, [setQuery]);

  const plansHref = useCallback(
    (patientName: string) => `/muhasebe?tab=alacaklar&gorunum=taksitler&durum=HEPSI&q=${encodeURIComponent(patientName)}`,
    [],
  );

  if (tabs.length === 0 || !activeTab) {
    return (
      <div className="space-y-3">
        <PageHeader icon="finance" title="Muhasebe" />
        <EmptyState title="Muhasebe bölümlerini görme yetkiniz yok" description="Klinik yöneticinizden tahsilat, gider veya taksit yetkisi isteyin." />
      </div>
    );
  }

  // Başlık eylemleri SABİT: sekme değişince yer/ad değiştirmez. Tek birincil eylem.
  const headerActions = canWritePayments || canWriteFinance ? (
    <div className="flex flex-wrap gap-2">
      {canWriteFinance && (
        <Button variant={canWritePayments ? "secondary" : "primary"} icon={Receipt} onClick={() => openEntry("gider")}>Gider / ödeme</Button>
      )}
      {canWritePayments && <Button icon={Plus} onClick={() => openEntry("gelir")}>Tahsilat al</Button>}
    </div>
  ) : undefined;

  const tabLabel = (tab: TabId) => {
    if (tab === "defter") return canReadFinance ? "Gelir ve gider" : "Tahsilatlar";
    if (tab === "alacaklar") return views.length === 1 && views[0] === "taksitler" ? "Taksitler" : "Alacaklar";
    return "Hakediş";
  };

  return (
    <div className="space-y-3">
      <PageHeader icon="finance" title="Muhasebe" actions={headerActions} />

      <Tabs
        ariaLabel="Muhasebe bölümleri"
        panelIdPrefix="muhasebe-bolum"
        items={tabs.map((tab) => ({
          key: tab,
          label: tabLabel(tab),
          ...(tab === "alacaklar" && canReadInstallments ? { count: overdueCount, countTone: "critical" as const, countLabel: "geciken taksit" } : {}),
        }))}
        value={activeTab}
        onChange={(tab) => setQuery({ tab })}
      />

      {isMounted("defter") && (
        <div id="muhasebe-bolum-defter" role="tabpanel" hidden={activeTab !== "defter"}>
          <LedgerTab
            active={activeTab === "defter"}
            refreshKey={refreshKey}
            defaultPeriod={defaultPeriod}
            tur={ledgerTur}
            onTurChange={(tur) => setQuery({ tur: tur === "HEPSI" ? null : tur })}
            showPayments={canReadPayments}
            showExpenses={canReadFinance}
            canWritePayments={canWritePayments}
            canRefundPayments={canRefundPayments}
            canWriteFinance={canWriteFinance}
            canExport={canExportFinance}
            onEdit={setEditTarget}
            onChanged={handleSaved}
          />
        </div>
      )}

      {isMounted("alacaklar") && (
        <div id="muhasebe-bolum-alacaklar" role="tabpanel" hidden={activeTab !== "alacaklar"} className="space-y-3">
          {views.length > 1 && activeView && (
            <Tabs
              ariaLabel="Alacaklar görünümü"
              size="sm"
              items={views.map((view) => ({ key: view, label: view === "hastalar" ? "Hastalar" : "Taksitler" }))}
              value={activeView}
              onChange={(view) => setQuery({ gorunum: view })}
            />
          )}
          {isMounted("alacaklar:hastalar") && (
            <div hidden={activeView !== "hastalar"}>
              <BalancesTab
                active={activeTab === "alacaklar" && activeView === "hastalar"}
                refreshKey={refreshKey}
                canWritePayments={canWritePayments}
                canReadPatients={canReadPatients}
                canSeePatientPhone={canSeePatientPhone}
                canReadInstallments={canReadInstallments}
                canExport={canExportFinance}
                onCollect={(patient, doctorId) => openEntry("gelir", { patient, doctorId })}
                onOpenPlans={openPlans}
                plansHref={plansHref}
                canWriteInstallments={canWriteInstallments}
                onCreatePlan={(patient) => setPlanRequest({ patient })}
              />
            </div>
          )}
          {isMounted("alacaklar:taksitler") && (
            <div hidden={activeView !== "taksitler"}>
              <InstallmentsTab
                active={taksitlerActive}
                refreshKey={refreshKey}
                initialStatus={installmentStatus}
                initialSearch={installmentSearch}
                filterKey={plansFocusKey}
                canWriteInstallments={canWriteInstallments}
                canCancelPlans={canDeleteInstallments}
                canReadPatients={canReadPatients}
                canSeePatientPhone={canSeePatientPhone}
                canReadReminders={canReadReminders}
                canWriteReminders={canWriteReminders}
                onChanged={handleSaved}
                onNewPlan={canWriteInstallments ? () => setPlanRequest({ patient: null }) : undefined}
                onStats={onInstallmentStats}
              />
            </div>
          )}
        </div>
      )}

      {isMounted("hakedis") && (
        <div id="muhasebe-bolum-hakedis" role="tabpanel" hidden={activeTab !== "hakedis"}>
          <HakedisTab
            active={activeTab === "hakedis"}
            refreshKey={refreshKey}
            selectedDoctorId={selectedDoctorId}
            onSelectDoctor={(doctorId) => setQuery({ doctorId: doctorId || null })}
            canPay={canWriteFinance}
            canOpenStatement={canReadEarnings}
            canExport={canExportFinance}
            onPay={(doctorId, year, month, kalan) => openEntry("hakedis", { payout: { doctorId, year, month, kalan } })}
          />
        </div>
      )}

      {entryRequest && (
        <EntryModal
          request={entryRequest}
          onClose={() => setEntryRequest(null)}
          onSaved={handleSaved}
          canWritePayments={canWritePayments}
          canWriteFinance={canWriteFinance}
          canReadFinance={canReadFinance}
        />
      )}
      {editTarget && <EditEntryModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />}
      {planRequest && (
        <NewPlanModal
          open
          onClose={() => setPlanRequest(null)}
          onCreated={() => handleSaved()}
          initialPatient={planRequest.patient}
          canWritePayments={canWritePayments}
          canReadFinance={canReadFinance}
        />
      )}
    </div>
  );
}
