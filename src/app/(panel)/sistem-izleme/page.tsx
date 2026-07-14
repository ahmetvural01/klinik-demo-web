"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConsistencyPayload } from "@/lib/data-consistency";
import { CONSISTENCY_SEVERITY_STYLE } from "@/lib/consistency-ui";
import { SLOW_ROUTE_WARNING_MS, SLOW_ROUTE_CRITICAL_MS } from "@/lib/system-alert-thresholds";
import { Badge } from "@/components/ui/Badge";

type MetricsResponse = {
  counters: Record<string, number>;
  timers: Record<string, { count: number; avgMs: number; minMs: number; maxMs: number }>;
  generatedAt: string;
};

type AlertsResponse = {
  alerts: Array<{ id: string; level: "info" | "warning" | "critical"; title: string; detail: string; at: string }>;
  generatedAt: string;
};


export default function SistemIzlemePage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyPayload | null>(null);
  const [consistencyError, setConsistencyError] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [mRes, aRes, cRes] = await Promise.all([
          fetch("/api/system/metrics"),
          fetch("/api/system/alerts"),
          fetch("/api/system/consistency"),
        ]);

        if (!mRes.ok || !aRes.ok) {
          throw new Error("Sistem izleme verisi alınamadı.");
        }

        const [mData, aData, cData] = await Promise.all([mRes.json(), aRes.json(), cRes.ok ? cRes.json() : Promise.resolve(null)]);
        if (!active) return;
        setMetrics(mData);
        setAlerts(aData);
        setConsistency(cData);
        setConsistencyError(!cRes.ok);
        setError("");
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Sistem izleme verisi alınamadı.");
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const sortedTimers = Object.entries(metrics?.timers || {}).sort(([, a], [, b]) => b.avgMs - a.avgMs);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Sistem İzleme</h1>
        <p className="text-sm text-slate-500">Canlı metrikler, alarm durumları ve operasyonel sağlık görünümü.</p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["API Requests", metrics?.counters?.api_requests_total ?? 0],
          ["API Errors", metrics?.counters?.api_errors_total ?? 0],
          ["Rate Limit Hits", metrics?.counters?.rate_limit_hits_total ?? 0],
          ["Realtime Open", metrics?.counters?.realtime_connections_open ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Alarm Durumları</h2>
        <div className="mt-2 space-y-2">
          {(alerts?.alerts || []).map((alert) => (
            <div key={alert.id} className={"rounded-lg border px-3 py-2 text-sm " + (alert.level === "critical" ? "border-rose-300 bg-rose-50 text-rose-700" : alert.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700")}>
              <p className="font-semibold">{alert.title}</p>
              <p className="text-xs">{alert.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">API Gecikme Metrikleri (yavaştan hızlıya)</h2>
          <span className="text-xs text-slate-400">"Sayfa yavaş" şikayetinde önce buraya bakın.</span>
        </div>
        <div className="mt-2 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Endpoint</th>
                <th className="px-2 py-2">Count</th>
                <th className="px-2 py-2">Ort. (ms)</th>
                <th className="px-2 py-2">Min (ms)</th>
                <th className="px-2 py-2">Maks (ms)</th>
              </tr>
            </thead>
            <tbody>
              {sortedTimers.map(([name, t]) => {
                // Alarm Durumları listesiyle aynı eşik/metrik kullanılır (maxMs,
                // src/lib/system-alert-thresholds.ts) — aksi halde bu tabloda
                // "yavaş" görünen bir endpoint yukarıdaki alarmda hiç çıkmayabilir.
                const critical = t.maxMs > SLOW_ROUTE_CRITICAL_MS;
                const warn = !critical && t.maxMs > SLOW_ROUTE_WARNING_MS;
                return (
                  <tr key={name} className={"border-b border-slate-50" + (critical ? " bg-rose-50" : warn ? " bg-amber-50" : "")}>
                    <td className="px-2 py-2 font-medium text-slate-700">{name.replace(/^api_request_ms:/, "")}</td>
                    <td className="px-2 py-2 text-slate-600">{t.count}</td>
                    <td className="px-2 py-2 text-slate-600">{t.avgMs}</td>
                    <td className="px-2 py-2 text-slate-600">{t.minMs}</td>
                    <td className={"px-2 py-2 font-bold " + (critical ? "text-rose-700" : warn ? "text-amber-700" : "text-slate-600")}>{t.maxMs}</td>
                  </tr>
                );
              })}
              {sortedTimers.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-slate-400">Henüz ölçüm yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Klinik Veri Tutarlılığı</h2>
          {consistency && (
            <Badge
              tone={consistency.summary.critical > 0 ? "critical" : consistency.summary.warning > 0 ? "warning" : "success"}
              size="md"
            >
              Skor: {consistency.summary.score}/100
            </Badge>
          )}
        </div>
        <div className="mt-2 space-y-2">
          {consistency && consistency.issues.length > 0 ? (
            consistency.issues.map((issue) => (
              <div key={issue.id} className={"rounded-lg border px-3 py-2 text-sm " + CONSISTENCY_SEVERITY_STYLE[issue.severity].badge}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{issue.area} — {issue.title}</p>
                  <span className="text-xs font-bold">{issue.count} kayıt</span>
                </div>
                <p className="text-xs">{issue.detail}</p>
                {issue.href && (
                  <Link href={issue.href} className="mt-1 inline-block text-xs font-bold underline underline-offset-2">
                    İncele →
                  </Link>
                )}
              </div>
            ))
          ) : consistencyError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Veri tutarlılığı bilgisi yüklenemedi (yetki veya sunucu hatası olabilir).
            </p>
          ) : consistency ? (
            <p className="px-1 py-3 text-sm text-slate-400">Kritik veri bağlantısı sorunu bulunamadı.</p>
          ) : (
            <p className="px-1 py-3 text-sm text-slate-400">Veri tutarlılığı bilgisi yükleniyor…</p>
          )}
        </div>
      </div>
    </section>
  );
}
