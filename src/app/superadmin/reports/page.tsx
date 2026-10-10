"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Toolbar } from "@/components/ui/Toolbar";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { Section } from "@/components/ui/Section";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { formatRangeLabel, type DatePresetKey, type DateRange } from "@/lib/date-presets";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { planLabel } from "@/components/superadmin/sa-labels";
import { count, money } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

const ReportsEmptyIcon = createModuleEmptyIcon("rapor");

type ClinicRow = { id: string; name: string; sent: number; failed: number; soldSms: number; smsRevenue: number; collected: number };
type ReportData = {
  collected: number;
  collectedGrowth: number | null;
  issuedAmount: number;
  issuedCount: number;
  soldSms: number;
  smsRevenue: number;
  sentSms: number;
  failedSms: number;
  plans: { plan: string; cycle: string; count: number }[];
  clinics: ClinicRow[];
};

// Dönem seçimi ortak seçiciyle (çip): ana süzgeç bu sayfanın kendisi. "Son 12
// ay" ortak dönem listesinde yok; yerine "Bu yıl" ve "Tarih aralığı seç".
const PRESETS: readonly DatePresetKey[] = ["ay", "gecen-ay", "3ay", "yil", "ozel"];

const SORTERS: Record<string, (row: ClinicRow) => number | string> = {
  name: (row) => row.name,
  sent: (row) => row.sent,
  failed: (row) => row.failed,
  soldSms: (row) => row.soldSms,
  smsRevenue: (row) => row.smsRevenue,
  collected: (row) => row.collected,
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Raporlar — seçilen dönemde para (tahsilat, kesilen fatura) ve SMS (satılan,
 * gönderilen, başarısız), klinik bazında döküm ve CSV. Dönem önceden sekme
 * görünümünde seçiliyordu (sekme = sayfa bölümü kuralına aykırı) ve özel
 * aralık yoktu; dönemden bağımsız "Açık alacak (bugün)" kartı Kontrol Paneli
 * ve Faturalar'ı tekrar ediyordu.
 */
export default function ReportsPage() {
  const period = useDateRangeParam(PRESETS, "ay");
  const range = period.range;
  const [data, setData] = useState<{ report: ReportData; range: DateRange } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<ListSort>({ key: "sent", dir: "desc" });

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    // Geçersiz özel aralıkta istek atılmaz; hata tarih alanlarının altında görünür.
    if (period.error || !range) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<ReportData>(`/api/superadmin/reports?from=${range.from}&to=${range.to}`, "Raporlar yüklenemedi.", controller.signal)
      .then((report) => setData({ report, range }))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Raporlar yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period.error, range, reloadKey]);

  const report = data?.report ?? null;
  const shownRange = data?.range ?? range;
  const rangeLabel = formatRangeLabel(shownRange);
  // Dönem değişirken eski rakamlar soluk kalır; ilk yüklemede iskelet (bilinmeyen tutar ₺0 görünmez).
  const firstLoad = !report;
  const stale = Boolean(report) && (loading || Boolean(period.error));

  const rows = useMemo(() => {
    const list = report?.clinics ?? [];
    const pick = SORTERS[sort.key] || SORTERS.sent;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      return (typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "tr") : Number(x) - Number(y)) * dir;
    });
  }, [report, sort]);

  const changeSort = (key: string) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : key === "name" ? "asc" : "desc" }));

  const exportCsv = () => {
    if (!report || !shownRange) return;
    const header = ["Klinik", "Gönderilen SMS", "Başarısız SMS", "Satılan SMS", "SMS satış tutarı (TL)", "Tahsil edilen fatura (TL)"];
    const lines = rows.map((row) => [row.name, row.sent, row.failed, row.soldSms, row.smsRevenue.toFixed(2).replace(".", ","), row.collected.toFixed(2).replace(".", ",")]);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-raporu-${shownRange.from}_${shownRange.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: ListTableColumn<ClinicRow>[] = [
    { key: "name", header: "Klinik", sortKey: "name", render: (row) => <Link href={`/superadmin/institutions/${row.id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{row.name}</Link> },
    { key: "sent", header: "Gönderilen SMS", align: "right", sortKey: "sent", render: (row) => <span className="tabular-nums">{count(row.sent)}</span> },
    { key: "failed", header: "Başarısız", align: "right", sortKey: "failed", render: (row) => <span className={`tabular-nums ${row.failed > 0 ? "font-semibold text-red-700" : "text-slate-500"}`}>{count(row.failed)}</span> },
    { key: "soldSms", header: "Satılan SMS", align: "right", sortKey: "soldSms", render: (row) => <span className="tabular-nums">{count(row.soldSms)}</span> },
    { key: "smsRevenue", header: "SMS satışı", align: "right", sortKey: "smsRevenue", render: (row) => <span className="tabular-nums">{money(row.smsRevenue)}</span> },
    { key: "collected", header: "Tahsil edilen", align: "right", sortKey: "collected", render: (row) => <span className="font-semibold tabular-nums">{money(row.collected)}</span> },
  ];

  const growth = report?.collectedGrowth;
  const stats: StatItem[] = [
    {
      key: "collected",
      label: "Tahsil edilen",
      value: money(report?.collected),
      tone: "success",
      hint: !report ? undefined : growth == null ? "Önceki dönemde tahsilat yok" : `Önceki döneme göre ${growth >= 0 ? "+" : ""}${growth}%`,
    },
    { key: "issued", label: "Kesilen fatura", value: money(report?.issuedAmount), hint: report ? `${count(report.issuedCount)} fatura (iptaller hariç)` : undefined },
    { key: "sold", label: "Satılan SMS", value: count(report?.soldSms), hint: report ? money(report.smsRevenue) : undefined },
    {
      key: "sent",
      label: "Gönderilen SMS",
      value: count(report?.sentSms),
      tone: report && report.failedSms > 0 ? "warning" : "neutral",
      hint: report ? `${count(report.failedSms)} başarısız` : undefined,
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader icon="rapor" title="Raporlar" description={rangeLabel || "Dönem bazında tahsilat ve SMS kullanımı."} />

      <Toolbar
        actions={(
          <Button variant="secondary" icon={Download} disabled={!report || rows.length === 0 || loading} onClick={exportCsv}>
            Dışa aktar (CSV)
          </Button>
        )}
      >
        <DateRangeFilter {...period.filterProps} variant="chips" />
      </Toolbar>

      {loadError && !loading ? (
        <LoadErrorState message={loadError} onRetry={reload} />
      ) : firstLoad && period.error ? null : (
        <div className={`space-y-4 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={loading || undefined}>
          <StatStrip items={stats} columns={4} loading={firstLoad} aria-label="Dönem özeti" />

          <ListTable<ClinicRow>
            title="Klinik bazında"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={firstLoad}
            sort={sort}
            onSortChange={changeSort}
            emptyText="Bu dönemde SMS veya tahsilat hareketi yok"
            emptyIcon={ReportsEmptyIcon}
            emptyIllustrative
            mobileCard={(row) => (
              <div className="space-y-1">
                <Link href={`/superadmin/institutions/${row.id}`} className="font-semibold text-slate-900">{row.name}</Link>
                <p className="text-xs text-slate-600">Gönderilen {count(row.sent)}{row.failed ? ` · başarısız ${count(row.failed)}` : ""} · satılan {count(row.soldSms)}</p>
                <p className="text-xs text-slate-600">SMS satışı {money(row.smsRevenue)} · tahsil edilen {money(row.collected)}</p>
              </div>
            )}
          />

          {report && report.plans.length > 0 && (
            <Section title="Açık kliniklerin planları">
              <DescriptionList
                columns={3}
                items={report.plans.map((item) => ({ key: `${item.plan}-${item.cycle}`, label: planLabel(item.plan, item.cycle), value: `${count(item.count)} klinik` }))}
              />
            </Section>
          )}
        </div>
      )}
    </section>
  );
}
