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
    contents: `import React from "react"; import {createRoot, hydrateRoot} from "react-dom/client"; import {renderToString} from "react-dom/server";
      import Firma from "./src/app/(panel)/firma/page";
      import {InstallmentPlanForm} from "./src/components/finance/InstallmentPlanForm";
      import {ClinicLoginForm as ClinicLogin} from "./src/components/auth/clinic-login-form";
      import {SuperadminLoginForm as SuperadminLogin} from "./src/components/auth/superadmin-login-form";
      import {PermissionProvider} from "./src/components/auth/PermissionProvider";
      import ToastWrapper from "./src/components/ui/ToastWrapper";
      import {FormField} from "./src/components/ui/FormField";
      import Sms from "./src/app/(panel)/sms/page";
      import {Sidebar} from "./src/components/layout/sidebar";
      const selected=new URLSearchParams(location.search).get("fixture");
      // Muhasebe ve hasta dosyası aynı taksit planı formunu kullanır; hasta bağlamıyla açılmış hâli.
      const Plan=()=><InstallmentPlanForm open onClose={()=>{}} patient={{id:"patient",fullName:"Selin Acar"}} patientLocked doctors={[{id:"doctor",fullName:"Mert Aydın",role:"DOKTOR",isActive:true}]} doctorsLoaded canCollect/>;
      const Component=({firma:Firma,plan:Plan,login:ClinicLogin,admin:SuperadminLogin,sms:Sms,"sms-readonly":Sms})[selected];
      // Sunucu HTML'i + gecikmeli hidrasyon: kullanıcı sayfa etkileşimli olmadan yazar,
      // test window.__hydrate() ile hidrasyonu kendisi başlatır (canlıdaki boş gönderim hatası).
      const Ssr=({"login-ssr":ClinicLogin,"admin-ssr":SuperadminLogin})[selected];
      if (Ssr) { const root=document.getElementById("root"); root.innerHTML=renderToString(<Ssr/>);
        window.__hydrate=()=>new Promise(resolve=>{hydrateRoot(root,<Ssr/>); setTimeout(resolve,100);}); }
      else createRoot(document.getElementById("root")).render(<PermissionProvider role="YONETICI" permissions={selected==="sms-readonly"?["sms:read"]:["*"]} features={{whatsapp:false}} scopeKey="fixture">
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
// Bölümler birbirinden bağımsız koşar: biri düşerse diğerleri yine denenir ve
// sonda TÜM başarısızlıklar birlikte raporlanır (test yine başarısız sayılır).
const failures = [];
const openPages = new Set();
async function section(name, run) {
  try {
    await run();
  } catch (error) {
    const lines = String(error?.message || error).split("\n");
    failures.push(`${name}: ${lines[0]}${lines.find(line => line.includes("waiting for")) ? ` (${lines.find(line => line.includes("waiting for")).trim()})` : ""}`);
  } finally {
    for (const page of openPages) await page.close().catch(() => {});
    openPages.clear();
  }
}
try {
  async function fixture(name, extra = "") {
    const page = await browser.newPage();
    openPages.add(page);
    page.on("close", () => openPages.delete(page));
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

  // Klinik giriş ekranı + süperadmin kimliği (c0d393c, 28d2ce9): bu ekran Platform
  // panelini ASLA açmaz. Sunucu kurum adı yazılan kliniğe gizli oturum açar; 2FA'lı
  // süperadmin kodu platform uç noktasında (kurum adıyla) doğrulanır ve kliniğin
  // ana sayfası açılır. Sunucu yine de SUPERADMIN rolü döndürürse ekran yönlendirmez,
  // /superadmin adresini gösterir (bkz. scripts/auth-login-routing-regression-test.mjs).
  // Önceki beklenti (/superadmin/panel'e gitmesi) bu kuralla eskidi.
  await section("Klinik giriş ekranında süperadmin", async () => { for (const twoFactor of [false, true]) {
    const page = await fixture("login");
    await page.locator('input[autocomplete="organization"]').fill("klinik");
    await page.locator('input[autocomplete="username"]').fill("00000000000");
    await page.locator('input[autocomplete="current-password"]').fill("synthetic-password");
    const writes = [];
    page.on("request", request => { if (request.method() === "POST") writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() }); });
    await page.route("**/api/auth/login", route => route.fulfill({ json: twoFactor
      ? { requiresTwoFactor: true, pendingToken: "synthetic-platform-challenge" }
      : { role: "SUPERADMIN", institutionId: null } }));
    await page.locator('button[type="submit"]').click();
    if (twoFactor) {
      const code = page.getByLabel("Doğrulama kodu", { exact: true });
      assert.equal(await code.getAttribute("inputmode"), "numeric", "Kod alanı varsayılan olarak rakam klavyesi açmalı");
      await page.getByRole("button", { name: "Yedek kod kullan", exact: true }).click();
      assert.equal(await code.getAttribute("inputmode"), "text", "Yedek kod harf içerir; harf klavyesi açılmalı");
      await code.fill("BACKUP-CODE");
      await page.route("**/api/auth/superadmin/verify-2fa", route => route.abort("internetdisconnected"));
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
      assert.equal(await code.inputValue(), "BACKUP-CODE");
      assert(await page.locator('button[type="submit"]').isEnabled());
      await page.unroute("**/api/auth/superadmin/verify-2fa");
      await page.route("**/api/auth/superadmin/verify-2fa", route => route.fulfill({ json: { ok: true, clinic: true } }));
      // Başarılı doğrulamadan sonra panel açılana kadar düğme kilitli kalmalı:
      // yavaş açılışta ikinci tıklama ikinci istek göndermesin (çift gönderim).
      // Panel yanıtı 204: tarayıcı /anasayfa'ya gitmeyi dener ama sayfada kalır (yavaş açılış gözlenir).
      await page.route("http://cepklinik.test/anasayfa", route => route.fulfill({ status: 204, body: "" }));
      const homeRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/anasayfa" && request.isNavigationRequest());
      await page.locator('button[type="submit"]').click();
      await homeRequest;
      await page.waitForTimeout(300);
      assert(await page.locator('button[type="submit"]').isDisabled(), "Başarılı girişten sonra sayfa değişene kadar düğme kilitli kalmalı");
      const verify = writes.filter(write => write.path === "/api/auth/superadmin/verify-2fa").at(-1);
      assert.equal(verify?.body.institution, "klinik", "Görünmez giriş için kurum adı platform doğrulamasına gitmeli");
      assert.equal(verify?.body.code, "BACKUP-CODE");
    } else {
      await page.getByRole("alert").filter({ hasText: "/superadmin adresinden" }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/", "Klinik giriş ekranı Platform paneline yönlendirmemeli");
    }
    assert(!writes.some(write => write.path === "/api/auth/login/verify-2fa"), "Platform doğrulaması klinik endpointine gönderilmemeli");
    await page.close();
  } });

  // Canlı hata: hidrasyondan önce yazılan ya da tarayıcının otomatik doldurduğu
  // değerler React durumuna geçmiyor, form boş gidiyordu ("Geçersiz giriş verisi")
  // ve ilk yeniden çizimde alanlar siliniyordu.
  const nativeFill = (page, values) => page.evaluate(entries => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    for (const [selector, value] of entries) setValue.call(document.querySelector(selector), value); // olay yok: otomatik doldurma gibi
  }, Object.entries(values));
  await section("Hidrasyon öncesi / otomatik doldurulan giriş", async () => { for (const kind of ["login", "admin"]) {
    const loginApi = kind === "login" ? "/api/auth/login" : "/api/auth/superadmin/login";
    const values = { 'input[autocomplete="username"]': "00000000001", 'input[autocomplete="current-password"]': "synthetic-password" };
    if (kind === "login") values['input[autocomplete="organization"]'] = "klinik";
    for (const mode of ["hidrasyon-oncesi", "otomatik-doldurma"]) {
      const page = await fixture(mode === "hidrasyon-oncesi" ? `${kind}-ssr` : kind);
      if (mode === "hidrasyon-oncesi") {
        for (const [selector, value] of Object.entries(values)) await page.locator(selector).fill(value);
        await page.evaluate(() => window.__hydrate());
      } else {
        await page.locator('button[type="submit"]').waitFor();
        await nativeFill(page, values);
      }
      let sent = null;
      await page.route(`**${loginApi}`, route => { sent = route.request().postDataJSON(); return route.fulfill({ status: 401, json: { message: "Kullanıcı adı veya şifre hatalı" } }); });
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "şifre hatalı" }).waitFor();
      assert.equal(sent?.identityNo, "00000000001", `${kind}/${mode}: TC kimlik no gönderilmeli`);
      assert.equal(sent?.password, "synthetic-password", `${kind}/${mode}: şifre gönderilmeli`);
      if (kind === "login") assert.equal(sent?.institution, "klinik", `${kind}/${mode}: kurum adı gönderilmeli`);
      for (const [selector, value] of Object.entries(values)) {
        assert.equal(await page.locator(selector).inputValue(), value, `${kind}/${mode}: hatadan sonra ${selector} silinmemeli`);
      }
      await page.close();
    }
  } });

  await section("Erişilebilir alan hatası", async () => {
  const field = await fixture("field");
  const describedBy = await field.getByLabel("Tutar").getAttribute("aria-describedby");
  assert(describedBy, "htmlFor olmadan da alan hatası ilişkilendirilmeli");
  assert.equal(await field.locator(`[id="${describedBy}"]`).textContent(), "Tutar geçersiz");
  assert.equal(await field.getByLabel("Tutar").getAttribute("aria-invalid"), "true");
  await field.close();
  });

  await section("Giriş ve 2FA ağ hatası", async () => { for (const kind of ["login", "admin"]) {
    const page = await fixture(kind);
    // Ortak giriş düzeninde başlıklar cümle düzeninde (plan §3.3); bağlantı adı "Klinik girişi".
    if (kind === "login") {
      await page.getByRole("heading", { name: "Klinik girişi", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Platform yöneticisi girişi", exact: true }).getAttribute("href"), "/superadmin");
    } else {
      await page.getByRole("heading", { name: "Süperadmin girişi", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Klinik girişi", exact: true }).getAttribute("href"), "/klinik/giris");
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
    // İki giriş ekranı aynı doğrulama adımını kullanır (görünür etiket "Doğrulama kodu").
    const code = page.getByLabel("Doğrulama kodu", { exact: true });
    await code.waitFor();
    await code.fill("123456");
    await page.route(kind === "login" ? "**/api/auth/login/verify-2fa" : "**/api/auth/superadmin/verify-2fa", route => route.abort("internetdisconnected"));
    await page.locator('button[type="submit"]').click();
    await page.getByRole("alert").filter({ hasText: "Bağlantı kurulamadı" }).waitFor();
    assert(await page.locator('button[type="submit"]').isEnabled(), "İki faktörlü doğrulama yeniden denenebilmeli");
    assert.equal(await code.inputValue(), "123456");
    await page.close();
  } });

  // Dalga 1 adlandırması: "Yeni Firma" → "Yeni tedarikçi" (liste boşken boş durumda da aynı düğme var), "Firma Adı" → "Firma adı".
  await section("Tedarikçi formu", async () => {
  const firma = await fixture("firma");
  await firma.getByRole("button", { name: "Yeni tedarikçi", exact: true }).first().click();
  await firma.getByLabel("Firma adı").fill("Acar Dental");
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
  assert.equal(await firma.getByLabel("Firma adı").inputValue(), "Acar Dental");
  await saveFirma.click();
  await firma.getByText("Tedarikçi servisi geçici olarak kapalı").waitFor();
  assert.equal(await firma.getByLabel("Firma adı").inputValue(), "Acar Dental");
  await saveFirma.click();
  await firma.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(firmaAttempts, 3);
  await firma.close();
  });

  // Dalga 1: Muhasebe'deki eski "Yeni Plan" penceresi kalktı; Muhasebe ve hasta dosyası
  // tek InstallmentPlanForm'u kullanır (tutar "Taksitlendirilecek tutar", sayı "Diğer" →
  // "Kaç taksit?", düğme "Kaydet"). Aynı kurallar bu formda doğrulanır.
  await section("Taksit planı formu", async () => {
  const finance = await fixture("plan");
  const amount = finance.getByLabel("Taksitlendirilecek tutar");
  await amount.fill("3500");
  await finance.getByRole("radio", { name: "Diğer", exact: true }).click();
  const count = finance.getByLabel("Kaç taksit?");
  await count.fill("1.5");
  const createPlan = finance.getByRole("button", { name: "Kaydet", exact: true });
  await createPlan.click();
  await finance.getByText("Taksit sayısı 1 ile 100 arasında olmalı.").waitFor();
  await count.fill("101");
  await createPlan.click();
  await finance.getByText("Taksit sayısı 1 ile 100 arasında olmalı.").waitFor();
  assert(await createPlan.isEnabled());
  await count.fill("100");
  const amountBefore = await amount.inputValue();
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
  assert(amountBefore, "Tutar alanı dolu olmalı");
  assert.equal(await amount.inputValue(), amountBefore, "Ağ hatasında tutar korunmalı");
  assert.equal(planAttempts, 1);
  await finance.close();
  });

  await section("İletişim sekmeleri ve izinler", async () => {
  // Dalga 1 İletişim sekmeleri: Mesaj gönder · Otomatik mesajlar · Gönderim geçmişi · Kanal ve kredi.
  // Eski adresler yeni sekmeye eşlenir (sablonlar → Otomatik mesajlar, toplu → Mesaj gönder;
  // gönderme izni yoksa ilk görünen sekme). Görüşmeler (WhatsApp sohbet) sekmesi hiç yok.
  const sms = await fixture("sms", "&tab=sablonlar");
  await sms.getByRole("heading", { name: "İletişim", exact: true }).waitFor();
  assert.equal(await sms.getByRole("tab", { name: "Otomatik mesajlar", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await sms.getByRole("tab", { name: "Görüşmeler", exact: true }).count(), 0, "WhatsApp özelliği olmayan kurumda sekme açılmamalı");
  await sms.close();
  const readOnly = await fixture("sms-readonly", "&tab=toplu");
  await readOnly.getByRole("tab", { name: "Gönderim geçmişi", exact: true }).waitFor();
  assert.equal(await readOnly.getByRole("tab", { name: "Mesaj gönder", exact: true }).count(), 0, "Yalnız okuma izniyle gönderim sekmesi görünmemeli");
  assert.equal(await readOnly.getByRole("tab", { name: "Kanal ve kredi", exact: true }).count(), 0, "Ayar izni olmadan kanal sekmesi görünmemeli");
  assert.equal(await readOnly.getByRole("tab", { name: "Otomatik mesajlar", exact: true }).getAttribute("aria-selected"), "true", "Erişilemeyen eski sekme adresi ilk görünen sekmeyi açmalı");
  await readOnly.close();
  });

  await section("Duyarlı menü", async () => { for (const width of [375, 768, 1440]) {
    const sidebar = await fixture("sidebar");
    await sidebar.setViewportSize({ width, height: 900 });
    // Dalga 1 yerleşimi: sabit masaüstü menüsü (aside "Klinik menüsü") ≥1024 px'te;
    // altında menü çekmecede ("Ana menü") açılır.
    if (width >= 1024) {
      const menu = sidebar.getByRole("complementary", { name: "Klinik menüsü" });
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
      await sidebar.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name: "Hastalar", exact: true }).waitFor();
      await sidebar.getByRole("button", { name: "Kapat", exact: true }).click();
    }
    assert(await sidebar.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Menü yatay taşma oluşturmamalı");
    await sidebar.close();
  } });
  assert.deepEqual(failures, [], `Başarısız bölümler:\n- ${failures.join("\n- ")}`);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: gerçek giriş/2FA ve giriş ayrımı, hidrasyon öncesi/otomatik doldurulan giriş, tedarikçi, taksit, SMS izinleri, erişilebilir hata alanı ve responsive menü tarayıcı testleri.\n");
} finally {
  await browser.close();
}
