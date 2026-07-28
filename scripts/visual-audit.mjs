import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.VISUAL_BASE_URL || "http://localhost:3001";
const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.resolve("tmp", "visual-audit");

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const baseRoutes = [
  { name: "anasayfa", path: "/anasayfa" },
  { name: "randevular", path: "/randevu" },
  { name: "hastalar", path: "/hasta" },
  { name: "muhasebe", path: "/muhasebe" },
  { name: "laboratuvar", path: "/lab" },
  { name: "stok", path: "/stok" },
  { name: "tedarikciler", path: "/firma" },
  { name: "personeller", path: "/personel" },
  { name: "sms-yonetimi", path: "/sms" },
  { name: "ayarlar", path: "/ayar" },
];
const publicRoutes = [
  { name: "tanitim", path: "/" },
  { name: "klinik-giris", path: "/klinik/giris" },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

const report = [];

try {
  const authContext = await browser.newContext({ locale: "tr-TR" });
  const login = await authContext.request.post(`${baseUrl}/api/auth/login`, {
    data: {
      institution: process.env.VISUAL_INSTITUTION || "whitedental",
      identityNo: process.env.VISUAL_IDENTITY || "10000000001",
      password: process.env.VISUAL_PASSWORD || "10711453",
      rememberMe: false,
    },
  });

  // Yerel veritabanı sıfırken dahi tanıtım ve giriş ekranlarını denetlemek
  // değerli. Bu durumda korumalı sayfaları atla; tüm görsel denetimi çöpe
  // atacak şekilde erken hata verme.
  let authState = null;
  let authWarning = "";
  if (!login.ok()) {
    authWarning = `Görsel test girişi yapılamadı: ${login.status()} ${await login.text()}`;
    console.warn(authWarning);
  } else {
    authState = await authContext.storageState();
  }
  await authContext.close();

  for (const viewport of viewports) {
    const publicContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: "tr-TR",
    });
    const publicPage = await publicContext.newPage();
    for (const route of publicRoutes) {
      const publicErrors = [];
      const publicFailedResponses = [];
      publicPage.removeAllListeners();
      publicPage.on("pageerror", (error) => publicErrors.push(error.message));
      publicPage.on("response", (response) => {
        if (response.status() >= 400 && response.url().includes("/api/")) {
          publicFailedResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      const response = await publicPage.goto(`${baseUrl}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await publicPage.waitForTimeout(1_500);
      const metrics = await publicPage.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        horizontalOverflow:
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
          window.innerWidth + 1,
        outside: [],
        tinyText: Array.from(document.querySelectorAll("body *")).filter((element) => {
          const text = String(element.childNodes.length === 1 ? element.textContent : "").trim();
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return text && style.display !== "none" && rect.width > 0 && Number.parseFloat(style.fontSize) < 12;
        }).length,
        smallTargets: Array.from(
          document.querySelectorAll("button,a,[role='button'],input,select"),
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
        }).length,
      }));
      const screenshot = path.join(outputDir, `${viewport.name}-${route.name}.png`);
      await publicPage.screenshot({ path: screenshot, fullPage: true });
      report.push({
        viewport: viewport.name,
        route: route.path,
        status: response?.status() || 0,
        screenshot,
        consoleErrors: [...new Set(publicErrors)].slice(0, 10),
        failedResponses: [...new Set(publicFailedResponses)].slice(0, 10),
        ...metrics,
      });
    }
    await publicContext.close();

    if (!authState) {
      report.push({
        viewport: viewport.name,
        route: "[korumalı ekranlar]",
        status: 0,
        skipped: true,
        reason: authWarning,
        horizontalOverflow: false,
        outside: [],
        tinyText: 0,
        smallTargets: 0,
        consoleErrors: [],
        failedResponses: [],
      });
      continue;
    }

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: "tr-TR",
      storageState: authState,
    });

    const patientResponse = await context.request.get(
      `${baseUrl}/api/patients?take=1&summary=false`,
    );
    const patientJson = patientResponse.ok() ? await patientResponse.json() : null;
    const patientRows = Array.isArray(patientJson)
      ? patientJson
      : patientJson?.patients || patientJson?.data || [];
    const patientId = patientRows[0]?.id;
    const patientName =
      patientRows[0]?.fullName ||
      [patientRows[0]?.firstName, patientRows[0]?.lastName].filter(Boolean).join(" ");
    const routes = patientId
      ? [
          ...baseRoutes,
          {
            name: "hasta-detay",
            path: `/hasta-detay?id=${encodeURIComponent(patientId)}&tab=bilgi`,
          },
        ]
      : baseRoutes;

    const page = await context.newPage();
    const consoleErrors = [];
    const failedResponses = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/api/")) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    for (const route of routes) {
      consoleErrors.length = 0;
      failedResponses.length = 0;
      const response = await page.goto(`${baseUrl}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page
        .waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, {
          timeout: 10_000,
        })
        .catch(() => {});
      if (route.name === "hasta-detay" && patientName) {
        await page
          .getByText(patientName, { exact: false })
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {});
      }
      await page.waitForTimeout(1_800);

      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const viewportWidth = window.innerWidth;
        const all = Array.from(document.querySelectorAll("body *"));

        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const closedDetails = element.closest("details:not([open])");
          if (closedDetails && element !== closedDetails && element.tagName !== "SUMMARY") {
            return false;
          }
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const hasHorizontalScrollParent = (element) => {
          let parent = element.parentElement;
          while (parent && parent !== body) {
            const style = getComputedStyle(parent);
            if (
              (style.overflowX === "auto" || style.overflowX === "scroll") &&
              parent.scrollWidth > parent.clientWidth
            ) {
              return true;
            }
            parent = parent.parentElement;
          }
          return false;
        };

        const outside = all
          .filter(isVisible)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              (rect.left < -1 || rect.right > viewportWidth + 1) &&
              !hasHorizontalScrollParent(element)
            );
          })
          .slice(0, 20)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.className || "").slice(0, 160),
            text: String(element.textContent || "").trim().slice(0, 80),
          }));

        const tinyText = all
          .filter(isVisible)
          .filter((element) => {
            const text = String(element.childNodes.length === 1 ? element.textContent : "").trim();
            if (!text || element.closest("svg,[aria-hidden='true']")) return false;
            return Number.parseFloat(getComputedStyle(element).fontSize) < 12;
          }).length;

        const smallTargets = all
          .filter((element) => element.matches("button,a,[role='button'],input,select"))
          .filter(isVisible)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width < 32 || rect.height < 32;
          }).length;

        return {
          viewportWidth,
          documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
          horizontalOverflow:
            Math.max(root.scrollWidth, body.scrollWidth) > viewportWidth + 1,
          outside,
          tinyText,
          smallTargets,
        };
      });

      const screenshot = path.join(outputDir, `${viewport.name}-${route.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      report.push({
        viewport: viewport.name,
        route: route.path,
        status: response?.status() || 0,
        screenshot,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
        failedResponses: [...new Set(failedResponses)].slice(0, 10),
        ...metrics,
      });
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outputDir, "report.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const problems = report.filter(
  (item) =>
    item.status >= 400 ||
    item.horizontalOverflow ||
    item.outside.length > 0 ||
    item.consoleErrors.length > 0 ||
    item.failedResponses.length > 0,
);

console.log(`Görsel denetim: ${report.length} ekran, ${problems.length} sorunlu ekran`);
console.log(`Rapor: ${reportPath}`);
for (const item of problems) {
  console.log(
    `- ${item.viewport} ${item.route}: HTTP ${item.status}, taşma=${item.horizontalOverflow}, dışarıda=${item.outside.length}, konsol=${item.consoleErrors.length}, sunucu=${item.failedResponses.length}`,
  );
}

if (
  problems.some(
    (item) =>
      item.status >= 400 ||
      item.consoleErrors.length > 0 ||
      item.failedResponses.length > 0,
  )
) {
  process.exitCode = 1;
}
