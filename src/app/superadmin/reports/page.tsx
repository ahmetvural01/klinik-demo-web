"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { StatsCard } from "@/components/ui/Premium";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { planLabel } from "@/components/superadmin/sa-labels";
import { count, money, shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

const ReportsEmptyIcon = createModuleEmptyIcon("rapor");

type ClinicRow = { id: string; name: string; sent: number; failed: number; soldSms: number; smsRevenue: number; collected: number };
type ReportData = {
  period: string;
  range: { start: string; end: string };
  collected: number;
  collectedGrowth: number | null;
  issuedAmount: number;
  issuedCount: number;
  openAmount: number;
  overdueAmount: number;
  soldSms: number;
  smsRevenue: number;
  sentSms: number;
  failedSms: number;
  activeClinicCount: number;
  plans: { plan: string; cycle: string; count: number }[];
  clinics: ClinicRow[];
};

const PERIOD_KEYS = ["bu-ay", "gecen-ay", "son-12-ay"] as const;
const PERIOD_LABELS: Record<(typeof PERIOD_KEYS)[number], string> = { "bu-ay": "Bu ay", "gecen-ay": "Geçen ay", "son-12-ay": "Son 12 ay" };

function csvCell(value: string | number) {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Raporlar — seçilen dönemde para (tahsilat, kesilen fatura) ve SMS (satılan,
 * gönderilen, başarısız). Anlık iş listesi Kontrol Paneli'nde; burada dönem
 * karşılaştırması ve klinik bazında döküm, Excel'e (CSV) alınabilir.
 */
export default function ReportsPage() {
  const [period, setPeriod] = useTabParam(PERIOD_KEYS, "bu-ay", "donem");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<ReportData>(`/api/superadmin/reports?donem=${period}`, "Raporlar yüklenemedi.", controller.signal)
      .then(setData)
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Raporlar yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, reloadKey]);

  const exportCsv = () => {
    if (!data) return;
    const header = ["Klinik", "Gönderilen SMS", "Başarısız SMS", "Satılan SMS", "SMS satış tutarı (TL)", "Tahsil edilen fatura (TL)"];
    const lines = data.clinics.map((row) => [row.name, row.sent, row.failed, row.soldSms, row.smsRevenue.toFixed(2).replace(".", ","), row.collected.toFixed(2).replace(".", ",")]);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-raporu-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: ListTableColumn<ClinicRow>[] = [
    { key: "name", header: "Klinik", render: (row) => <Link href={`/superadmin/institutions/${row.id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{row.name}</Link> },
    { key: "sent", header: "Gönderilen SMS", align: "right", render: (row) => <span className="tabular-nums">{count(row.sent)}</span> },
    { key: "failed", header: "Başarısız", align: "right", render: (row) => <span className={`tabular-nums ${row.failed > 0 ? "font-semibold text-red-700" : "text-slate-500"}`}>{count(row.failed)}</span> },
    { key: "soldSms", header: "Satılan SMS", align: "right", render: (row) => <span className="tabular-nums">{count(row.soldSms)}</span> },
    { key: "smsRevenue", header: "SMS satışı", align: "right", render: (row) => <span className="tabular-nums">{money(row.smsRevenue)}</span> },
    { key: "collected", header: "Tahsil edilen", align: "right", render: (row) => <span className="font-semibold tabular-nums">{money(row.collected)}</span> },
  ];

  const growth = data?.collectedGrowth;

  return (
    <section className="space-y-4">
      <PageHeader
        icon="rapor"
        title="Raporlar"
        description={data ? `${shortDate(data.range.start)} – ${shortDate(data.range.end)} dönemi` : "Dönem bazında tahsilat ve SMS kullanımı."}
        actions={<Button variant="secondary" icon={Download} disabled={!data || data.clinics.length === 0} onClick={exportCsv}>Excel&apos;e aktar</Button>}
      />

      <Tabs ariaLabel="Rapor dönemi" size="sm" value={period} onChange={setPeriod} items={PERIOD_KEYS.map((key) => ({ key, label: PERIOD_LABELS[key] }))} />

      {loadError && !data ? (
        <LoadErrorState message={loadError} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatsCard label="Tahsil edilen" value={data ? money(data.collected) : "—"} tone="success" description={growth == null ? "Önceki dönemle karşılaştırma yok" : `Önceki döneme göre ${growth >= 0 ? "+" : ""}${growth}%`} href="/superadmin/invoices?status=PAID" />
            <StatsCard label="Kesilen fatura" value={data ? money(data.issuedAmount) : "—"} description={data ? `${count(data.issuedCount)} fatura (iptaller hariç)` : undefined} />
            <StatsCard label="Açık alacak (bugün)" value={data ? money(data.openAmount) : "—"} tone={data && data.overdueAmount > 0 ? "critical" : "neutral"} description={data ? `${money(data.overdueAmount)} gecikmiş` : undefined} href="/superadmin/invoices" />
            <StatsCard label="Satılan SMS" value={data ? count(data.soldSms) : "—"} description={data ? money(data.smsRevenue) : undefined} />
            <StatsCard label="Gönderilen SMS" value={data ? count(data.sentSms) : "—"} tone={data && data.failedSms > 0 ? "warning" : "neutral"} description={data ? `${count(data.failedSms)} başarısız` : undefined} />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-900">Klinik bazında</h2>
            <ListTable<ClinicRow>
              columns={columns}
              rows={data?.clinics ?? []}
              rowKey={(row) => row.id}
              loading={loading}
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
          </div>

          {data && data.plans.length > 0 && (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Açık kliniklerin planları:</span>{" "}
              {data.plans.map((item) => `${planLabel(item.plan, item.cycle)} ${item.count}`).join(" · ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
