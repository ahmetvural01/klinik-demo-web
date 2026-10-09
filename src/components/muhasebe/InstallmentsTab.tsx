"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Wallet } from "lucide-react";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { formatPhoneNumber } from "@/lib/format";
import { PLAN_STATUS_LABELS, PLAN_STATUS_TONE, money, shortDate } from "@/components/muhasebe/muhasebe-utils";
import { planSummary, isOpenPlan, type Installment, type InstallmentPlan } from "@/components/muhasebe/installment-types";
import { InstallmentPlanModal } from "@/components/muhasebe/InstallmentPlanModal";
import { InstallmentPayModal } from "@/components/muhasebe/InstallmentPayModal";
import { RemindersModal, fetchPaymentReminders } from "@/components/muhasebe/ReminderModals";

export type InstallmentStatusFilter = "ACIK" | "GECIKTI" | "TAMAMLANDI" | "IPTAL" | "HEPSI";
const STATUS_OPTIONS: { value: InstallmentStatusFilter; label: string }[] = [
  { value: "ACIK", label: "Ödemesi süren planlar" },
  { value: "GECIKTI", label: "Gecikmiş taksidi olanlar" },
  { value: "TAMAMLANDI", label: "Tamamlanan planlar" },
  { value: "IPTAL", label: "İptal edilen planlar" },
  { value: "HEPSI", label: "Tüm planlar" },
];
export const isInstallmentStatusFilter = (value: string | null): value is InstallmentStatusFilter =>
  STATUS_OPTIONS.some((option) => option.value === value);

type Stats = {
  toplamKalan: number;
  gecikenTaksit: number;
  gecikenTutar: number;
  haftaTaksit: number;
  haftaTutar: number;
  aging5?: { amount: number; count: number }[];
};
type ListResponse = { items: InstallmentPlan[]; total: number; page: number; pageCount: number; stats?: Stats };

const PAGE_SIZE = 25;

type Props = {
  refreshKey: number;
  initialStatus?: InstallmentStatusFilter;
  initialSearch?: string;
  canWriteInstallments: boolean;
  canCancelPlans: boolean;
  canReadPatients: boolean;
  canSeePatientPhone: boolean;
  canReadReminders: boolean;
  canWriteReminders: boolean;
  onChanged: () => void;
};

