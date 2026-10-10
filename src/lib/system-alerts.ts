import { getMetricsSnapshot } from "@/lib/metrics";
import { SLOW_ROUTE_WARNING_MS, SLOW_ROUTE_CRITICAL_MS } from "@/lib/system-alert-thresholds";

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
    .filter((r) => r.maxMs > SLOW_ROUTE_WARNING_MS)
    .sort((a, b) => b.maxMs - a.maxMs);

  if (apiErrors > 100) {
    alerts.push({
      id: "api-errors-high",
      level: "critical",
      title: "API hata sayısı yüksek",
      detail: `Toplam API hatası: ${apiErrors}`,
      at: now,
    });
  }

  if (rateHits > 200) {
    alerts.push({
      id: "rate-limit-high",
      level: "warning",
      title: "Hız sınırı tetikleri yüksek",
      detail: `Toplam tetik: ${rateHits}`,
      at: now,
    });
  }

  for (const r of slowRoutes) {
    alerts.push({
      id: `api-latency-high:${r.route}`,
      level: r.maxMs > SLOW_ROUTE_CRITICAL_MS ? "critical" : "warning",
      title: `API gecikmesi yüksek: ${r.route}`,
      detail: `En uzun süre: ${r.maxMs} ms (ortalama: ${r.avgMs} ms, ${r.count} istek)`,
      at: now,
    });
  }

  if (smsP95 > 10000) {
    alerts.push({
      id: "sms-latency-high",
      level: "warning",
      title: "SMS gönderim süresi yüksek",
      detail: `En uzun SMS gönderim süresi: ${smsP95} ms`,
      at: now,
    });
  }

  if (realtimeConnections > 500 && realtimeEvents < 5) {
    alerts.push({
      id: "realtime-possible-stall",
      level: "critical",
      title: "Anlık güncelleme akışında olası duraklama",
      detail: `Açık bağlantı: ${realtimeConnections}, olay: ${realtimeEvents}`,
      at: now,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "system-ok",
      level: "info",
      title: "Sistem stabil",
      detail: "Belirgin bir risk eşiği aşılmadı.",
      at: now,
    });
  }

  return alerts;
}
