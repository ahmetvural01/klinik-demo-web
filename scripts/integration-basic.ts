/* eslint-disable no-console */
export {};

const BASE_URL = process.env.INTEGRATION_BASE_URL || "http://localhost:3001";

async function main() {
  const health = await fetch(`${BASE_URL}/api/system/health`);
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.status}`);
  }

  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      institution: process.env.INTEGRATION_INSTITUTION || "whitedental",
      identityNo: process.env.INTEGRATION_IDENTITY || "11509380760",
      password: process.env.INTEGRATION_PASSWORD || "10711453",
    }),
  });

  if (!login.ok) {
    throw new Error(`Login failed: ${login.status}`);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) {
    throw new Error("Integration login cookie missing");
  }

  const metrics = await fetch(`${BASE_URL}/api/system/metrics`, {
    headers: { Cookie: cookie },
  });

  if (!metrics.ok) {
    throw new Error(`Metrics check failed: ${metrics.status}`);
  }

  const alerts = await fetch(`${BASE_URL}/api/system/alerts`, {
    headers: { Cookie: cookie },
  });

  if (!alerts.ok) {
    throw new Error(`Alerts check failed: ${alerts.status}`);
  }

  console.log("Integration checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
