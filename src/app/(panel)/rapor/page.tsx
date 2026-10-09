"use client";

import { reportQuickRange } from "@/lib/report-date-range";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { Input, Select } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import { turkeyDateKey } from "@/lib/tz";
import { METHOD_LABELS, money, shortDate } from "@/components/muhasebe/muhasebe-utils";

type ExpenseCat = { category: string; amount: number };
type FirmaRow = { name: string; amount: number };
type TopExam = { treatmentName: string; count: number };
type TopTooth = { tooth: string; count: number };

type DayCloseCheck = { key: string; label: string; status: "ok" | "warning" | "critical"; detail: string; href: string };
type DayClose = {
  income: number; expense: number; net: number;
  cashIn?: number; cashOut?: number; cashNet?: number;
  cash: number; card: number; transfer: number; mailOrder: number; other: number;
  openLabCount: number; openFollowUpCount: number; overdueInstallments: number;
  unpaidTreatmentPatientCount: number;
  checks: DayCloseCheck[];
};
type Stats = {
  totalRevenue: number; totalExpenses: number;
  totalLabCost: number; totalFirmaAlim: number; netCash: number;
  newPatients: number; totalExaminations: number;
  cash: number; card: number; transfer: number; mailOrder: number; other: number;
  expenseByCategory: ExpenseCat[];
  firmaByName: FirmaRow[];
  topExaminations: TopExam[];
  topTeeth: TopTooth[];
  overdueInstallments: number;
  outputVAT: number; inputVAT: number; netVAT: number;
  periodNetProfit: number; annualNetProfit: number; gelirVergisi: number;
  dayClose: DayClose | null;
};

const EMPTY: Stats = {
  totalRevenue: 0, totalExpenses: 0, totalLabCost: 0, totalFirmaAlim: 0,
  netCash: 0, newPatients: 0, totalExaminations: 0,
  cash: 0, card: 0, transfer: 0, mailOrder: 0, other: 0,
  expenseByCategory: [], firmaByName: [], topExaminations: [], topTeeth: [],
  overdueInstallments: 0,
  outputVAT: 0, inputVAT: 0, netVAT: 0,
  periodNetProfit: 0, annualNetProfit: 0, gelirVergisi: 0,
  dayClose: null,
};

type Tab = "genel" | "giderler" | "islemler";
const TAB_KEYS: readonly Tab[] = ["genel", "giderler", "islemler"];
type Period = "bugun" | "hafta" | "ay" | "yil" | "ozel";
const PERIOD_LABELS: Record<Period, string> = { bugun: "Bugün", hafta: "Bu hafta", ay: "Bu ay", yil: "Bu yıl", ozel: "Tarih aralığı seç" };

const STATUS: Record<DayCloseCheck["status"], { tone: BadgeTone; label: string }> = {
  ok: { tone: "success", label: "Tamam" },
  warning: { tone: "warning", label: "Bakılmalı" },
  critical: { tone: "critical", label: "Acil" },
};

const PCT = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0);
const count = (n: number) => (n || 0).toLocaleString("tr-TR");
const signed = (n: number) => `${n < 0 ? "−" : ""}${money(Math.abs(n))}`;

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Line({ label, value, tone = "text-slate-900", hint, strong = false }: { label: string; value: string; tone?: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-2 ${strong ? "" : "border-b border-slate-100"}`}>
      <div>
        <p className={strong ? "font-bold text-slate-900" : "text-sm text-slate-600"}>{label}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${strong ? "text-lg font-extrabold" : "text-sm font-semibold"} ${tone}`}>{value}</p>
    </div>
  );
}

