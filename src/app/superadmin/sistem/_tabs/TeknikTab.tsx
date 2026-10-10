"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

type TimerStat = { count: number; avgMs: number; minMs: number; maxMs: number };
type MetricsSnapshot = {
  counters: Record<string, number>;
  timers: Record<string, TimerStat>;
  generatedAt: string;
};
type SystemAlert = { id: string; level: "info" | "warning" | "critical"; title: string; detail: string; at: string };
type RouteRow = TimerStat & { route: string };

const ALERT_LEVEL: Record<SystemAlert["level"], { label: string; tone: BadgeTone }> = {
  critical: { label: "Acil", tone: "critical" },
  warning: { label: "Bakılmalı", tone: "warning" },
  info: { label: "Bilgi", tone: "neutral" },
};

// Sayaç adları sunucudaki (lib/metrics) anahtarlardır; ekranda sade adla gösterilir.
const COUNTERS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "api_requests_total", label: "API isteği" },
  { key: "api_errors_total", label: "API hatası" },
  { key: "auth_failures_total", label: "Oturum hatası" },
  { key: "rate_limit_hits_total", label: "Hız sınırına takılan" },
  { key: "realtime_connections_open", label: "Açık canlı bağlantı" },
  { key: "sms_jobs_total", label: "SMS işi" },
];

const SLOW_ROUTE_LIMIT = 15;
const number = (value: number) => value.toLocaleString("tr-TR");
const ms = (value: number) => `${Math.round(value).toLocaleString("tr-TR")} ms`;

/**
 * Sistem Ayarları › Teknik ölçümler: sunucu sayaçları, en yavaş API uçları ve
 * alarmlar. Bu ölçümler bütün kliniklerin isteklerini kapsar (platform geneli);
 * önceden klinik yöneticisinin İşlem kayıtları ekranından da okunabiliyordu,
 * artık yalnız burada. Sayaçlar sunucu süreci yeniden başlayınca sıfırlanır.
 */
export default function TeknikTab() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // Süperadmin ucu: açık bir gizli klinik girişi varken de süperadmin
    // oturumuyla okunur (/api/system/* o durumda klinik kimliğiyle 403 dönüyordu).
    saGet<{ metrics?: MetricsSnapshot; alerts?: SystemAlert[] }>("/api/superadmin/system-settings/metrics", "Teknik ölçümler yüklenemedi.", controller.signal)
      .then((data) => {
        setMetrics(data?.metrics ?? null);
        setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
      })
      .catch((loadError) => {
        if (!isAbort(loadError)) setError(errorMessage(loadError, "Teknik ölçümler yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const stats = useMemo<StatItem[]>(() => COUNTERS.map((counter) => {
    const value = metrics?.counters?.[counter.key] ?? 0;
    return {
      key: counter.key,
      label: counter.label,
      value: number(value),
      tone: counter.key === "api_errors_total" && value > 0 ? "warning" : "neutral",
    };
  }), [metrics]);

  const slowRoutes = useMemo<RouteRow[]>(() => Object.entries(metrics?.timers || {})
    .filter(([key]) => key.startsWith("api_request_ms:"))
    .map(([key, stat]) => ({ route: key.slice("api_request_ms:".length), ...stat }))
    .sort((a, b) => b.maxMs - a.maxMs)
    .slice(0, SLOW_ROUTE_LIMIT), [metrics]);

  const columns: ListTableColumn<RouteRow>[] = [
    { key: "route", header: "Uç", render: (row) => <span className="font-mono text-xs text-slate-800">{row.route}</span> },
    { key: "count", header: "İstek", align: "right", render: (row) => <span className="tabular-nums">{number(row.count)}</span> },
    { key: "avg", header: "Ortalama", align: "right", render: (row) => <span className="tabular-nums">{ms(row.avgMs)}</span> },
    { key: "max", header: "En uzun", align: "right", render: (row) => <span className="tabular-nums font-semibold text-slate-900">{ms(row.maxMs)}</span> },
  ];

  if (loading && !metrics) return <PageSkeleton header={false} stats={3} body="table" rows={6} label="Teknik ölçümler yükleniyor" />;
  if (error && !metrics) return <LoadErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Bütün kliniklerin istekleri · {metrics?.generatedAt ? `${dateTime(metrics.generatedAt) ?? "—"} itibarıyla` : "—"} · sunucu yeniden başlayınca sıfırlanır
        </p>
        <Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={reload}>Yenile</Button>
      </div>

      {error && <Callout tone="warning" compact>{error} Son okunan değerler gösteriliyor.</Callout>}

      <Section title="Alarmlar" badge={alerts.length > 0 ? <Badge tone="warning">{alerts.length}</Badge> : undefined}>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-600">Şu an alarm yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                <Badge tone={ALERT_LEVEL[alert.level]?.tone ?? "neutral"}>{ALERT_LEVEL[alert.level]?.label ?? alert.level}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-900">{alert.title}</p>
                  <p className="mt-0.5 break-words text-xs text-slate-500">{alert.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <StatStrip items={stats} columns={3} aria-label="Sunucu sayaçları" />

      <ListTable
        title="En yavaş uçlar"
        subtitle={`En uzun süren ilk ${SLOW_ROUTE_LIMIT} uç`}
        columns={columns}
        rows={slowRoutes}
        rowKey={(row) => row.route}
        emptyText="Henüz ölçülmüş istek yok"
        mobileCard={(row) => (
          <div className="min-w-0">
            <p className="break-all font-mono text-xs text-slate-800">{row.route}</p>
            <p className="mt-1 text-xs tabular-nums text-slate-500">
              {number(row.count)} istek · ort. {ms(row.avgMs)} · en uzun <span className="font-semibold text-slate-900">{ms(row.maxMs)}</span>
            </p>
          </div>
        )}
      />
    </div>
  );
}
