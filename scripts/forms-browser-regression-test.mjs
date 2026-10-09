import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cssDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cepklinik-form-css-"));
const cssFile = path.join(cssDirectory, "styles.css");
let css;
try {
  execFileSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js", "-i", "src/app/globals.css", "-o", cssFile, "--minify"], { stdio: "pipe" });
  css = fs.readFileSync(cssFile, "utf8");
} finally {
  if (fs.existsSync(cssFile)) fs.unlinkSync(cssFile);
  fs.rmdirSync(cssDirectory);
}

// Actual client components, isolated from Next's server layout and real patient data.
const bundle = await build({
  stdin: {
    contents: `import React from "react"; import {createRoot} from "react-dom/client";
      import Firma from "./src/app/(panel)/firma/page";
      import Muhasebe from "./src/app/(panel)/muhasebe/page";
      import {ClinicLoginForm as ClinicLogin} from "./src/components/auth/clinic-login-form";
      import {SuperadminLoginForm as SuperadminLogin} from "./src/components/auth/superadmin-login-form";
      import {PermissionProvider} from "./src/components/auth/PermissionProvider";
      import ToastWrapper from "./src/components/ui/ToastWrapper";
      import {FormField} from "./src/components/ui/FormField";
      import Sms from "./src/app/(panel)/sms/page";
      import {Sidebar} from "./src/components/layout/sidebar";
      const selected=new URLSearchParams(location.search).get("fixture");
      const Component=({firma:Firma,finance:Muhasebe,login:ClinicLogin,admin:SuperadminLogin,sms:Sms,"sms-readonly":Sms})[selected];
      createRoot(document.getElementById("root")).render(<PermissionProvider role="YONETICI" permissions={selected==="sms-readonly"?["sms:read"]:["*"]} features={{whatsapp:false}} scopeKey="fixture">
        <ToastWrapper>{selected==="sidebar"?<div className="panel-body flex h-dvh overflow-hidden"><Sidebar user={{fullName:"Yönetici",role:"YONETICI"}}/><main className="min-w-0 flex-1"><h1>Klinik</h1></main></div>:Component ? <Component/> : <FormField label="Tutar" error="Tutar geçersiz"><input defaultValue="-1"/></FormField>}</ToastWrapper>
      </PermissionProvider>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "next-browser-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "tsx", resolveDir: process.cwd(), contents:
      args.path === "next/navigation" ? `const params=new URLSearchParams(location.search); const router={push(){},replace(){},refresh(){},prefetch(){}}; export const useRouter=()=>router; export const useSearchParams=()=>params; export const usePathname=()=>location.pathname;` :
      args.path === "next/link" ? `import React from "react"; export default function Link({children,prefetch,replace,scroll,...props}){return <a {...props}>{children}</a>;}` :
      `import React from "react"; export default function Image({fill,priority,quality,...props}){return <img {...props}/>;}`,
    }));
  } }],
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const errors = [];
try {
  async function fixture(name, extra = "") {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push({ fixture: name, message: error.message }));
    await page.route("http://cepklinik.test/**", async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="tr"><body><div id="root"></div></body></html>' });
      const json = url.pathname === "/api/patients" ? [{ id: "patient", fullName: "Selin Acar" }] :
        url.pathname === "/api/staff" ? [{ id: "doctor", fullName: "Mert Aydın", role: "DOKTOR", isActive: true }] :
        url.pathname === "/api/auth/me" ? { role: "YONETICI", permissions: ["*"], scopeKey: "fixture" } :
        url.pathname === "/api/capabilities" ? { features: { whatsapp: false } } :
        url.pathname === "/api/taksit-plani" ? { items: [], total: 0, pageCount: 1 } : [];
      return route.fulfill({ json });
    });
    await page.goto(`http://cepklinik.test/?fixture=${name}${extra}`);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    return page;
  }

  for (const twoFactor of [false, true]) {
    const page = await fixture("login");
    await page.locator('input[autocomplete="organization"]').fill("klinik");
    await page.locator('input[autocomplete="username"]').fill("00000000000");
    await page.locator('input[autocomplete="current-password"]').fill("synthetic-password");
    const writes = [];
    page.on("request", request => { if (request.method() === "POST") writes.push(new URL(request.url()).pathname); });
    await page.route("**/api/auth/login", route => route.fulfill({ json: twoFactor
      ? { requiresTwoFactor: true, pendingToken: "synthetic-platform-challenge" }
      : { role: "SUPERADMIN", institutionId: null } }));
    await page.locator('button[type="submit"]').click();
    if (twoFactor) {
      const code = page.getByLabel("Doğrulama kodu", { exact: true });
      await code.fill("BACKUP-CODE");
      assert.equal(await code.getAttribute("inputmode"), "text");
      await page.route("**/api/auth/superadmin/verify-2fa", route => route.abort("internetdisconnected"));
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
      assert.equal(await code.inputValue(), "BACKUP-CODE");
      assert(await page.locator('button[type="submit"]').isEnabled());
      await page.unroute("**/api/auth/superadmin/verify-2fa");
      await page.route("**/api/auth/superadmin/verify-2fa", route => route.fulfill({ json: { role: "SUPERADMIN", institutionId: null } }));
      await page.locator('button[type="submit"]').click();
    }
    await page.waitForURL("**/superadmin/panel");
    assert(!writes.includes("/api/auth/login/verify-2fa"), "Platform doğrulaması klinik endpointine gönderilmemeli");
    await page.close();
  }

  const field = await fixture("field");
  const describedBy = await field.getByLabel("Tutar").getAttribute("aria-describedby");
  assert(describedBy, "htmlFor olmadan da alan hatası ilişkilendirilmeli");
  assert.equal(await field.locator(`[id="${describedBy}"]`).textContent(), "Tutar geçersiz");
  assert.equal(await field.getByLabel("Tutar").getAttribute("aria-invalid"), "true");
  await field.close();

  for (const kind of ["login", "admin"]) {
    const page = await fixture(kind);
    if (kind === "login") {
      assert.equal(await page.getByRole("link", { name: "Platform yöneticisi girişi", exact: true }).getAttribute("href"), "/superadmin");
    } else {
      await page.getByRole("heading", { name: "Süperadmin Girişi", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Klinik paneline giriş", exact: true }).getAttribute("href"), "/klinik/giris");
    }
    if (kind === "login") await page.locator('input[autocomplete="organization"]').fill("klinik");
    await page.locator('input[autocomplete="username"]').fill("00000000000");
    await page.locator('input[autocomplete="current-password"]').fill("synthetic-password");
    const api = kind === "login" ? "/api/auth/login" : "/api/auth/superadmin/login";
    await page.route(`**${api}`, route => route.abort("internetdisconnected"));
    const submit = page.locator('button[type="submit"]');
    await submit.click();
    await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
    assert(await submit.isEnabled(), "Giriş formu ağ hatasında kilitlenmemeli");
    assert.equal(await page.locator('input[autocomplete="current-password"]').inputValue(), "synthetic-password");
    assert.equal(await page.locator("form").getAttribute("method"), "post");
    await page.unroute(`**${api}`);
    await page.route(`**${api}`, route => route.fulfill({ json: kind === "login" ? { requires2FA: true, pendingToken: "synthetic-token" } : { requiresTwoFactor: true, pendingToken: "synthetic-token" } }));
    await submit.click();
    const code = kind === "login" ? page.locator('input[inputmode="numeric"]') : page.getByLabel("Kod", { exact: true });
    await code.waitFor();
    await code.fill("123456");
    await page.route(kind === "login" ? "**/api/auth/login/verify-2fa" : "**/api/auth/superadmin/verify-2fa", route => route.abort("internetdisconnected"));
    await page.locator('button[type="submit"]').click();
    await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
    assert(await page.locator('button[type="submit"]').isEnabled(), "İki faktörlü doğrulama yeniden denenebilmeli");
    assert.equal(await code.inputValue(), "123456");
    await page.close();
  }

  const firma = await fixture("firma");
  await firma.getByRole("button", { name: "Yeni Firma", exact: true }).click();
  await firma.getByLabel("Firma Adı").fill("Acar Dental");
  let firmaAttempts = 0;
  await firma.route("**/api/firma", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    firmaAttempts++;
    if (firmaAttempts === 1) return route.abort("internetdisconnected");
    if (firmaAttempts === 2) return route.fulfill({ status: 503, json: { message: "Tedarikçi servisi geçici olarak kapalı" } });
    return route.fulfill({ json: { id: "supplier" } });
  });
  const saveFirma = firma.getByRole("button", { name: "Kaydet", exact: true });
  await saveFirma.click();
  await firma.getByText(/Bağlantı kurulamadı/).waitFor();
  assert(await saveFirma.isEnabled());
  assert.equal(await firma.getByLabel("Firma Adı").inputValue(), "Acar Dental");
  await saveFirma.click();
  await firma.getByText("Tedarikçi servisi geçici olarak kapalı").waitFor();
  assert.equal(await firma.getByLabel("Firma Adı").inputValue(), "Acar Dental");
  await saveFirma.click();
  await firma.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(firmaAttempts, 3);
  await firma.close();

  const finance = await fixture("finance", "&tab=taksit");
  await finance.getByRole("button", { name: "Yeni Plan", exact: true }).click();
  await finance.getByLabel("Hasta", { exact: true }).selectOption("patient");
  await finance.getByLabel("Doktor", { exact: true }).selectOption("doctor");
  await finance.getByLabel("Toplam Borç (₺)", { exact: true }).fill("3500");
  await finance.getByLabel("Taksit Sayısı", { exact: true }).fill("1.5");
  const createPlan = finance.getByRole("button", { name: "Plan oluştur", exact: true });
  await createPlan.click();
  await finance.getByText("Taksit sayısı 1–100 arasında bir tam sayı olmalı").waitFor();
  await finance.getByLabel("Taksit Sayısı", { exact: true }).fill("101");
  await createPlan.click();
  assert(await createPlan.isEnabled());
  await finance.getByLabel("Taksit Sayısı", { exact: true }).fill("100");
  let planAttempts = 0;
  await finance.route("**/api/taksit-plani", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { items: [], total: 0, pageCount: 1 } });
    planAttempts++;
    assert.equal(route.request().postDataJSON().taksitSayisi, 100);
    return route.abort("internetdisconnected");
  });
  await createPlan.click();
  await finance.getByText(/Bağlantı kurulamadı/).waitFor();
  assert(await createPlan.isEnabled());
  assert.equal(await finance.getByLabel("Toplam Borç (₺)", { exact: true }).inputValue(), "3500");
  assert.equal(planAttempts, 1);
  await finance.close();

  const sms = await fixture("sms", "&tab=sablonlar");
  await sms.getByRole("heading", { name: "İletişim Şablonları" }).waitFor();
  assert.equal(await sms.getByRole("tab", { name: "Şablonlar", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await sms.getByRole("tab", { name: "Görüşmeler", exact: true }).count(), 0, "WhatsApp özelliği olmayan kurumda sekme açılmamalı");
  await sms.close();
  const readOnly = await fixture("sms-readonly", "&tab=toplu");
  await readOnly.getByRole("tab", { name: "Kayıtlar", exact: true }).waitFor();
  assert.equal(await readOnly.getByRole("tab", { name: "Toplu Gönderim", exact: true }).count(), 0);
  assert.equal(await readOnly.getByRole("tab", { name: "Kayıtlar", exact: true }).getAttribute("aria-selected"), "true");
  await readOnly.close();

  for (const width of [375, 768, 1440]) {
    const sidebar = await fixture("sidebar");
    await sidebar.setViewportSize({ width, height: 900 });
    if (width >= 768) {
      const menu = sidebar.getByRole("navigation", { name: "Klinik menüsü" });
      await menu.getByRole("link", { name: "Hastalar", exact: true }).waitFor();
      const atRest = await sidebar.locator("main").boundingBox();
      assert(atRest.x >= 263, "Masaüstünde menü metinleri başlangıçta görünmeli");
      await sidebar.getByRole("button", { name: "Menüyü daralt", exact: true }).click();
      await sidebar.mouse.move(width - 10, 100);
      await sidebar.waitForTimeout(300);
      const collapsed = await sidebar.locator("main").boundingBox();
      assert(collapsed.x < atRest.x, "Daraltma içerik alanını genişletmeli");
    } else {
      await sidebar.evaluate(() => window.dispatchEvent(new Event("toggle-mobile-sidebar")));
      await sidebar.getByRole("navigation", { name: "Klinik menüsü" }).getByRole("link", { name: "Hastalar", exact: true }).waitFor();
      await sidebar.getByRole("button", { name: "Kapat", exact: true }).click();
    }
    assert(await sidebar.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Menü yatay taşma oluşturmamalı");
    await sidebar.close();
  }
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: gerçek giriş/2FA ve giriş ayrımı, tedarikçi, taksit, SMS izinleri, erişilebilir hata alanı ve responsive menü tarayıcı testleri.\n");
} finally {
  await browser.close();
}
