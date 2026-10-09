"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Plus, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { isValidDateKey } from "@/lib/tz";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { LedgerTab, type PeriodKey } from "@/components/muhasebe/LedgerTab";
import { BalancesTab } from "@/components/muhasebe/BalancesTab";
import { InstallmentsTab, isInstallmentStatusFilter } from "@/components/muhasebe/InstallmentsTab";
import { HakedisTab } from "@/components/muhasebe/HakedisTab";
import { EntryModal, type EntryKind, type EntryRequest } from "@/components/muhasebe/EntryModal";
import { EditEntryModal, type EditTarget } from "@/components/muhasebe/EditEntryModal";
import { NewPlanModal } from "@/components/muhasebe/NewPlanModal";

type TabId = "defter" | "alacak" | "taksit" | "hakedis";
const TAB_LABELS: Record<TabId, string> = {
  defter: "Gelir ve gider",
  alacak: "Hasta borçları",
  taksit: "Taksitler",
  hakedis: "Hakediş",
};
const ENTRY_KINDS: readonly EntryKind[] = ["gelir", "gider", "firma", "hakedis"];
const PERIOD_KEYS: readonly PeriodKey[] = ["bugun", "hafta", "ay", "gecen-ay", "3ay", "yil", "ozel"];

/**
 * Muhasebe: tek sayfa, dört bölüm.
 * - Gelir ve gider: tahsilat + gider listesi (sunucuda dönem filtreli ve toplamlı).
 * - Hasta borçları: kimden ne alacağız, tek tıkla tahsilat.
 * - Taksitler: taksit planları, sıradaki taksidin tahsilatı, hatırlatmalar.
 * - Hakediş: hangi doktora hangi ay ne ödenecek.
 *
 * Adres çubuğu sözleşmesi: ?tab=defter|alacak|taksit|hakedis; ?islem=gelir|gider|firma|hakedis
 * (üst bardaki "Yeni > Tahsilat" bunu kullanır; patientId/patientName ile hasta önceden seçilir);
 * ?yeni=1 sekmenin "Yeni" formunu açar.
 */
