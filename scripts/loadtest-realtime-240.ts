/* eslint-disable no-console */
import { performance } from "node:perf_hooks";

type ConnMetric = {
  id: number;
  connected: boolean;
  connectMs: number;
  firstEventMs: number;
  events: number;
  errors: number;
};

const BASE_URL = process.env.LOADTEST_BASE_URL || "http://localhost:3001";
const USERS = Number(process.env.LOADTEST_USERS || "240");
const DURATION_SEC = Number(process.env.LOADTEST_DURATION_SEC || "45");
const LOGIN_BODY = {
  institution: process.env.LOADTEST_INSTITUTION || "whitedental",
  identityNo: process.env.LOADTEST_IDENTITY || "11509380760",
  password: process.env.LOADTEST_PASSWORD || "10711453",
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function loginAndGetCookie() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN_BODY),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("Login succeeded but auth cookie could not be extracted.");
  return cookie;
}

async function connectSse(id: number, cookie: string, stopAt: number): Promise<ConnMetric> {
  const metric: ConnMetric = {
    id,
    connected: false,
    connectMs: 0,
    firstEventMs: 0,
    events: 0,
    errors: 0,
  };

  const start = performance.now();
  const controller = new AbortController();
  const timeout = Math.max(1000, stopAt - Date.now());
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE_URL}/api/realtime/stream`, {
      method: "GET",
      headers: { Cookie: cookie, Accept: "text/event-stream" },
      signal: controller.signal,
    });

    metric.connected = res.ok;
    metric.connectMs = performance.now() - start;

    if (!res.ok || !res.body) {
      metric.errors += 1;
      return metric;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (Date.now() < stopAt) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!raw.includes("event: change")) continue;
        metric.events += 1;
        if (metric.firstEventMs === 0) {
          metric.firstEventMs = performance.now() - start;
        }
      }
    }

    try {
      await reader.cancel();
    } catch {}
  } catch (err) {
    const isExpectedAbort = err instanceof Error && err.name === "AbortError" && Date.now() >= stopAt;
    if (!isExpectedAbort) {
      metric.errors += 1;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return metric;
}

async function pulseWrites(stopAt: number) {
  while (Date.now() < stopAt) {
    try {
      await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(LOGIN_BODY),
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function main() {
  console.log("Realtime load test basliyor...");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Users: ${USERS}, Duration: ${DURATION_SEC}s`);

  const cookie = await loginAndGetCookie();
  const stopAt = Date.now() + DURATION_SEC * 1000;

  const writer = pulseWrites(stopAt);
  const workers = Array.from({ length: USERS }, (_, i) => connectSse(i + 1, cookie, stopAt));
  const metrics = await Promise.all(workers);
  await writer;

  const connected = metrics.filter((m) => m.connected).length;
  const totalErrors = metrics.reduce((s, m) => s + m.errors, 0);
  const totalEvents = metrics.reduce((s, m) => s + m.events, 0);
  const connectTimes = metrics.map((m) => m.connectMs).filter((v) => v > 0);
  const firstEventTimes = metrics.map((m) => m.firstEventMs).filter((v) => v > 0);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    users: USERS,
    durationSec: DURATION_SEC,
    connections: {
      connected,
      failed: USERS - connected,
      connectMsP50: Number(percentile(connectTimes, 50).toFixed(2)),
      connectMsP95: Number(percentile(connectTimes, 95).toFixed(2)),
    },
    events: {
      totalEvents,
      firstEventMsP50: Number(percentile(firstEventTimes, 50).toFixed(2)),
      firstEventMsP95: Number(percentile(firstEventTimes, 95).toFixed(2)),
      streamsWithNoEvent: USERS - firstEventTimes.length,
    },
    errors: {
      totalErrors,
    },
  };

  console.log("\n=== LOAD TEST REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
