/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const prisma = new PrismaClient();
// Üretim derlemesindeki Secure oturum çerezi yerel tarayıcılarda localhost
// için kabul edilir; 127.0.0.1 aynı güvenilir kaynak istisnasına sahip değildir.
const BASE_URL = process.env.ROUTE_SMOKE_BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const INSTITUTION = process.env.ROUTE_SMOKE_INSTITUTION || "";
const IDENTITY_NO = process.env.ROUTE_SMOKE_IDENTITY || "";
const PASSWORD = process.env.ROUTE_SMOKE_PASSWORD || "";

type Failure = {
  area: string;
  route: string;
  detail: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizeRoute(href: string) {
  const url = new URL(href, BASE_URL);
  return `${url.pathname}${url.search}`;
}

async function visibleNavigationRoutes(page: Page, fallback: string[]) {
  const hrefs = await page.locator("aside a[href]").evaluateAll((links) =>
    links
      .filter((link) => {
        const style = window.getComputedStyle(link);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((link) => link.getAttribute("href") || "")
  );

  return [...new Set([...fallback, ...hrefs]
    .filter((href) => href.startsWith("/") && !href.startsWith("//"))
    .map(normalizeRoute))];
}

async function auditRoute(page: Page, area: string, route: string): Promise<Failure[]> {
  const failures: Failure[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];

  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("response", onResponse);

  try {
    const response = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 75_000,
    });
    await page.waitForTimeout(700);

    if (!response || response.status() >= 500) {
      failures.push({ area, route, detail: `Sayfa yanıtı: ${response?.status() ?? "yok"}` });
    }

    const finalPath = new URL(page.url()).pathname;
    const authRedirect = area === "klinik"
      ? ["/giris", "/klinik/giris"].includes(finalPath)
      : finalPath === "/superadmin";
    if (authRedirect) failures.push({ area, route, detail: `Beklenmedik oturum yönlendirmesi: ${finalPath}` });

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const fatalText = bodyText.match(/Application error|Internal Server Error|Beklenmeyen bir hata oluştu|Sayfa yüklenemedi/i)?.[0];
    if (fatalText) failures.push({ area, route, detail: `Hata ekranı: ${fatalText}` });

    for (const detail of pageErrors) failures.push({ area, route, detail: `Tarayıcı: ${detail}` });
    for (const detail of consoleErrors) failures.push({ area, route, detail: `Konsol: ${detail}` });
    for (const detail of httpErrors) failures.push({ area, route, detail: `HTTP: ${detail}` });
  } catch (error) {
    failures.push({ area, route, detail: error instanceof Error ? error.message : String(error) });
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  console.log(`${failures.length ? "✗" : "✓"} [${area}] ${route}`);
  return failures;
}

async function loginClinic(context: BrowserContext) {
  const login = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { institution: INSTITUTION, identityNo: IDENTITY_NO, password: PASSWORD },
  });
  assert(login.ok(), `Klinik girişi başarısız: ${login.status()} ${await login.text()}`);

  const me = await context.request.get(`${BASE_URL}/api/auth/me`);
  assert(me.ok(), `Klinik oturumu okunamadı: ${me.status()} ${await me.text()}`);
  return await me.json() as { institutionId?: string };
}

async function auditClinic(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const me = await loginClinic(context);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/anasayfa`, { waitUntil: "domcontentloaded", timeout: 75_000 });
    await page.waitForSelector("aside", { timeout: 30_000 });

    const routes = await visibleNavigationRoutes(page, ["/anasayfa", "/profil"]);
    if (me.institutionId) {
      const patient = await prisma.patient.findFirst({
        where: { institutionId: me.institutionId },
        select: { id: true },
      });
      if (patient) routes.push(`/hasta-detay?id=${encodeURIComponent(patient.id)}`);
    }

    const failures: Failure[] = [];
    for (const route of [...new Set(routes)]) failures.push(...await auditRoute(page, "klinik", route));
    return { routes: routes.length, failures };
  } finally {
    await context.close();
  }
}

async function auditSuperadmin(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const identityNo = `SA${suffix}`.slice(0, 20);
  const password = `Route!${suffix}`;
  const user = await prisma.user.create({
    data: {
      identityNo,
      fullName: `Rota Denetimi ${suffix}`,
      passwordHash: await bcrypt.hash(password, 10),
      role: "SUPERADMIN",
    },
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const login = await context.request.post(`${BASE_URL}/api/auth/superadmin/login`, {
      data: { identityNo, password },
    });
    assert(login.ok(), `Süper yönetici girişi başarısız: ${login.status()} ${await login.text()}`);

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/superadmin/panel`, { waitUntil: "domcontentloaded", timeout: 75_000 });
    await page.waitForSelector("aside", { timeout: 30_000 });

    const routes = await visibleNavigationRoutes(page, ["/superadmin/panel"]);
    const institution = await prisma.institution.findFirst({ select: { id: true } });
    if (institution) routes.push(`/superadmin/institutions/${encodeURIComponent(institution.id)}`);

    const failures: Failure[] = [];
    for (const route of [...new Set(routes)]) failures.push(...await auditRoute(page, "superadmin", route));
    return { routes: routes.length, failures };
  } finally {
    await context.close();
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.superadminPermission.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  assert(
    INSTITUTION && IDENTITY_NO && PASSWORD,
    "ROUTE_SMOKE_INSTITUTION, ROUTE_SMOKE_IDENTITY ve ROUTE_SMOKE_PASSWORD zorunludur.",
  );
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const clinic = await auditClinic(browser);
    const superadmin = await auditSuperadmin(browser);
    const failures = [...clinic.failures, ...superadmin.failures];

    console.log(`\n${clinic.routes + superadmin.routes} rota denetlendi.`);
    if (failures.length) {
      console.error(`${failures.length} çalışma zamanı sorunu bulundu:`);
      for (const failure of failures) console.error(`- [${failure.area}] ${failure.route}: ${failure.detail}`);
      process.exitCode = 1;
    } else {
      console.log("✓ Klinik ve süper yönetici rotalarında çalışma zamanı hatası bulunmadı.");
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