function Bars({ rows, total, color }: { rows: { label: string; value: number; display: string }[]; total: number; color: string }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-600" title={row.label}>{row.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(3, PCT(row.value, total))}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-slate-800">{row.display}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RaporPage() {
  const startReportRequest = useLatestRequest();
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, "genel");
  const [period, setPeriod] = useState<Period>("ay");
  const [customFrom, setCustomFrom] = useState(() => `${turkeyDateKey().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(() => turkeyDateKey());
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const range = useMemo(() => {
    if (period === "ozel") return { from: `${customFrom}T00:00`, to: `${customTo}T23:59` };
    return reportQuickRange(period);
  }, [customFrom, customTo, period]);
  const rangeInvalid = period === "ozel" && (!customFrom || !customTo || customFrom > customTo);

  const load = useCallback(async () => {
    if (rangeInvalid) { setLoadError("Başlangıç tarihi bitiş tarihinden sonra olamaz."); return; }
    const request = startReportRequest();
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/reports?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { signal: request.signal });
      const data = await res.json();
      if (!request.isLatest()) return;
      if (!res.ok) throw new Error(data?.message || "Rapor verileri yüklenemedi.");
      setStats({ ...EMPTY, ...data });
    } catch (error) {
      if (isAbortError(error) || !request.isLatest()) return;
      setLoadError(error instanceof Error ? error.message : "Rapor verileri yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [range.from, range.to, rangeInvalid, startReportRequest]);

  useEffect(() => { void load(); }, [load]);

  // Sekme rozeti açık kalan iş sayısıdır (lab, hasta takip, gecikmiş taksit).
  const openChecks = (stats.dayClose?.checks || []).filter((check) => check.status !== "ok").length;
  const dateFrom = range.from.slice(0, 10);
  const dateTo = range.to.slice(0, 10);
  const rangeText = dateFrom === dateTo ? shortDate(`${dateFrom}T12:00:00Z`) : `${shortDate(`${dateFrom}T12:00:00Z`)} – ${shortDate(`${dateTo}T12:00:00Z`)}`;
  const vatPayable = stats.netVAT >= 0;
  const methodRows = [
    { key: "NAKIT", value: stats.cash },
    { key: "KREDI_KARTI", value: stats.card },
    { key: "HAVALE_EFT", value: stats.transfer },
    { key: "MAIL_ORDER", value: stats.mailOrder },
    { key: "DIGER", value: stats.other },
  ].filter((row) => row.value > 0).map((row) => ({ label: METHOD_LABELS[row.key], value: row.value, display: money(row.value) }));
  const cashNet = stats.dayClose?.cashNet ?? stats.cash;

  const headline = [
    { label: "Tahsilat", value: money(stats.totalRevenue), tone: "text-emerald-700" },
    { label: "Gider", value: money(stats.totalExpenses), tone: "text-red-700" },
    { label: "Net nakit akışı", value: signed(stats.netCash), tone: stats.netCash >= 0 ? "text-slate-900" : "text-red-700" },
    { label: vatPayable ? "Ödenecek KDV (tahmini)" : "Devreden KDV (tahmini)", value: money(Math.abs(stats.netVAT)), tone: "text-slate-900" },
  ];

  return (
    <section className="space-y-3">
      <PageHeader icon="rapor" title="Raporlar" description="Seçili dönemin tahsilat, gider, vergi ve tedavi özeti." />

      <Tabs
        ariaLabel="Rapor bölümleri"
        items={[
          { key: "genel", label: "Genel bakış", count: openChecks || undefined, countTone: "warning" },
          { key: "giderler", label: "Giderler ve vergi" },
          { key: "islemler", label: "Tedavi analizi" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Toolbar>
        <Select aria-label="Dönem" size="sm" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="sm:w-auto">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
        </Select>
        {period === "ozel" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              Başlangıç
              <Input type="date" size="sm" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="w-auto" />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              Bitiş
              <Input type="date" size="sm" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} className="w-auto" />
            </label>
          </div>
        )}
        <span className="text-xs text-slate-500">{loading ? "Hesaplanıyor…" : rangeText}</span>
      </Toolbar>

      {loadError && <LoadErrorState message={loadError} onRetry={() => void load()} />}

      <dl className="ui-surface grid grid-cols-2 divide-slate-100 sm:grid-cols-4 sm:divide-x">
        {headline.map((item) => (
          <div key={item.label} className="px-4 py-3">
            <dt className="text-xs font-semibold text-slate-500">{item.label}</dt>
            <dd className={`mt-0.5 text-lg font-extrabold tabular-nums ${item.tone}`}>{loading && stats === EMPTY ? "…" : item.value}</dd>
          </div>
        ))}
      </dl>

      {tab === "genel" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Açık kalan işler" action={<span className="text-xs text-slate-400">Seçili döneme göre</span>}>
            {stats.dayClose ? (
              <ul className="divide-y divide-slate-100">
                {stats.dayClose.checks.map((check) => (
                  <li key={check.key} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{check.label}</p>
                      <p className="text-xs text-slate-500">{check.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={STATUS[check.status].tone}>{STATUS[check.status].label}</Badge>
                      {check.status !== "ok" && (
                        <Link href={check.href} className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
                          Aç <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">{loading ? "Hesaplanıyor…" : "Kontrol listesi yüklenemedi."}</p>
            )}
          </Card>

          <Card
            title="Kasa ve nakit akışı"
            action={<Link href="/muhasebe?tab=defter&donem=bugun" className="text-xs font-semibold text-primary hover:underline">Bugünün hareketleri</Link>}
          >
            <Line label="Tahsilat" value={money(stats.totalRevenue)} tone="text-emerald-700" />
            <Line label="Ödenen giderler" hint="Firma ödemeleri ve doktor hakediş ödemeleri dahil" value={`−${money(stats.totalExpenses)}`} tone="text-red-700" />
            <Line label="Net nakit akışı" value={signed(stats.netCash)} tone={stats.netCash >= 0 ? "text-slate-900" : "text-red-700"} strong />
            <p className="mt-1 text-xs text-slate-500">
              Kasadaki nakit değişimi (nakit tahsilat − nakit gider): <b className="tabular-nums text-slate-700">{signed(cashNet)}</b>
            </p>
            {stats.totalFirmaAlim > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Bu dönemde firmalardan {money(stats.totalFirmaAlim)} alım faturası var; ödendikçe giderlere yansır.
              </p>
            )}
          </Card>

          <Card title="Tahsilatın ödeme yöntemine göre dağılımı">
            {methodRows.length > 0
              ? <Bars rows={methodRows} total={stats.totalRevenue} color="bg-primary" />
              : <EmptyState title="Bu dönemde tahsilat yok" compact />}
          </Card>

          {stats.dayClose && (
            <Card title="Tahsil edilmemiş tedaviler">
              <p className="text-sm text-slate-600">
                Bu dönemde tedavi görüp ödemesini tamamlamamış <b className="text-slate-900">{count(stats.dayClose.unpaidTreatmentPatientCount)}</b> hasta var.
              </p>
              <Link href="/muhasebe?tab=alacak" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Hasta borçlarını aç <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Card>
          )}
        </div>
      )}

      {tab === "giderler" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card
            title="Gider türleri"
            action={<Link href={`/muhasebe?tab=defter&tur=GIDER&from=${dateFrom}&to=${dateTo}`} className="text-xs font-semibold text-primary hover:underline">Giderleri listele</Link>}
          >
            {stats.expenseByCategory.length > 0 ? (
              <>
                <Bars rows={stats.expenseByCategory.map((row) => ({ label: row.category, value: row.amount, display: money(row.amount) }))} total={Math.max(...stats.expenseByCategory.map((row) => row.amount), 1)} color="bg-orange-400" />
                <Line label="Toplam gider" value={money(stats.totalExpenses)} strong />
              </>
            ) : <EmptyState title="Bu dönemde gider yok" compact />}
          </Card>

          <Card title="Firma alımları (fatura)" action={<Link href="/firma" className="text-xs font-semibold text-primary hover:underline">Firmalar</Link>}>
            {stats.firmaByName.length > 0 ? (
              <>
                <Bars rows={stats.firmaByName.map((row) => ({ label: row.name, value: row.amount, display: money(row.amount) }))} total={Math.max(...stats.firmaByName.map((row) => row.amount), 1)} color="bg-violet-400" />
                <Line label="Toplam alım" value={money(stats.totalFirmaAlim)} strong />
                <p className="text-xs text-slate-500">Alım faturasıdır; firmaya yapılan ödemeler giderlerde görünür.</p>
              </>
            ) : <EmptyState title="Bu dönemde firma alımı yok" compact />}
            {stats.totalLabCost > 0 && <p className="mt-2 text-xs text-slate-500">Laboratuvar faturaları: {money(stats.totalLabCost)} (doktor hakedişinden düşülür).</p>}
          </Card>

          <Card title="KDV özeti (tahmini)">
            <Line label="Hesaplanan KDV" hint="Tahsilatın %10'u" value={money(stats.outputVAT)} />
            <Line label="İndirilecek KDV" hint="Gider ve alım faturalarından" value={`−${money(stats.inputVAT)}`} />
            <Line label={vatPayable ? "Ödenecek KDV" : "Devreden KDV (sonraki döneme)"} value={money(Math.abs(stats.netVAT))} tone={vatPayable ? "text-red-700" : "text-emerald-700"} strong />
          </Card>

          <Card title="Gelir vergisi tahmini">
            <Line label="Dönem kârı (KDV hariç)" hint="Tahsilat − gider" value={signed(stats.periodNetProfit)} tone={stats.periodNetProfit >= 0 ? "text-slate-900" : "text-red-700"} />
            <Line label="Yıllık kâr (bu yıl şimdiye kadar)" value={signed(stats.annualNetProfit)} tone={stats.annualNetProfit >= 0 ? "text-slate-900" : "text-red-700"} />
            <Line label="Hesaplanan gelir vergisi" value={money(stats.gelirVergisi)} tone="text-red-700" strong />
            <details className="mt-1 text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-600">Vergi dilimleri (2026)</summary>
              <ul className="mt-1 space-y-0.5">
                {[["0 – 190.000 TL", "%15"], ["190.001 – 400.000 TL", "%20"], ["400.001 – 1.500.000 TL", "%27"], ["1.500.001 – 5.300.000 TL", "%35"], ["5.300.001 TL üzeri", "%40"]].map(([label, rate]) => (
                  <li key={label} className="flex justify-between"><span>{label}</span><span className="font-semibold">{rate}</span></li>
                ))}
              </ul>
            </details>
            <p className="mt-2 text-xs text-slate-400">Tahmini hesaplamadır. Resmi beyan için mali müşavirinize danışın.</p>
          </Card>
        </div>
      )}

      {tab === "islemler" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Bu dönemde <b className="text-slate-900">{count(stats.totalExaminations)}</b> tedavi kalemi işlendi, <b className="text-slate-900">{count(stats.newPatients)}</b> yeni hasta kaydedildi.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="En çok yapılan tedaviler">
              {stats.topExaminations.length > 0
                ? <Bars rows={stats.topExaminations.map((row) => ({ label: row.treatmentName, value: row.count, display: `${count(row.count)} kez` }))} total={stats.topExaminations[0]?.count || 1} color="bg-primary" />
                : <EmptyState title="Bu dönemde tedavi kaydı yok" compact />}
            </Card>
            <Card title="En çok işlem gören dişler">
              {stats.topTeeth.length > 0
                ? <Bars rows={stats.topTeeth.map((row) => ({ label: `Diş ${row.tooth}`, value: row.count, display: `${count(row.count)} kez` }))} total={stats.topTeeth[0]?.count || 1} color="bg-teal-500" />
                : <EmptyState title="Bu dönemde diş kaydı yok" compact />}
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
