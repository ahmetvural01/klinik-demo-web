/* eslint-disable no-console */
export {};

const BASE_URL = process.env.INTEGRATION_BASE_URL || "http://localhost:3000";

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

  // Sunucu ölçümleri ve alarmlar platform genelidir (tüm kliniklerin
  // sayaçları, yavaş rotalar): klinik oturumu 403 almalı. Önceden audit:read
  // ile her klinik yöneticisine açıktı; artık yalnız süperadmin okur
  // (Süperadmin › Sistem Ayarları › Teknik ölçümler).
  // Teknik ölçümler sekmesi süperadmin yüzeyindeki birleşik ucu okur (açık
  // gizli klinik girişinde de süperadmin oturumuyla); o da klinikte 403.
  const platformMetricPaths = ["/api/system/metrics", "/api/system/alerts", "/api/superadmin/system-settings/metrics"];
  for (const path of platformMetricPaths) {
    const clinicResponse = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
    if (clinicResponse.status !== 403) {
      throw new Error(`${path} klinik oturumunda 403 beklenirdi, gelen: ${clinicResponse.status}`);
    }
  }

  // İsteğe bağlı: süperadmin bilgileri verilirse aynı uçlar 200 dönmeli.
  const superIdentity = process.env.INTEGRATION_SUPERADMIN_IDENTITY;
  const superPassword = process.env.INTEGRATION_SUPERADMIN_PASSWORD;
  if (superIdentity && superPassword) {
    const superLogin = await fetch(`${BASE_URL}/api/auth/superadmin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityNo: superIdentity, password: superPassword }),
    });
    if (!superLogin.ok) {
      throw new Error(`Superadmin login failed: ${superLogin.status}`);
    }
    const superCookie = (superLogin.headers.get("set-cookie") || "").split(";")[0];
    if (!superCookie) {
      throw new Error("Superadmin login cookie missing (iki adımlı doğrulama açık hesapla bu kontrol yapılamaz)");
    }
    for (const path of platformMetricPaths) {
      const superResponse = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: superCookie } });
      if (!superResponse.ok) {
        throw new Error(`${path} süperadmin oturumunda 200 beklenirdi, gelen: ${superResponse.status}`);
      }
    }
  }

  console.log("Integration checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
