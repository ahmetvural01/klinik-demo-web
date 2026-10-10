"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Wallet } from "lucide-react";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { formatPhoneNumber } from "@/lib/format";
import { turkeyDateKey } from "@/lib/tz";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { FINANCE_TOOLBAR_CLASS, money, shortDate } from "@/components/muhasebe/muhasebe-utils";
import { useLoadWhenActive } from "@/components/muhasebe/finance-hooks";

type BalanceRow = {
  id: string;
  fullName: string;
  phone: string;
  netTedavi: number;
  odenen: number;
  bakiye: number;
  discountRate: number;
  doctors: { id: string; fullName: string }[];
  lastDoctorId: string | null;
  lastPaymentAt: string | null;
  lastTreatmentAt: string | null;
  plan: { kalan: number; nextDueDate: string | null; nextDueAmount: number; overdueCount: number; doctorId: string | null; planCount: number } | null;
};

type View = "borclu" | "avans";
const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "borclu", label: "Borçlu" },
  { value: "avans", label: "Fazla ödeme" },
];
const PAGE_SIZE = 50;

/** "Bugün / Dün / n gün önce" Türkiye takvim günüyle (24 saatlik farkla dünkü ödeme gece yarısından sonra "Bugün" görünüyordu). */
function daysAgo(value: string | null) {
  if (!value) return "";
  const dayKey = turkeyDateKey(new Date(value));
  const days = Math.round((Date.parse(`${turkeyDateKey()}T12:00:00.000Z`) - Date.parse(`${dayKey}T12:00:00.000Z`)) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 60) return `${days} gün önce`;
  return shortDate(value);
}

const lastMovement = (row: BalanceRow) => {
  const payment = row.lastPaymentAt ? new Date(row.lastPaymentAt).getTime() : 0;
  const treatment = row.lastTreatmentAt ? new Date(row.lastTreatmentAt).getTime() : 0;
  if (!payment && !treatment) return { at: null as string | null, label: "" };
  // Sütun başlığı "Son hareket"; hücrede "Bugün · tedavi" (tek satır, "son" tekrar etmez).
  return payment >= treatment ? { at: row.lastPaymentAt, label: "ödeme" } : { at: row.lastTreatmentAt, label: "tedavi" };
};

type Props = {
  /** Görünüm ekranda mı (gizliyken istek atılmaz). */
  active: boolean;
  refreshKey: number;
  canWritePayments: boolean;
  canReadPatients: boolean;
  canSeePatientPhone: boolean;
  canReadInstallments: boolean;
  /** Dışa aktarma (finance:export). */
  canExport: boolean;
  onCollect: (patient: PickedPatient, doctorId?: string) => void;
  /** Hastanın taksit planlarını Taksitler görünümünde açar. */
  onOpenPlans: (patientName: string) => void;
  /** Aynı yerin adresi (yeni sekmede açmak için). */
  plansHref: (patientName: string) => string;
  /** installments:write — satırda "Taksit planı kur" (taksitte olmayan borcu olan hastada). */
  canWriteInstallments?: boolean;
  /** Yeni taksit planı formunu bu hasta seçili (ve sabit) açar. */
  onCreatePlan?: (patient: PickedPatient) => void;
};

/**
 * Alacaklar › Hastalar: kimden ne alacağız, tek tıkla tahsilat. Kalan borcun
 * taksit planındaki kısmı aynı hücrede ikinci satırdır (önceden ayrı sütundu
 * ve kullanıcı iki tutarı toplayabiliyordu).
 */
