type CounterName =
  | "api_requests_total"
  | "api_errors_total"
  | "auth_failures_total"
  | "rate_limit_hits_total"
  | "realtime_connections_open"
  | "realtime_events_total"
  | "sms_jobs_total";

// api_request_ms:<route-adi> bicimindeki dinamik anahtarlar da kabul edilir —
// bkz. withApiTiming (src/lib/api.ts). (string & {}) hilesi literal öneri
// desteğini korurken herhangi bir string'e izin verir.
type TimerName = "api_request_ms" | "sms_dispatch_ms" | (string & {});

type TimerStat = { count: number; totalMs: number; minMs: number; maxMs: number };

const counters = new Map<CounterName, number>();
const timers = new Map<TimerName, TimerStat>();

function getCounter(name: CounterName) {
  return counters.get(name) || 0;
}

export function metricIncrement(name: CounterName, by = 1) {
  counters.set(name, getCounter(name) + by);
}

export function metricDecrement(name: CounterName, by = 1) {
  counters.set(name, Math.max(0, getCounter(name) - by));
}

export function metricObserve(name: TimerName, ms: number) {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const current = timers.get(name);
  if (!current) {
    timers.set(name, { count: 1, totalMs: safe, minMs: safe, maxMs: safe });
    return;
  }
  current.count += 1;
  current.totalMs += safe;
  current.minMs = Math.min(current.minMs, safe);
  current.maxMs = Math.max(current.maxMs, safe);
  timers.set(name, current);
}

export function getMetricsSnapshot() {
  const timerSnapshot: Record<string, { count: number; avgMs: number; minMs: number; maxMs: number }> = {};
  timers.forEach((value, key) => {
    timerSnapshot[key] = {
      count: value.count,
      avgMs: value.count > 0 ? Number((value.totalMs / value.count).toFixed(2)) : 0,
      minMs: Number(value.minMs.toFixed(2)),
      maxMs: Number(value.maxMs.toFixed(2)),
    };
  });

  return {
    counters: {
      api_requests_total: getCounter("api_requests_total"),
      api_errors_total: getCounter("api_errors_total"),
      auth_failures_total: getCounter("auth_failures_total"),
      rate_limit_hits_total: getCounter("rate_limit_hits_total"),
      realtime_connections_open: getCounter("realtime_connections_open"),
      realtime_events_total: getCounter("realtime_events_total"),
      sms_jobs_total: getCounter("sms_jobs_total"),
    },
    timers: timerSnapshot,
    generatedAt: new Date().toISOString(),
  };
}
