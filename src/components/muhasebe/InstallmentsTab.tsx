"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarPlus, Wallet } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPhoneNumber } from "@/lib/format";
import { FINANCE_TOOLBAR_CLASS, doctorLabel, money, sharedValue, shortDate } from "@/components/muhasebe/muhasebe-utils";
import {
  isOpenPlan,
  planState,
  planSummary,
  type Installment,
  type InstallmentPlan,
  type InstallmentStats,
  type InstallmentStatusFilter,
} from "@/components/muhasebe/installment-types";
import { InstallmentPlanModal } from "@/components/muhasebe/InstallmentPlanModal";
import { InstallmentPayModal } from "@/components/muhasebe/InstallmentPayModal";
import { RemindersModal, fetchPaymentReminderCount } from "@/components/muhasebe/ReminderModals";
import { useLoadWhenActive } from "@/components/muhasebe/finance-hooks";

const STATUS_OPTIONS: { value: InstallmentStatusFilter; label: string }[] = [
  { value: "ACIK", label: "Süren" },
  { value: "GECIKTI", label: "Gecikmiş" },
  { value: "TAMAMLANDI", label: "Tamamlanan" },
  { value: "IPTAL", label: "İptal edilen" },
  { value: "HEPSI", label: "Tümü" },
];
const STATUS_FILTER_LABEL: Record<InstallmentStatusFilter, string> = {
  ACIK: "Süren planlar",
  GECIKTI: "Gecikmiş taksidi olanlar",
  TAMAMLANDI: "Tamamlanan planlar",
  IPTAL: "İptal edilen planlar",
  HEPSI: "Tüm planlar",
};
// Sunucu özeti seçili plan durumuna göre hesaplar; yalnız bu iki süzgeç tüm açık taksitleri kapsar.
const COMPLETE_STATS: ReadonlySet<InstallmentStatusFilter> = new Set(["ACIK", "HEPSI"]);

type ListResponse = { items: InstallmentPlan[]; total: number; page: number; pageCount: number };

const PAGE_SIZE = 25;

type Props = {
  /** Görünüm ekranda mı (gizliyken istek atılmaz). */
  active: boolean;
  refreshKey: number;
  initialStatus?: InstallmentStatusFilter;
  initialSearch?: string;
  /** Artınca dışarıdan gelen durum/arama yeniden uygulanır (adres aynı kalsa da). */
  filterKey?: number;
  canWriteInstallments: boolean;
  canCancelPlans: boolean;
  canReadPatients: boolean;
  canSeePatientPhone: boolean;
  canReadReminders: boolean;
  canWriteReminders: boolean;
  onChanged: () => void;
  /** "Yeni taksit planı" (yalnız taksit yazma izniyle verilir). */
  onNewPlan?: () => void;
  /** Tüm açık taksitlerin özeti geldikçe (sekme sayacı aynı veriden beslenir; ikinci istek atılmaz). */
  onStats?: (stats: InstallmentStats) => void;
};

/**
 * Alacaklar › Taksitler: vadesi gelen ve geciken taksitler, sıradaki taksidin
 * tahsilatı, aranacaklar listesi (hatırlatmalar).
 */
