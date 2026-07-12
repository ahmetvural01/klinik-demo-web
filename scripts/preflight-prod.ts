/* eslint-disable no-console */
export {};

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

  // ecosystem.config.cjs artık web app'i PM2 cluster modda (birden fazla worker)
  // çalıştırıyor. Redis olmadan her worker'ın gerçek zamanlı (SSE) durumu
  // birbirinden habersiz kalır — sessizce bozuk bildirim davranışına yol
  // açmaması için burada sert bir hata olarak kesiyoruz (bkz. src/lib/realtime-bus.ts).
  if (!process.env.REDIS_URL) {
    console.error(
      "REDIS_URL tanimli degil. ecosystem.config.cjs web app'i cluster modda (2 worker) calistiriyor; " +
      "Redis olmadan worker'lar arasi gerçek zamanli bildirimler tutarsiz calisir. " +
      "REDIS_URL'i tanimlayin veya ecosystem.config.cjs'de instances/exec_mode'u tek worker'a dusurun."
    );
    process.exit(1);
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