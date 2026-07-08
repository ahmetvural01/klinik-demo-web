"use client";

import { useEffect, useState } from "react";

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
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [mRes, aRes] = await Promise.all([
          fetch("/api/system/metrics"),
          fetch("/api/system/alerts"),
        ]);

        if (!mRes.ok || !aRes.ok) {
          throw new Error("Sistem izleme verisi alınamadı.");
        }

        const [mData, aData] = await Promise.all([mRes.json(), aRes.json()]);
        if (!active) return;
        setMetrics(mData);
        setAlerts(aData);
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
        <h2 className="text-sm font-bold text-slate-900">Timer Metrikleri</h2>
        <div className="mt-2 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Timer</th>
                <th className="px-2 py-2">Count</th>
                <th className="px-2 py-2">Avg (ms)</th>
                <th className="px-2 py-2">Min (ms)</th>
                <th className="px-2 py-2">Max (ms)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics?.timers || {}).map(([name, t]) => (
                <tr key={name} className="border-b border-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-700">{name}</td>
                  <td className="px-2 py-2 text-slate-600">{t.count}</td>
                  <td className="px-2 py-2 text-slate-600">{t.avgMs}</td>
                  <td className="px-2 py-2 text-slate-600">{t.minMs}</td>
                  <td className="px-2 py-2 text-slate-600">{t.maxMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