export function InstallmentsTab({
  refreshKey, initialStatus = "ACIK", initialSearch = "",
  canWriteInstallments, canCancelPlans, canReadPatients, canSeePatientPhone, canReadReminders, canWriteReminders, onChanged,
}: Props) {
  const [status, setStatus] = useState<InstallmentStatusFilter>(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<{ plan: InstallmentPlan; installment: Installment } | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const sequenceRef = useRef(0);

  // Dışarıdan (ör. Alacaklar'daki "taksit planı" bağlantısı) gelen arama/durum.
  useEffect(() => { setSearch(initialSearch); setDebouncedSearch(initialSearch.trim()); }, [initialSearch]);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(1); }, [status, debouncedSearch]);

  const load = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), take: String(PAGE_SIZE) });
      if (status !== "HEPSI") params.set("status", status);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const response = await fetch(`/api/taksit-plani?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok) throw new Error(body?.error || body?.message || "Taksit planları yüklenemedi.");
      setData({
        items: Array.isArray(body?.items) ? body.items : [],
        total: Number(body?.total) || 0,
        page: Number(body?.page) || page,
        pageCount: Math.max(1, Number(body?.pageCount) || 1),
        stats: body?.stats,
      });
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Taksit planları yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [debouncedSearch, page, status]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const loadReminderCount = useCallback(() => {
    if (!canReadReminders) return;
    fetchPaymentReminders()
      .then((list) => setReminderCount(list.length))
      .catch(() => setReminderCount(0));
  }, [canReadReminders]);
  useEffect(() => { loadReminderCount(); }, [loadReminderCount, refreshKey]);

  const changed = () => { void load(); loadReminderCount(); onChanged(); };
  const payModalTarget = useMemo(
    () => (payTarget ? { planId: payTarget.plan.id, patientName: payTarget.plan.patient.fullName, installment: payTarget.installment } : null),
    [payTarget],
  );

  const stats = data?.stats;
  const aging = stats?.aging5 || [];
  const agingParts = [
    { label: "1–30 gün", value: aging[1] },
    { label: "31–60 gün", value: aging[2] },
    { label: "60 günden fazla", value: aging[3] },
  ].filter((part) => part.value && part.value.count > 0);

  const nextCell = (plan: InstallmentPlan) => {
    const summary = planSummary(plan);
    if (!isOpenPlan(plan) || !summary.next) return <EmptyValue />;
    return (
      <div>
        <p className={`text-sm tabular-nums ${summary.overdueCount > 0 ? "font-semibold text-red-700" : "text-slate-700"}`}>
          {shortDate(summary.next.vadeDate)} · {money(summary.next.kalan)}
        </p>
        {summary.overdueCount > 0
          ? <p className="text-xs font-semibold text-red-700">{summary.overdueDays} gün gecikti{summary.overdueCount > 1 ? ` · ${summary.overdueCount} taksit` : ""}</p>
          : <p className="text-xs text-slate-400">{summary.next.siraNo}. taksit</p>}
      </div>
    );
  };

  const patientCell = (plan: InstallmentPlan) => {
    const phone = canSeePatientPhone && plan.patient.phone && plan.patient.phone !== "***" ? formatPhoneNumber(plan.patient.phone) : "";
    return (
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{plan.patient.fullName}</p>
        <p className="truncate text-xs text-slate-500">{[plan.baslik, phone].filter(Boolean).join(" · ") || `Dr. ${plan.doctor.fullName}`}</p>
      </div>
    );
  };

  const payNext = (plan: InstallmentPlan) => {
    const next = planSummary(plan).next;
    if (next) setPayTarget({ plan, installment: next });
  };

  const actionCell = (plan: InstallmentPlan) => {
    const next = planSummary(plan).next;
    return canWriteInstallments && isOpenPlan(plan) && next
      ? <div className="flex justify-end"><IconButton icon={Wallet} tone="primary" size="sm" title={`${plan.patient.fullName} — ${next.siraNo}. taksiti tahsil et`} onClick={() => payNext(plan)} /></div>
      : null;
  };

  const columns: ListTableColumn<InstallmentPlan>[] = [
    { key: "hasta", header: "Hasta", render: patientCell },
    { key: "doktor", header: "Doktor", cellClassName: "text-sm text-slate-600", render: (plan) => plan.doctor.fullName },
    {
      key: "kalan",
      header: "Kalan",
      align: "right",
      render: (plan) => {
        const summary = planSummary(plan);
        return (
          <div className="text-right">
            <p className="font-bold tabular-nums text-slate-900">{summary.kalan > 0.005 ? money(summary.kalan) : "—"}</p>
            <p className="text-xs text-slate-400">{summary.paidCount}/{summary.activeCount} taksit ödendi</p>
          </div>
        );
      },
    },
    { key: "sonraki", header: "Sıradaki taksit", render: nextCell },
    { key: "durum", header: "Durum", render: (plan) => <Badge tone={PLAN_STATUS_TONE[plan.status] || "neutral"}>{PLAN_STATUS_LABELS[plan.status] || plan.status}</Badge> },
    { key: "islem", header: "", align: "right", render: actionCell },
  ];

  const activeFilters: ActiveFilter[] = [
    ...(status !== "ACIK" ? [{ key: "status", label: STATUS_OPTIONS.find((option) => option.value === status)?.label || status, onRemove: () => setStatus("ACIK") }] : []),
    ...(debouncedSearch ? [{ key: "q", label: `"${debouncedSearch}"`, onRemove: () => setSearch("") }] : []),
  ];

  const header = (
    <div className="border-b border-slate-100 px-4 py-3 text-sm">
      {stats ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-slate-500">Toplam kalan <b className="tabular-nums text-slate-900">{money(stats.toplamKalan)}</b></span>
            {stats.gecikenTaksit > 0 ? (
              <button type="button" onClick={() => setStatus("GECIKTI")} className="text-left text-red-700 hover:underline" title="Gecikmiş taksidi olan planları göster">
                Geciken <b className="tabular-nums">{money(stats.gecikenTutar)}</b> <span className="text-xs">({stats.gecikenTaksit} taksit)</span>
              </button>
            ) : (
              <span className="text-slate-500">Geciken taksit yok</span>
            )}
            <span className="text-slate-500">Önümüzdeki 7 gün <b className="tabular-nums text-slate-800">{money(stats.haftaTutar)}</b> <span className="text-xs text-slate-400">({stats.haftaTaksit} taksit)</span></span>
          </div>
          {agingParts.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Gecikme süresi: {agingParts.map((part) => `${part.label} ${money(part.value?.amount || 0)}`).join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className="text-slate-400">{loading ? "Özet hesaplanıyor…" : " "}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <Toolbar
        actions={canReadReminders ? (
          <Button variant="secondary" size="sm" icon={Bell} onClick={() => setRemindersOpen(true)}>
            Hatırlatmalar{reminderCount > 0 ? ` (${reminderCount})` : ""}
          </Button>
        ) : undefined}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Hasta, doktor veya plan adı ara" wrapperClassName="flex-1 min-w-[220px]" />
        <Select aria-label="Plan durumu" size="sm" value={status} onChange={(event) => setStatus(event.target.value as InstallmentStatusFilter)} className="sm:w-auto">
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { setStatus("ACIK"); setSearch(""); }} />

      <ListTable
        columns={columns}
        rows={data?.items || []}
        rowKey={(plan) => plan.id}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        header={header}
        onRowClick={(plan) => setDetailId(plan.id)}
        getRowAriaLabel={(plan) => `${plan.patient.fullName} taksit planını aç`}
        rowClassName={(plan) => (planSummary(plan).overdueCount > 0 && isOpenPlan(plan) ? "bg-red-50/40" : "")}
        emptyText={debouncedSearch ? "Aramaya uyan plan yok" : status === "GECIKTI" ? "Gecikmiş taksit yok" : status === "ACIK" ? "Ödemesi süren taksit planı yok" : "Plan yok"}
        emptyDescription={debouncedSearch || status !== "ACIK" ? "Filtreyi değiştirip tekrar deneyin." : "Hasta borcunu taksitlendirmek için sağ üstteki \"Yeni Plan\" düğmesini kullanın."}
        mobileCard={(plan) => {
          const summary = planSummary(plan);
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {patientCell(plan)}
                {isOpenPlan(plan) && summary.next ? (
                  <p className={`mt-0.5 text-xs ${summary.overdueCount > 0 ? "font-semibold text-red-700" : "text-slate-500"}`}>
                    Sıradaki {shortDate(summary.next.vadeDate)} · {money(summary.next.kalan)}
                    {summary.overdueCount > 0 ? ` · ${summary.overdueDays} gün gecikti` : ""}
                  </p>
                ) : (
                  <div className="mt-1"><Badge tone={PLAN_STATUS_TONE[plan.status] || "neutral"}>{PLAN_STATUS_LABELS[plan.status] || plan.status}</Badge></div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-bold tabular-nums text-slate-900">{summary.kalan > 0.005 ? money(summary.kalan) : "—"}</span>
                {actionCell(plan)}
              </div>
            </div>
          );
        }}
        pager={data && data.total > PAGE_SIZE ? { page: data.page, pageCount: data.pageCount, pageSize: PAGE_SIZE, total: data.total, onPageChange: setPage, loading } : undefined}
      />

      <InstallmentPlanModal
        planId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={changed}
        canWriteInstallments={canWriteInstallments}
        canCancelPlans={canCancelPlans}
        canReadPatients={canReadPatients}
        canSeePatientPhone={canSeePatientPhone}
        canWriteReminders={canWriteReminders}
      />
      <InstallmentPayModal
        target={payModalTarget}
        onClose={() => setPayTarget(null)}
        onPaid={changed}
      />
      {canReadReminders && (
        <RemindersModal open={remindersOpen} onClose={() => setRemindersOpen(false)} canWrite={canWriteReminders} onChanged={loadReminderCount} />
      )}
    </div>
  );
}
