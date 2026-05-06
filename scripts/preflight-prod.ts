/* eslint-disable no-console */
export {};

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "APP_URL"] as const;
const optionalButRecommended = ["REDIS_URL"] as const;

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

  const missingRecommended = optionalButRecommended.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`Eksik onerilen env: ${missingRecommended.join(", ")}`);
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