export function BalancesTab({
  active, refreshKey, canWritePayments, canReadPatients, canSeePatientPhone, canReadInstallments, canExport,
  onCollect, onOpenPlans, plansHref, canWriteInstallments = false, onCreatePlan,
}: Props) {
  const [view, setView] = useState<View>("borclu");
  // Her görünümün verisi ayrı tutulur: görünüm değişirken öteki listenin satırları yanlış başlık altında görünmez.
  const [rowsByView, setRowsByView] = useState<Record<View, BalanceRow[] | null>>({ borclu: null, avans: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ view: View; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ListSort>({ key: "bakiye", dir: "desc" });
  const sequenceRef = useRef(0);

  const load = useCallback(async (target: View) => {
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/muhasebe/alacaklar${target === "avans" ? "?durum=avans" : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok) throw new Error(body?.message || "Hasta bakiyeleri yüklenemedi.");
      setRowsByView((current) => ({ ...current, [target]: Array.isArray(body?.rows) ? body.rows : [] }));
      setError(null);
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError({ view: target, message: loadError instanceof Error ? loadError.message : "Hasta bakiyeleri yüklenemedi." });
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, []);

  useLoadWhenActive(active, `${view}|${refreshKey}`, () => void load(view));

  const rows = rowsByView[view];
  const viewError = error?.view === view ? error.message : "";

  const filtered = useMemo(() => {
    const list = rows || [];
    const q = search.trim().toLocaleLowerCase("tr");
    const digits = q.replace(/\D/g, "");
    const matched = q
      ? list.filter((row) =>
          row.fullName.toLocaleLowerCase("tr").includes(q)
          || (digits.length > 0 && (row.phone || "").replace(/\D/g, "").includes(digits))
          || row.doctors.some((doctor) => doctor.fullName.toLocaleLowerCase("tr").includes(q)))
      : list;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      if (sort.key === "son") {
        const at = (row: BalanceRow) => { const value = lastMovement(row).at; return value ? new Date(value).getTime() : 0; };
        return (at(a) - at(b)) * direction;
      }
      if (sort.key === "hasta") return a.fullName.localeCompare(b.fullName, "tr") * direction;
      return (Math.abs(a.bakiye) - Math.abs(b.bakiye)) * direction;
    });
  }, [rows, search, sort]);

  // Sayfa numarası süzgece bağlı: arama/sıralama değişince 1. sayfaya döner.
  const pageKey = `${view}|${search}|${sort.key}|${sort.dir}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = filtered.reduce((sum, row) => sum + Math.abs(row.bakiye), 0);
  const planned = filtered.reduce((sum, row) => sum + (row.plan?.kalan || 0), 0);
  const plannedPatients = filtered.filter((row) => row.plan).length;
  const overduePatients = filtered.filter((row) => (row.plan?.overdueCount || 0) > 0).length;
  // Her hasta aynı (tek) doktordaysa "Doktor" sütunu her satırda aynı adı tekrar etmez:
  // sütun kalkar, ad özetteki ipucunda bir kez yazar (tek doktorlu klinik).
  const sharedDoctor = filtered.length > 0 && filtered.every((row) => row.doctors.length === 1 && row.doctors[0].id === filtered[0].doctors[0]?.id)
    ? filtered[0].doctors[0].fullName
    : null;

  const collect = (row: BalanceRow) => onCollect(
    { id: row.id, fullName: row.fullName, phone: row.phone || null },
    row.plan?.doctorId || row.lastDoctorId || (row.doctors.length === 1 ? row.doctors[0].id : undefined),
  );

  const nameCell = (row: BalanceRow) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {canReadPatients
          ? <Link href={`/hasta-detay?id=${encodeURIComponent(row.id)}&tab=odeme`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{row.fullName}</Link>
          : <span className="font-semibold text-slate-900">{row.fullName}</span>}
        {row.discountRate > 0 && <Badge tone="success">%{row.discountRate} indirim</Badge>}
      </div>
      {canSeePatientPhone && row.phone && <p className="text-xs text-slate-500">{formatPhoneNumber(row.phone)}</p>}
    </div>
  );

  // Borcun taksit planındaki kısmı: tıklanınca o hastanın planları Taksitler görünümünde açılır.
  // Sıradaki vade (önceki "Taksit planı" sütununda yazıyordu) bağlantının ipucunda.
  // `compact`: telefon kartında kısa ad ("Taksitte"); tutar ipucunda yazar.
  const planLine = (row: BalanceRow, compact = false) => (canReadInstallments && row.plan && view === "borclu" ? (
    <span className={`flex items-center justify-end gap-1.5 text-xs ${compact ? "shrink-0 whitespace-nowrap" : "mt-0.5 flex-wrap"}`}>
      <a
        href={plansHref(row.fullName)}
        onClick={(event) => { event.preventDefault(); onOpenPlans(row.fullName); }}
        className="font-semibold text-primary hover:underline"
        title={[`${money(row.plan.kalan)} taksitte`, row.plan.nextDueDate ? `Sıradaki vade ${shortDate(row.plan.nextDueDate)}` : "", "Bu hastanın taksit planını aç"].filter(Boolean).join(" — ")}
      >
        {/* Borcun tamamı plandaysa üstteki tutar ikinci kez yazılmaz. */}
        {Math.abs(row.plan.kalan - row.bakiye) < 0.5 ? (compact ? "Taksitte" : "Tamamı taksitte") : `${money(row.plan.kalan)} taksitte`}
      </a>
      {row.plan.overdueCount > 0 && <Badge tone="critical">{row.plan.overdueCount} gecikmiş</Badge>}
    </span>
  ) : null);

  // Taksitte olmayan borç (kalan borç − açık planın kalanı) varsa satırdan plan kurulabilir.
  const canPlan = canWriteInstallments && Boolean(onCreatePlan);
  const canPlanRow = (row: BalanceRow) => canPlan && view === "borclu" && row.bakiye - (row.plan?.kalan || 0) > 0.5;
  const startPlan = (row: BalanceRow) => onCreatePlan?.({ id: row.id, fullName: row.fullName, phone: row.phone || null });

  // Telefon: bütün satır eylemleri kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const mobileMenu = (row: BalanceRow) => {
    if (view !== "borclu") return null;
    const items: ActionMenuItem[] = [
      ...(canWritePayments ? [{ key: "collect", label: "Tahsilat al", icon: Wallet, onSelect: () => collect(row) }] : []),
      ...(canPlanRow(row) ? [{ key: "plan", label: "Taksit planı kur", icon: CalendarPlus, onSelect: () => startPlan(row) }] : []),
    ];
    return items.length > 0 ? <ActionMenu label={`${row.fullName} için işlemler`} items={items} /> : null;
  };

  // Tek birincil eylem "Tahsilat al"; plan kurma "…" menüsünde. Tahsilat izni yoksa plan düğmesi tek başına.
  const rowActions = (row: BalanceRow) => {
    if (view !== "borclu") return null;
    const planItem = canPlanRow(row);
    if (!canWritePayments) {
      return planItem
        ? <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => startPlan(row)} aria-label={`${row.fullName} için taksit planı kur`}>Taksit planı kur</Button>
        : null;
    }
    return (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="secondary" icon={Wallet} onClick={() => collect(row)} aria-label={`${row.fullName} için tahsilat al`}>Tahsilat al</Button>
        {planItem && (
          <ActionMenu
            label={`${row.fullName} için diğer işlemler`}
            items={[{ key: "plan", label: "Taksit planı kur", icon: CalendarPlus, onSelect: () => startPlan(row) }]}
          />
        )}
      </div>
    );
  };

  const columns: ListTableColumn<BalanceRow>[] = [
    { key: "hasta", header: "Hasta", sortKey: "hasta", render: nameCell },
    {
      key: "bakiye",
      header: view === "avans" ? "Fazla ödeme" : "Kalan borç",
      headerHint: view === "avans"
        ? "Alınan tahsilatların indirimli tedavi tutarını aşan kısmı."
        : "İndirimli tedavi tutarı − alınan tahsilatlar (taksit tahsilatları dahil). İptal edilen ve planlanan tedaviler hariç.",
      align: "right",
      sortKey: "bakiye",
      render: (row) => (
        <div className="flex flex-col items-end">
          <span className={`font-bold tabular-nums ${view === "avans" ? "text-emerald-700" : "text-slate-900"}`}>{money(Math.abs(row.bakiye))}</span>
          {planLine(row)}
        </div>
      ),
    },
    ...(sharedDoctor ? [] : [{
      key: "hekim",
      header: "Doktor",
      render: (row: BalanceRow) => (row.doctors.length
        ? <span className="line-clamp-2 text-sm text-slate-600">{row.doctors.map((doctor) => doctor.fullName).join(", ")}</span>
        : null),
    }]),
    {
      key: "son",
      header: "Son hareket",
      sortKey: "son",
      render: (row) => {
        const last = lastMovement(row);
        return last.at ? (
          <span className="whitespace-nowrap text-sm text-slate-700">
            {daysAgo(last.at)} <span className="text-xs text-slate-400">· {last.label}</span>
          </span>
        ) : null;
      },
    },
    ...(view === "borclu" && (canWritePayments || canPlan) ? [{ key: "islem", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  const exportExcel = async () => {
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(view === "avans" ? "fazla-odeme-yapan-hastalar.csv" : "hasta-alacaklari.csv", filtered.map((row) => ({
      Hasta: row.fullName,
      Telefon: canSeePatientPhone ? row.phone || "" : "",
      Doktor: row.doctors.map((doctor) => doctor.fullName).join(" / "),
      "Tedavi (indirimli)": row.netTedavi.toFixed(2).replace(".", ","),
      Ödenen: row.odenen.toFixed(2).replace(".", ","),
      [view === "avans" ? "Fazla ödeme" : "Kalan borç"]: Math.abs(row.bakiye).toFixed(2).replace(".", ","),
      "Taksit planı kalanı": row.plan ? row.plan.kalan.toFixed(2).replace(".", ",") : "",
      "Son hareket": lastMovement(row).at ? shortDate(lastMovement(row).at) : "",
    })));
  };

  const patientHint = rows ? [`${filtered.length} hasta`, sharedDoctor || ""].filter(Boolean).join(" · ") : undefined;
  const stats: StatItem[] = view === "avans"
    ? [{ key: "total", label: "Toplam fazla ödeme", value: money(total), tone: "success", hint: patientHint }]
    : [
        { key: "total", label: "Toplam alacak", value: money(total), hint: patientHint },
        ...(canReadInstallments ? [{
          key: "plan",
          label: "Taksit planında",
          value: money(planned),
          tone: overduePatients > 0 ? "warning" as const : "neutral" as const,
          hint: !rows ? undefined : overduePatients > 0 ? `${overduePatients} hastada geciken taksit` : `${plannedPatients} hasta`,
        }] : []),
      ];

  const activeFilters: ActiveFilter[] = [
    ...(view === "avans" ? [{ key: "view", label: "Fazla ödeme yapanlar", onRemove: () => setView("borclu") }] : []),
    ...(search.trim() ? [{ key: "q", label: `"${search.trim()}"`, onRemove: () => setSearch("") }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* Araç çubuğu çerçevesiz (sayfa zemininde): ayrı kart değil. */}
      <Toolbar
        bare
        className={FINANCE_TOOLBAR_CLASS}
        filterCount={view === "avans" ? 1 : 0}
        filters={<ChoiceCards label="Gösterilecek hastalar" labelHidden variant="pills" value={view} onChange={setView} options={VIEW_OPTIONS} />}
        actions={canExport ? <ExportMenu disabled={filtered.length === 0} disabledReason="Dışa aktarılacak hasta yok" onExcel={exportExcel} /> : undefined}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Hasta adı, telefon veya doktor ara" wrapperClassName="flex-1 min-w-[220px]" />
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { setView("borclu"); setSearch(""); }} />
      {(rows || !viewError || loading) && <StatStrip items={stats} loading={!rows} aria-label="Alacak özeti" />}
      <ListTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        loading={loading || (!rows && !viewError)}
        error={rows ? null : viewError || null}
        staleError={rows ? viewError || null : null}
        onRetry={() => void load(view)}
        sort={sort}
        onSortChange={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))}
        emptyText={search ? "Aramaya uyan hasta yok" : view === "avans" ? "Fazla ödeme yapan hasta yok" : "Borcu olan hasta yok"}
        emptyDescription={search ? "Arama metnini değiştirip tekrar deneyin." : undefined}
        emptyAction={search ? <Button size="sm" variant="secondary" onClick={() => setSearch("")}>Aramayı temizle</Button> : undefined}
        // Telefon kartı iki satır: ad + borç; telefon · (doktor) · son hareket. Eylemler sağ üstte "…".
        mobileCard={(row) => {
          const meta = [
            canSeePatientPhone && row.phone ? formatPhoneNumber(row.phone) : "",
            sharedDoctor ? "" : row.doctors.map((doctor) => doctor.fullName).join(", "),
            daysAgo(lastMovement(row).at),
          ].filter(Boolean).join(" · ");
          const plan = planLine(row, true);
          // İki hizalı sıra: [ad + indirim | borç], [telefon · son hareket | taksit]. Kısa sütun sağda kalır.
          return (
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  {canReadPatients
                    ? <Link href={`/hasta-detay?id=${encodeURIComponent(row.id)}&tab=odeme`} className="truncate font-semibold text-slate-900 hover:text-primary hover:underline">{row.fullName}</Link>
                    : <span className="truncate font-semibold text-slate-900">{row.fullName}</span>}
                  {row.discountRate > 0 && <Badge tone="success" className="shrink-0">%{row.discountRate} indirim</Badge>}
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${view === "avans" ? "text-emerald-700" : "text-slate-900"}`}>{money(Math.abs(row.bakiye))}</span>
              </div>
              {(meta || plan) && (
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-xs text-slate-500" title={meta || undefined}>{meta}</p>
                  {plan}
                </div>
              )}
            </div>
          );
        }}
        mobileCardActions={view === "borclu" && (canWritePayments || canPlan) ? mobileMenu : undefined}
        pager={filtered.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: (next) => setPageState({ key: pageKey, page: next }) } : undefined}
      />
    </div>
  );
}
