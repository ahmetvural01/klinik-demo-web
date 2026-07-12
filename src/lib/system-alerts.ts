import { getMetricsSnapshot } from "@/lib/metrics";

export type SystemAlert = {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
  at: string;
};

export function evaluateSystemAlerts() {
  const m = getMetricsSnapshot();
  const alerts: SystemAlert[] = [];
  const now = new Date().toISOString();

  const apiErrors = m.counters.api_errors_total;
  const rateHits = m.counters.rate_limit_hits_total;
  const realtimeConnections = m.counters.realtime_connections_open;
  const realtimeEvents = m.counters.realtime_events_total;

  const smsP95 = m.timers.sms_dispatch_ms?.maxMs || 0;

  // Rota bazlı zamanlayıcılar: withApiTiming() ile sarılan her endpoint kendi
  // "api_request_ms:<route>" anahtarında ölçülür — böylece hangi spesifik
  // route'un yavaşladığı görülebilir, tek bir genel ortalamada kaybolmaz.
  const slowRoutes = Object.entries(m.timers)
    .filter(([key]) => key.startsWith("api_request_ms:"))
    .map(([key, stat]) => ({ route: key.slice("api_request_ms:".length), ...stat }))
    .filter((r) => r.maxMs > 1500)
    .sort((a, b) => b.maxMs - a.maxMs);

  if (apiErrors > 100) {
    alerts.push({
      id: "api-errors-high",
      level: "critical",
      title: "API hata sayisi yuksek",
      detail: `Toplam API hatasi: ${apiErrors}`,
      at: now,
    });
  }

  if (rateHits > 200) {
    alerts.push({
      id: "rate-limit-high",
      level: "warning",
      title: "Rate-limit tetikleri yuksek",
      detail: `Toplam tetik: ${rateHits}`,
      at: now,
    });
  }

  for (const r of slowRoutes) {
    alerts.push({
      id: `api-latency-high:${r.route}`,
      level: r.maxMs > 5000 ? "critical" : "warning",
      title: `API gecikmesi yuksek: ${r.route}`,
      detail: `Maks sure: ${r.maxMs} ms (ort: ${r.avgMs} ms, ${r.count} istek)`,
      at: now,
    });
  }

  if (smsP95 > 10000) {
    alerts.push({
      id: "sms-latency-high",
      level: "warning",
      title: "SMS dispatch suresi yuksek",
      detail: `Maks SMS sure: ${smsP95} ms`,
      at: now,
    });
  }

  if (realtimeConnections > 500 && realtimeEvents < 5) {
    alerts.push({
      id: "realtime-possible-stall",
      level: "critical",
      title: "Realtime akista olasi duraklama",
      detail: `Acik baglanti: ${realtimeConnections}, event: ${realtimeEvents}`,
      at: now,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "system-ok",
      level: "info",
      title: "Sistem stabil",
      detail: "Belirgin risk esigi asilmadi.",
      at: now,
    });
  }

  return alerts;
}