export default function MuhasebePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canReadPayments = can("payments:read");
  const canWritePayments = can("payments:write");
  const canRefundPayments = can("payments:refund");
  const canReadFinance = can("finance:read");
  const canWriteFinance = can("finance:write");
  const canReadInstallments = can("installments:read");
  const canWriteInstallments = can("installments:write");
  const canDeleteInstallments = can("installments:delete");
  const canReadPatients = can("patients:read");
  const canSeePatientPhone = can("patients:phone");
  const canReadReminders = can("appointments:read");
  const canWriteReminders = can("appointments:write");

  // Her bölüm kendi izniyle görünür: ör. banko taksit iznine sahipse Taksitler'i görür
  // (önceden taksitler finans okuma izni isteyen Alacaklar sekmesinin içindeydi).
  const visibleTabs = useMemo(() => (Object.keys(TAB_LABELS) as TabId[]).filter((tab) => {
    if (tab === "defter") return canReadPayments || canReadFinance;
    if (tab === "taksit") return canReadInstallments;
    return canReadFinance;
  }), [canReadFinance, canReadInstallments, canReadPayments]);

  const [activeTab] = useTabParam<TabId>(visibleTabs, visibleTabs[0] || "defter");
  const changeTab = useCallback((tab: TabId) => {
    router.replace(`/muhasebe?tab=${tab}`, { scroll: false });
  }, [router]);

  // Eski adresler: tab=genel|gelir|gider|cari artık listeyi (gerekirse filtreli) açar —
  // önceden "Tüm giderleri gör" bağlantısı yanlışlıkla yeni gider formunu açıyordu.
  useEffect(() => {
    const legacy = searchParams.get("tab");
    if (legacy === "genel" || legacy === "cari") router.replace("/muhasebe?tab=defter", { scroll: false });
    else if (legacy === "gelir") router.replace("/muhasebe?tab=defter&tur=TAHSILAT", { scroll: false });
    else if (legacy === "gider") router.replace("/muhasebe?tab=defter&tur=GIDER", { scroll: false });
  }, [router, searchParams]);

  // ── Ortak yenileme sinyali: kayıt sonrası, başka personelin kaydında ve sekmeye dönüşte.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);
  const lastVisibleRefreshAtRef = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(bump, 500);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastVisibleRefreshAtRef.current < 10_000) return;
      lastVisibleRefreshAtRef.current = Date.now();
      bump();
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bump]);

  // Vadesi geçen taksitleri "gecikti" olarak işaretle (sessiz; ekranlar zaten canlı durumu hesaplar).
  useEffect(() => {
    if (!canWriteInstallments) return;
    void fetch("/api/taksit-plani/mark-gecikti", { method: "POST" }).catch(() => undefined);
  }, [canWriteInstallments]);

  // Taksitler sekmesindeki kırmızı sayaç: geciken taksit ADEDİ (sunucu özeti).
  const [overdueCount, setOverdueCount] = useState(0);
  useEffect(() => {
    if (!canReadInstallments) return;
    let active = true;
    fetch("/api/taksit-plani?status=GECIKTI&take=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (active) setOverdueCount(Number(body?.stats?.gecikenTaksit) || 0); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [canReadInstallments, refreshKey]);

  // ── Pencereler
  const [entryRequest, setEntryRequest] = useState<EntryRequest | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const openEntry = useCallback((kind: EntryKind, extra: Omit<EntryRequest, "kind"> = {}) => {
    setEntryRequest({ kind, ...extra });
  }, []);

  // ?islem=… (üst bar "Yeni > Tahsilat", /gider, eski bağlantılar) ve ?yeni=1.
  useEffect(() => {
    const action = searchParams.get("islem");
    const isNew = searchParams.get("yeni") === "1";
    if (!action && !isNew) return;
    const patientId = searchParams.get("patientId");
    const patientName = searchParams.get("patientName");
    const patient: PickedPatient | null = patientId ? { id: patientId, fullName: patientName || "Seçili hasta" } : null;
    const kind = action === "cari" ? "firma" : (ENTRY_KINDS as readonly string[]).includes(action || "") ? (action as EntryKind) : null;
    const tab = searchParams.get("tab");
    if (kind) {
      setEntryRequest({ kind, patient });
      router.replace(`/muhasebe?tab=${kind === "hakedis" ? "hakedis" : "defter"}`, { scroll: false });
    } else if (isNew) {
      if (tab === "taksit") setPlanOpen(true);
      else if (tab === "hakedis") setEntryRequest({ kind: "hakedis" });
      else setEntryRequest({ kind: canWritePayments ? "gelir" : "gider", patient });
      router.replace(`/muhasebe?tab=${tab && (Object.keys(TAB_LABELS) as string[]).includes(tab) ? tab : "defter"}`, { scroll: false });
    }
  }, [canWritePayments, router, searchParams]);

  const handleSaved = useCallback(() => bump(), [bump]);

  // ── Sekmelere adres çubuğundan gelen başlangıç filtreleri
  const ledgerInitial = useMemo(() => {
    const turParam = searchParams.get("tur");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const donem = searchParams.get("donem");
    return {
      tur: turParam === "TAHSILAT" || turParam === "GIDER" ? turParam : undefined,
      from: from && isValidDateKey(from) ? from : undefined,
      to: to && isValidDateKey(to) ? to : undefined,
      period: donem && (PERIOD_KEYS as readonly string[]).includes(donem) ? (donem as PeriodKey) : undefined,
    } as const;
  }, [searchParams]);
  const ledgerKey = `${ledgerInitial.tur || ""}|${ledgerInitial.from || ""}|${ledgerInitial.to || ""}|${ledgerInitial.period || ""}`;
  const durumParam = searchParams.get("durum");
  const installmentStatus = isInstallmentStatusFilter(durumParam) ? durumParam : "ACIK";
  const installmentSearch = searchParams.get("q") || "";
  const selectedDoctorId = activeTab === "hakedis" ? searchParams.get("doctorId") || "" : "";

  const selectDoctor = useCallback((doctorId: string) => {
    router.replace(`/muhasebe?tab=hakedis${doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : ""}`, { scroll: false });
  }, [router]);

  // ── Sayfanın tek birincil eylemi seçili bölüme göre değişir: kullanıcı bir sonraki adımı hep sağ üstte görür.
  const headerActions = (() => {
    if (activeTab === "taksit") {
      return canWriteInstallments ? <Button icon={CalendarPlus} onClick={() => setPlanOpen(true)}>Yeni Plan</Button> : null;
    }
    if (activeTab === "hakedis") {
      return canWriteFinance ? <Button icon={Wallet} onClick={() => openEntry("hakedis")}>Hakediş öde</Button> : null;
    }
    if (activeTab === "alacak") {
      return canWritePayments ? <Button icon={Wallet} onClick={() => openEntry("gelir")}>Tahsilat al</Button> : null;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {canWriteFinance && (
          <Button variant={canWritePayments ? "secondary" : "primary"} icon={Receipt} onClick={() => openEntry("gider")}>Gider ekle</Button>
        )}
        {canWritePayments && <Button icon={Plus} onClick={() => openEntry("gelir")}>Tahsilat al</Button>}
      </div>
    );
  })();

  if (visibleTabs.length === 0) {
    return (
      <div className="space-y-3">
        <PageHeader icon="finance" title="Muhasebe" />
        <EmptyState title="Muhasebe bölümlerini görme yetkiniz yok" description="Klinik yöneticinizden tahsilat, gider veya taksit yetkisi isteyin." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        icon="finance"
        title="Muhasebe"
        description="Tahsilat, gider, hasta borçları, taksitler ve doktor hakedişleri."
        actions={headerActions}
      />

      <Tabs
        ariaLabel="Muhasebe bölümleri"
        items={visibleTabs.map((tab) => ({
          key: tab,
          label: TAB_LABELS[tab],
          count: tab === "taksit" ? overdueCount : undefined,
          countTone: "critical" as const,
        }))}
        value={activeTab}
        onChange={changeTab}
      />

      {activeTab === "defter" && (
        <LedgerTab
          key={ledgerKey}
          canWritePayments={canWritePayments}
          canRefundPayments={canRefundPayments}
          canWriteFinance={canWriteFinance}
          refreshKey={refreshKey}
          initial={ledgerInitial}
          onEdit={setEditTarget}
          onNew={(kind) => openEntry(kind)}
          onChanged={bump}
        />
      )}

      {activeTab === "alacak" && (
        <BalancesTab
          canWritePayments={canWritePayments}
          canReadPatients={canReadPatients}
          canSeePatientPhone={canSeePatientPhone}
          canReadInstallments={canReadInstallments}
          refreshKey={refreshKey}
          onCollect={(patient, doctorId) => openEntry("gelir", { patient, doctorId })}
          onOpenPlans={(patientName) => router.replace(`/muhasebe?tab=taksit&durum=HEPSI&q=${encodeURIComponent(patientName)}`, { scroll: false })}
        />
      )}

      {activeTab === "taksit" && (
        <InstallmentsTab
          refreshKey={refreshKey}
          initialStatus={installmentStatus}
          initialSearch={installmentSearch}
          canWriteInstallments={canWriteInstallments}
          canCancelPlans={canDeleteInstallments}
          canReadPatients={canReadPatients}
          canSeePatientPhone={canSeePatientPhone}
          canReadReminders={canReadReminders}
          canWriteReminders={canWriteReminders}
          onChanged={bump}
        />
      )}

      {activeTab === "hakedis" && (
        <HakedisTab
          selectedDoctorId={selectedDoctorId}
          onSelectDoctor={selectDoctor}
          canPay={canWriteFinance}
          onPay={(doctorId, year, month, kalan) => openEntry("hakedis", { payout: { doctorId, year, month, kalan } })}
          refreshKey={refreshKey}
        />
      )}

      <EntryModal
        request={entryRequest}
        onClose={() => setEntryRequest(null)}
        onSaved={handleSaved}
        canWritePayments={canWritePayments}
        canWriteFinance={canWriteFinance}
        canReadFinance={canReadFinance}
      />
      <EditEntryModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      <NewPlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onCreated={() => bump()}
        canWritePayments={canWritePayments}
        canReadFinance={canReadFinance}
      />
    </div>
  );
}
