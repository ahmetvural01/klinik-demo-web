import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Gerçek bileşeni tarayıcıda çalıştırır; API yanıtları simüle edilir.
// Veritabanına veya gerçek demo oluşturma servisine istek göndermez.
const bundle = await build({
  stdin: {
    contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {DemoRequestForm} from "./src/components/marketing/DemoRequestForm"; createRoot(document.getElementById("root")).render(React.createElement(DemoRequestForm));',
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  // Ortak Button bağlantı verildiğinde next/link kullanır; Next yönlendiricisi olmadan düz <a>.
  plugins: [{ name: "next-link-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "tsx", resolveDir: process.cwd(), contents:
      'import React from "react"; export default function Link({children,prefetch,replace,scroll,...props}){return <a {...props}>{children}</a>;}' }));
  } }],
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const page = await browser.newPage();
  // Demo hazır ekranındaki doğrudan giriş /anasayfa'ya gider; o sayfa da aynı boş HTML ile yanıtlanır.
  await page.route((url) => url.origin === "http://cepklinik.test" && ["/", "/anasayfa"].includes(url.pathname), (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="tr"><body><div id="root"></div></body></html>',
  }));
  await page.goto("http://cepklinik.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  assert(!(await page.getByLabel("Şehir", { exact: true }).isVisible()), "Ek bilgiler başlangıçta kapalı olmalı");
  await page.getByText("Ek bilgiler (isteğe bağlı)", { exact: true }).click();
  await page.getByLabel("Şehir", { exact: true }).fill("İstanbul");
  await page.getByText("Ek bilgiler (isteğe bağlı)", { exact: true }).click();
  await page.getByLabel("Ad soyad").fill("Demo Test");
  await page.getByLabel("Klinik adı").fill("Test Kliniği");
  await page.getByLabel("E-posta").fill("demo@example.invalid");

  let attempts = 0;
  await page.route("**/api/demo-requests", async (route) => {
    attempts += 1;
    const payload = route.request().postDataJSON();
    assert.equal(payload.institutionName, "Test Kliniği");
    assert.equal(payload.notes, "Şehir: İstanbul", "Kapalı ek bilgiler gönderimde korunmalı");
    if (attempts === 1) {
      await route.abort("internetdisconnected");
    } else if (attempts === 2) {
      await route.fulfill({ status: 503, json: { message: "Demo servisi geçici olarak kullanılamıyor." } });
    } else {
      await route.fulfill({ json: { demo: {
        institution: "Test Kliniği",
        identityNo: "00000000000",
        doctorIdentityNo: "00000000002",
        bankoIdentityNo: "00000000003",
        password: "synthetic-test-value",
        expiresAt: "2030-01-01T00:00:00Z",
        loginUrl: "/klinik/giris",
      } } });
    }
  });

  const submit = page.getByRole("button", { name: "Demo erişimi oluştur", exact: true });
  await submit.click();
  await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
  assert(await submit.isEnabled(), "Ağ hatasından sonra yeniden deneme mümkün olmalı");
  assert.equal(await page.getByLabel("Ad soyad").inputValue(), "Demo Test");
  assert.equal(await page.getByLabel("E-posta").inputValue(), "demo@example.invalid");

  await submit.click();
  await page.getByRole("alert").filter({ hasText: "Demo servisi geçici" }).waitFor();
  assert(await submit.isEnabled(), "Sunucu hatasından sonra yeniden deneme mümkün olmalı");
  await submit.click();
  await page.getByRole("heading", { name: "Size özel demo kurumu oluşturuldu." }).waitFor();
  assert.equal(attempts, 3);

  // Demo hazır: rol hesapları görünür ve tek tıkla oturum açılır (bilgiler elle yazılmaz).
  for (const text of ["Test Kliniği", "00000000000", "00000000002", "00000000003", "synthetic-test-value"]) {
    await page.getByText(text, { exact: true }).waitFor();
  }
  const logins = [];
  await page.route("**/api/auth/login", async (route) => {
    logins.push(route.request().postDataJSON());
    if (logins.length === 1) await route.abort("internetdisconnected");
    else await route.fulfill({ json: { ok: true } });
  });
  const loginButton = page.getByRole("button", { name: "Doktor olarak giriş yap", exact: true });
  await loginButton.click();
  await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
  assert(await loginButton.isEnabled(), "Ağ hatasından sonra giriş yeniden denenebilmeli");
  // Başarılı girişten sonra panel açılana kadar rol düğmeleri kilitli kalmalı (ikinci giriş gitmesin).
  // Panel yanıtı 204: tarayıcı /anasayfa'ya gitmeyi dener ama sayfada kalır, böylece
  // "sayfa değişene kadar" geçen yavaş açılış süresi gözlenebilir.
  await page.route("http://cepklinik.test/anasayfa", (route) => route.fulfill({ status: 204, body: "" }));
  const homeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/anasayfa" && request.isNavigationRequest());
  await loginButton.click();
  await homeRequest;
  await page.waitForTimeout(300);
  assert(await page.getByRole("button", { name: "Yönetici olarak giriş yap", exact: true }).isDisabled(), "Giriş başarılıyken diğer rol düğmeleri kilitli kalmalı");
  // Yüklenirken düğmenin adına göstergenin "Yükleniyor" etiketi eklenir; ad parçasıyla bulunur.
  assert(await page.getByRole("button", { name: /Doktor olarak giriş yap/ }).isDisabled(), "Giriş başarılıyken aynı düğme yeniden basılamamalı");
  assert.equal(logins.length, 2);
  assert.deepEqual(logins[1], { institution: "Test Kliniği", identityNo: "00000000002", password: "synthetic-test-value", rememberMe: false });
  console.log("PASS: demo formu ek bilgiler, ağ hatası, sunucu hatası, başarılı yeniden deneme ve demo ekranından rol hesabıyla doğrudan giriş.");
} finally {
  await browser.close();
}
