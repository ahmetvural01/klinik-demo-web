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
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.route("http://cepklinik.test/", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="tr"><body><div id="root"></div></body></html>',
  }));
  await page.goto("http://cepklinik.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  assert(!(await page.getByLabel("Şehir", { exact: true }).isVisible()), "Ek bilgiler başlangıçta kapalı olmalı");
  await page.getByText("Ek bilgiler (isteğe bağlı)", { exact: true }).click();
  await page.getByLabel("Şehir", { exact: true }).fill("İstanbul");
  await page.getByText("Ek bilgiler (isteğe bağlı)", { exact: true }).click();
  await page.getByLabel("Ad Soyad").fill("Demo Test");
  await page.getByLabel("Klinik / Kurum Adı").fill("Test Kliniği");
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
  assert.equal(await page.getByLabel("Ad Soyad").inputValue(), "Demo Test");
  assert.equal(await page.getByLabel("E-posta").inputValue(), "demo@example.invalid");

  await submit.click();
  await page.getByRole("alert").filter({ hasText: "Demo servisi geçici" }).waitFor();
  assert(await submit.isEnabled(), "Sunucu hatasından sonra yeniden deneme mümkün olmalı");
  await submit.click();
  await page.getByRole("heading", { name: "Size özel demo kurumu oluşturuldu." }).waitFor();
  assert.equal(attempts, 3);
  console.log("PASS: demo formu ek bilgiler, ağ hatası, sunucu hatası ve başarılı yeniden deneme.");
} finally {
  await browser.close();
}
