"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import type { ConsistencyIssue, ConsistencyPayload } from "@/lib/data-consistency";
import { SLOW_ROUTE_CRITICAL_MS, SLOW_ROUTE_WARNING_MS } from "@/lib/system-alert-thresholds";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import PanelLoading from "@/components/ui/PanelLoading";

type MetricsResponse = {
  counters: Record<string, number>;
  timers: Record<string, { count: number; avgMs: number; minMs: number; maxMs: number }>;
};

type SystemAlert = { id: string; level: "info" | "warning" | "critical"; title: string; detail: string };
type TimerRow = { route: string; count: number; avgMs: number; maxMs: number };

const SEVERITY: Record<ConsistencyIssue["severity"], { tone: BadgeTone; label: string }> = {
  critical: { tone: "critical", label: "Önemli" },
  warning: { tone: "warning", label: "Kontrol edin" },
  info: { tone: "neutral", label: "Bilgi" },
};

const COUNTER_LABELS: Array<[string, string]> = [
  ["api_requests_total", "Sunucu isteği"],
  ["api_errors_total", "Sunucu hatası"],
  ["rate_limit_hits_total", "Sık tekrar engeli"],
  ["realtime_connections_open", "Açık canlı bağlantı"],
];

// lib/system-alerts başlıkları Türkçe karakter içermiyor ve teknik; klinik
// ekranında anlaşılır karşılıkları gösterilir.
function alertTitle(alert: SystemAlert) {
  if (alert.id === "system-ok") return "Sunucuda belirgin bir sorun yok";
  if (alert.id === "api-errors-high") return "Sunucu hataları artmış";
  if (alert.id === "rate-limit-high") return "Çok sık tekrarlanan istekler var";
  if (alert.id === "sms-latency-high") return "SMS gönderimi yavaş";
  if (alert.id === "realtime-possible-stall") return "Canlı güncellemeler durmuş olabilir";
  if (alert.id.startsWith("api-latency-high:")) return `Yavaş yanıt: ${alert.id.slice("api-latency-high:".length)}`;
  return alert.title;
}

const ALERT_TONE: Record<SystemAlert["level"], BadgeTone> = { critical: "critical", warning: "warning", info: "success" };

function TechnicalDetails() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [metricsResponse, alertsResponse] = await Promise.all([fetch("/api/system/metrics"), fetch("/api/system/alerts")]);
      if (!metricsResponse.ok || !alertsResponse.ok) throw new Error();
      const [metricsData, alertsData] = await Promise.all([metricsResponse.json(), alertsResponse.json()]);
      setMetrics(metricsData);
      setAlerts(Array.isArray(alertsData?.alerts) ? alertsData.alerts : []);
      setError(null);
    } catch {
      setError("Teknik ölçümler alınamadı.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Yalnız bu bölüm açıkken ve sekme görünürken 15 sn'de bir yenilenir.
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error) return <LoadErrorState message={error} onRetry={() => void load()} compact />;
  if (!metrics) return <PanelLoading />;

  const rows: TimerRow[] = Object.entries(metrics.timers || {})
    .filter(([name]) => name.startsWith("api_request_ms:"))
    .map(([name, timer]) => ({ route: name.slice("api_request_ms:".length), count: timer.count, avgMs: timer.avgMs, maxMs: timer.maxMs }))
    .sort((a, b) => b.maxMs - a.maxMs);

  const columns: ListTableColumn<TimerRow>[] = [
    { key: "route", header: "Adres", render: (row) => <span className="font-mono text-xs text-slate-700">{row.route}</span> },
    { key: "count", header: "İstek", align: "right", render: (row) => <span className="tabular-nums">{row.count}</span> },
    { key: "avg", header: "Ortalama (ms)", align: "right", render: (row) => <span className="tabular-nums">{row.avgMs}</span> },
    {
      key: "max",
      header: "En uzun (ms)",
      align: "right",
      // Alarm listesiyle aynı eşik (lib/system-alert-thresholds, maxMs).
      render: (row) => (
        <span className={`font-semibold tabular-nums ${row.maxMs > SLOW_ROUTE_CRITICAL_MS ? "text-red-700" : row.maxMs > SLOW_ROUTE_WARNING_MS ? "text-amber-700" : "text-slate-700"}`}>{row.maxMs}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Bu sayılar sunucunun geneline aittir, yalnız kliniğinizi göstermez. Sunucu yeniden başlayınca sıfırlanır.</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COUNTER_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{metrics.counters?.[key] ?? 0}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={ALERT_TONE[alert.level]}>{alert.level === "info" ? "Normal" : alert.level === "warning" ? "Uyarı" : "Önemli"}</Badge>
            <span className="font-medium text-slate-800">{alertTitle(alert)}</span>
          </li>
        ))}
      </ul>
      <ListTable columns={columns} rows={rows} rowKey={(row) => row.route} emptyText="Henüz ölçüm yok" />
    </div>
  );
}

