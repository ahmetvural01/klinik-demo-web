/* eslint-disable no-console */
import { loadEnvConfig } from "@next/env";

export {};

loadEnvConfig(process.cwd());

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "APP_URL", "FIELD_ENCRYPTION_KEY"] as const;

async function check(url: string) {
  const start = Date.now();
  const res = await fetch(url);
  return { url, ok: res.ok, status: res.status, ms: Date.now() - start };
}

async function checkWithFallback(url: string) {
  try {
    return await check(url);
  } catch {
    const alt = url.replace("localhost", "127.0.0.1");
    if (alt === url) throw new Error(`Preflight erisimi basarisiz: ${url}`);
    return check(alt);
  }
}

async function main() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Eksik zorunlu env: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Render tek web süreciyle `start:render` çalıştırır; bu durumda süreç içi
  // event bus yeterlidir. PM2/başka bir altyapıda birden fazla web worker
  // açılırsa SSE olaylarını paylaşmak için Redis zorunlu olur.
  const webConcurrency = Math.max(1, Number(process.env.WEB_CONCURRENCY || "1"));
  const sharedRealtimeRequired =
    webConcurrency > 1 || process.env.REQUIRE_SHARED_REALTIME === "true";
  if (sharedRealtimeRequired && !process.env.REDIS_URL) {
    console.error(
      `REDIS_URL tanimli degil. WEB_CONCURRENCY=${webConcurrency}; ` +
      "birden fazla web worker arasinda gerçek zamanli bildirimleri paylaşmak için Redis zorunludur."
    );
    process.exit(1);
  }
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL tanimli degil; tek web worker için süreç içi gerçek zamanli bildirim kullaniliyor.");
  }

  const baseUrl = process.env.PREFLIGHT_BASE_URL || process.env.APP_URL || "http://localhost:3000";
  const health = await checkWithFallback(`${baseUrl}/api/system/health`);
  console.log("PREFLIGHT RESULTS");
  console.log(JSON.stringify({ health }, null, 2));

  if (!health.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