export function InstallmentsTab({
  active, refreshKey, initialStatus = "ACIK", initialSearch = "", filterKey = 0,
  canWriteInstallments, canCancelPlans, canReadPatients, canSeePatientPhone, canReadReminders, canWriteReminders,
  onChanged, onNewPlan, onStats,
}: Props) {
  const [status, setStatus] = useState<InstallmentStatusFilter>(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<InstallmentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<{ plan: InstallmentPlan; installment: Installment } | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const sequenceRef = useRef(0);
  const statsKeyRef = useRef<number | null>(null);
  const onStatsRef = useRef(onStats);
  useEffect(() => { onStatsRef.current = onStats; }, [onStats]);

  // Dışarıdan (ör. Hastalar görünümündeki "taksitte" bağlantısı) gelen arama/durum. `filterKey`
  // aynı hastaya ikinci tıklamada (adres değişmediğinde) da süzgeci yeniden uygular.
  useEffect(() => { setSearch(initialSearch); setDebouncedSearch(initialSearch.trim()); }, [initialSearch, filterKey]);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus, filterKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Sayfa numarası süzgece bağlı: süzgeç değişince ek istek atmadan 1. sayfaya döner.
  const queryKey = `${status}|${debouncedSearch}`;
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;

  const acceptStats = useCallback((next: InstallmentStats | undefined) => {
    if (!next) return;
    setStats(next);
    statsKeyRef.current = refreshKey;
    onStatsRef.current?.(next);
  }, [refreshKey]);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/taksit-plani?status=ACIK&take=1", { cache: "no-store" }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    acceptStats(body?.stats);
  }, [acceptStats]);

  const load = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), take: String(PAGE_SIZE) });
      if (status !== "HEPSI") params.set("status", status);
      if (debouncedSearch) params.set("q", debouncedSearch);
      // Bu süzgeçlerin özeti kullanılmıyor (özet ayrı ve hafif istekle gelir):
      // sunucu ağır istatistik sorgularını atlasın.
      if (!COMPLETE_STATS.has(status)) params.set("stats", "0");
      const response = await fetch(`/api/taksit-plani?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok) throw new Error(body?.error || body?.message || "Taksit planları yüklenemedi.");
      setData({
        items: Array.isArray(body?.items) ? body.items : [],
        total: Number(body?.total) || 0,
        page: Number(body?.page) || page,
        pageCount: Math.max(1, Number(body?.pageCount) || 1),
      });
      setError("");
      if (COMPLETE_STATS.has(status)) acceptStats(body?.stats);
      else if (statsKeyRef.current !== refreshKey) void loadStats();
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Taksit planları yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [acceptStats, debouncedSearch, loadStats, page, refreshKey, status]);

  useLoadWhenActive(active, `${queryKey}|${page}|${refreshKey}`, () => void load());

  const loadReminderCount = useCallback(() => {
    if (!canReadReminders) return;
    fetchPaymentReminderCount()
      .then(setReminderCount)
      .catch(() => undefined);
  }, [canReadReminders]);
  useLoadWhenActive(active && canReadReminders, `hatirlatma|${refreshKey}`, loadReminderCount);

  const payModalTarget = useMemo(
    () => (payTarget ? { planId: payTarget.plan.id, patientName: payTarget.plan.patient.fullName, installment: payTarget.installment, planCreatedAt: payTarget.plan.createdAt } : null),
    [payTarget],
  );

  const aging = stats?.aging5 || [];
  const agingText = [
    { label: "1–30 gün", value: aging[1] },
    { label: "31–60 gün", value: aging[2] },
    { label: "60 günden fazla", value: aging[3] },
  ].filter((part) => part.value && part.value.count > 0)
    .map((part) => `${part.label} ${money(part.value?.amount || 0)}`)
    .join(" · ");

  const overdueCount = stats?.gecikenTaksit ?? 0;
  const statItems: StatItem[] = [
    { key: "kalan", label: "Toplam kalan", value: money(stats?.toplamKalan) },
    {
      key: "geciken",
      label: "Geciken",
      value: money(stats?.gecikenTutar),
      hint: !stats ? undefined : overdueCount > 0 ? `${overdueCount} taksit · listele` : "Geciken taksit yok",
      tone: overdueCount > 0 ? "critical" : "neutral",
      onClick: overdueCount > 0 ? () => setStatus((current) => (current === "GECIKTI" ? "ACIK" : "GECIKTI")) : undefined,
      active: status === "GECIKTI",
    },
    {
      key: "hafta",
      label: "Önümüzdeki 7 gün",
      value: money(stats?.haftaTutar),
      hint: stats ? `${stats.haftaTaksit} taksit${stats.bugunVade ? ` · ${stats.bugunVade} tanesi bugün` : ""}` : undefined,
    },
  ];

  // Bütün planlar bu sayfadaysa ve hepsi aynı doktorunsa doktor adı her satırda tekrar
  // etmez (plan penceresinin başlığında yazar).
  const plans = data?.items || [];
  const sharedDoctor = data && data.pageCount <= 1 ? sharedValue(plans.map((plan) => plan.doctor.fullName)) : null;

  const patientCell = (plan: InstallmentPlan) => {
    const phone = canSeePatientPhone && plan.patient.phone && plan.patient.phone !== "***" ? formatPhoneNumber(plan.patient.phone) : "";
    const detail = [plan.baslik, sharedDoctor ? "" : doctorLabel(plan.doctor.fullName), phone].filter(Boolean).join(" · ");
    return (
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{plan.patient.fullName}</p>
        {detail && <p className="truncate text-xs text-slate-500">{detail}</p>}
      </div>
    );
  };

  const nextCell = (plan: InstallmentPlan) => {
    const summary = planSummary(plan);
    if (!isOpenPlan(plan) || !summary.next) return null;
    return (
      <div>
        <p className="text-sm tabular-nums text-slate-700">{shortDate(summary.next.vadeDate)} · {money(summary.next.kalan)}</p>
        <p className="text-xs text-slate-400">{summary.next.siraNo}. taksit</p>
      </div>
    );
  };

  const statusBadge = (plan: InstallmentPlan) => {
    const state = planState(plan);
    return <Badge tone={state.tone}>{state.label}</Badge>;
  };

  // Telefon: tahsilat kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const payMenu = (plan: InstallmentPlan) => {
    const next = planSummary(plan).next;
    return canWriteInstallments && isOpenPlan(plan) && next ? (
      <ActionMenu
        label={`${plan.patient.fullName} için işlemler`}
        items={[{ key: "pay", label: `${next.siraNo}. taksiti tahsil et`, icon: Wallet, onSelect: () => setPayTarget({ plan, installment: next }) }]}
      />
    ) : null;
  };

  const payButton = (plan: InstallmentPlan) => {
    const next = planSummary(plan).next;
    return canWriteInstallments && isOpenPlan(plan) && next ? (
      <Button
        size="sm"
        variant="secondary"
        icon={Wallet}
        onClick={() => setPayTarget({ plan, installment: next })}
        aria-label={`${plan.patient.fullName} — ${next.siraNo}. taksiti tahsil et`}
      >
        Tahsil et
      </Button>
    ) : null;
  };

  const columns: ListTableColumn<InstallmentPlan>[] = [
    { key: "hasta", header: "Hasta", render: patientCell },
    { key: "sonraki", header: "Sıradaki taksit", render: nextCell },
    { key: "durum", header: "Durum", render: statusBadge },
    {
      key: "kalan",
      header: "Kalan",
      align: "right",
      render: (plan) => {
        const summary = planSummary(plan);
        return (
          <div className="text-right">
            {summary.kalan > 0.005 && <p className="font-bold tabular-nums text-slate-900">{money(summary.kalan)}</p>}
            <p className="text-xs text-slate-400">{summary.paidCount}/{summary.activeCount} ödendi</p>
          </div>
        );
      },
    },
    ...(canWriteInstallments ? [{ key: "islem", header: "", align: "right" as const, render: payButton }] : []),
  ];

  const activeFilters: ActiveFilter[] = [
    ...(status !== "ACIK" ? [{ key: "status", label: STATUS_FILTER_LABEL[status], onRemove: () => setStatus("ACIK") }] : []),
    ...(debouncedSearch ? [{ key: "q", label: `"${debouncedSearch}"`, onRemove: () => setSearch("") }] : []),
  ];

  const emptyText = debouncedSearch ? "Aramaya uyan plan yok"
    : status === "GECIKTI" ? "Gecikmiş taksit yok"
      : status === "ACIK" ? "Süren taksit planı yok"
        : "Plan yok";
  const emptyDescription = debouncedSearch || status !== "ACIK"
    ? "Filtreyi değiştirip tekrar deneyin."
    : canWriteInstallments && onNewPlan ? "Hasta borcunu taksitlendirmek için “Yeni taksit planı”nı kullanın." : undefined;

  return (
    <div className="space-y-3">
      {/* Araç çubuğu çerçevesiz (sayfa zemininde): ayrı kart değil. */}
      <Toolbar
        bare
        className={FINANCE_TOOLBAR_CLASS}
        filterCount={status !== "ACIK" ? 1 : 0}
        filters={(
          <ChoiceCards
            label="Plan durumu"
            labelHidden
            variant="pills"
            value={status}
            onChange={setStatus}
            // Geciken sayısı tek yerde: özetteki "Geciken" kutusu (tıklanınca bu süzgeci seçer).
            // Önceden bu düğme plan sayısını (2), kutu taksit sayısını (4) gösteriyordu.
            options={STATUS_OPTIONS}
          />
        )}
        actions={(canReadReminders || (canWriteInstallments && onNewPlan)) ? (
          <>
            {canReadReminders && (
              <Button variant="secondary" size="sm" icon={Bell} count={reminderCount} countTone="warning" countLabel="aranacak hasta" onClick={() => setRemindersOpen(true)}>
                Hatırlatmalar
              </Button>
            )}
            {canWriteInstallments && onNewPlan && (
              <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={onNewPlan}>Yeni taksit planı</Button>
            )}
          </>
        ) : undefined}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Hasta, doktor veya plan adı ara" wrapperClassName="flex-1 min-w-[220px]" />
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { setStatus("ACIK"); setSearch(""); }} />

      {(stats || !error || loading) && <StatStrip items={statItems} loading={!stats} aria-label="Taksit özeti" />}
      {agingText && <p className="px-1 text-xs text-slate-500">Gecikme süresi: {agingText}</p>}

      <ListTable
        columns={columns}
        rows={data?.items || []}
        rowKey={(plan) => plan.id}
        loading={loading || (!data && !error)}
        error={data ? null : error || null}
        staleError={data ? error || null : null}
        onRetry={() => void load()}
        onRowClick={(plan) => setDetailId(plan.id)}
        getRowAriaLabel={(plan) => `${plan.patient.fullName} taksit planını aç`}
        emptyText={emptyText}
        emptyDescription={emptyDescription}
        // Telefon kartı iki satır: hasta + kalan; durum rozeti + sıradaki taksit. Plan adı,
        // doktor ve telefon karta dokununca açılan plan penceresinde; tahsilat sağ üstte "…".
        mobileCard={(plan) => {
          const summary = planSummary(plan);
          const next = isOpenPlan(plan) ? summary.next : null;
          const detail = next ? `Sıradaki ${shortDate(next.vadeDate)} · ${money(next.kalan)}` : plan.baslik || "";
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{plan.patient.fullName}</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                  {statusBadge(plan)}
                  {detail && <span className="truncate tabular-nums">{detail}</span>}
                </p>
              </div>
              {summary.kalan > 0.005 && <span className="shrink-0 font-bold tabular-nums text-slate-900">{money(summary.kalan)}</span>}
            </div>
          );
        }}
        mobileCardActions={canWriteInstallments ? payMenu : undefined}
        pager={data && data.total > PAGE_SIZE ? { page: data.page, pageCount: data.pageCount, pageSize: PAGE_SIZE, total: data.total, onPageChange: (next) => setPageState({ key: queryKey, page: next }), loading } : undefined}
      />

      <InstallmentPlanModal
        planId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={onChanged}
        canWriteInstallments={canWriteInstallments}
        canCancelPlans={canCancelPlans}
        canReadPatients={canReadPatients}
        canSeePatientPhone={canSeePatientPhone}
        canWriteReminders={canWriteReminders}
      />
      <InstallmentPayModal
        target={payModalTarget}
        onClose={() => setPayTarget(null)}
        onPaid={onChanged}
      />
      {canReadReminders && (
        <RemindersModal open={remindersOpen} onClose={() => setRemindersOpen(false)} canWrite={canWriteReminders} onChanged={loadReminderCount} />
      )}
    </div>
  );
}