export default function SistemIzlemePage() {
  const [consistency, setConsistency] = useState<ConsistencyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/system/consistency", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.message || "Kayıt kontrolü yapılamadı.");
      setConsistency(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kayıt kontrolü yapılamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const issues = consistency?.issues || [];
  const recordCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  const checkedAt = consistency?.generatedAt
    ? new Date(consistency.generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="space-y-4">
      <PageHeader
        icon="chart"
        title="Sistem Durumu"
        description="Kayıtlarda düzeltilmesi gereken bir şey var mı? Sorunlu kayda buradan gidebilirsiniz."
        actions={<Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => void load()}>Yeniden kontrol et</Button>}
      />

      {loading && !consistency ? (
        <PanelLoading />
      ) : error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : issues.length === 0 ? (
        <div className="ui-surface">
          <EmptyState
            icon={CheckCircle2}
            accent="emerald"
            title="Düzeltilmesi gereken kayıt yok"
            description={checkedAt ? `Son kontrol ${checkedAt}. Tahsilat, muhasebe, stok ve firma kayıtları birbiriyle uyumlu.` : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">Düzeltilmesi gereken {recordCount.toLocaleString("tr-TR")} kayıt</h2>
            {checkedAt && <p className="text-xs text-slate-500">Son kontrol {checkedAt}</p>}
          </div>
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id} className="ui-surface space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY[issue.severity].tone}>{SEVERITY[issue.severity].label}</Badge>
                  <span className="text-xs font-semibold text-slate-500">{issue.area}</span>
                  <span className="ml-auto text-xs font-bold tabular-nums text-slate-600">{issue.count.toLocaleString("tr-TR")} kayıt</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                <p className="text-sm text-slate-600">{issue.detail}</p>
                {issue.action && <p className="text-sm text-slate-700"><b>Ne yapmalı:</b> {issue.action}</p>}
                {issue.records && issue.records.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {issue.records.map((record, index) => (
                      <Link
                        key={`${issue.id}-${index}`}
                        href={record.href}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary hover:border-primary/40"
                      >
                        {record.label}
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ))}
                    {issue.count > issue.records.length && (
                      <span className="text-xs text-slate-500">ve {issue.count - issue.records.length} kayıt daha</span>
                    )}
                  </div>
                ) : issue.href ? (
                  <Button variant="secondary" size="sm" href={issue.href} icon={ArrowRight} iconPosition="right">İlgili sayfaya git</Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="ui-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Teknik ölçümler</h2>
            <p className="text-xs text-slate-500">Program yavaşladığında destek ekibi sizden bu bilgileri isteyebilir.</p>
          </div>
          <Button variant="ghost" size="sm" aria-expanded={showTechnical} onClick={() => setShowTechnical((value) => !value)}>
            {showTechnical ? "Gizle" : "Göster"}
          </Button>
        </div>
        {showTechnical && <div className="mt-4"><TechnicalDetails /></div>}
      </section>
    </section>
  );
}
