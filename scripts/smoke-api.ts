/* eslint-disable no-console */
export {};

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3001";

async function check(url: string) {
  const start = Date.now();
  const res = await fetch(url);
  return {
    url,
    ok: res.ok,
    status: res.status,
    ms: Date.now() - start,
  };
}

async function main() {
  const targets = [
    `${BASE_URL}/api/system/health`,
  ];

  const results = await Promise.all(targets.map((t) => check(t)));
  const failed = results.filter((r) => !r.ok);

  console.log("SMOKE API RESULTS");
  console.log(JSON.stringify(results, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
