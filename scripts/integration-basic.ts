/* eslint-disable no-console */
export {};

const BASE_URL = process.env.INTEGRATION_BASE_URL || "http://localhost:3001";

async function main() {
  const health = await fetch(`${BASE_URL}/api/system/health`);
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.status}`);
  }

  // Önceden gerçek bir kliniğe ait gibi görünen kimlik bilgileri (kurum adı,
  // TC no, şifre) kaynak kodunda varsayılan değer olarak duruyordu — repo'ya
  // erişimi olan herkes bu bilgilerle giriş deneyebilirdi (bkz. denetim
  // raporu). Artık ortam değişkenleri zorunlu; tanımlı değilse script erken
  // ve net bir hatayla durur.
  const institution = process.env.INTEGRATION_INSTITUTION;
  const identityNo = process.env.INTEGRATION_IDENTITY;
  const password = process.env.INTEGRATION_PASSWORD;
  if (!institution || !identityNo || !password) {
    throw new Error(
      "INTEGRATION_INSTITUTION, INTEGRATION_IDENTITY ve INTEGRATION_PASSWORD ortam değişkenleri tanımlı olmalı."
    );
  }

  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ institution, identityNo, password }),
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
