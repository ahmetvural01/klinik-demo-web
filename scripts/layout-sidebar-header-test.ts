/* eslint-disable no-console */
/**
 * Panel layout regresyon testi: sidebar genişlerken (hover) header ve ana
 * içeriğin gerçekten reflow olduğunu, hiçbir viewport'ta sidebar'ın
 * header/içeriği kapatmadığını ve yatay taşma oluşmadığını doğrular.
 *
 * Gerçek tarayıcı (playwright-core + yerel Chrome) ve çalışan bir dev sunucu
 * gerektirir. Kullanım:
 *   npx tsx scripts/layout-sidebar-header-test.ts
 * Ortam değişkenleri (opsiyonel):
 *   LAYOUT_TEST_BASE_URL (varsayılan http://127.0.0.1:3001)
 *   CHROME_PATH (varsayılan "C:\Program Files\Google\Chrome\Application\chrome.exe")
 * Oluşturulan test kullanıcısı sonunda silinir.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.LAYOUT_TEST_BASE_URL || "http://127.0.0.1:3001";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.LAYOUT_TEST_PASSWORD || "changeme";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      identityNo: `9${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "LAYOUT-TEST YONETICI",
      passwordHash: hash,
      role: "YONETICI",
      institutionId: "inst-default",
      isActive: true,
    },
    select: { id: true, identityNo: true },
  });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const viewports = [
      { w: 375, h: 812, name: "mobile" },
      { w: 768, h: 1024, name: "tablet" },
      { w: 1024, h: 768, name: "desktop-sm" },
      { w: 1366, h: 768, name: "desktop-md" },
      { w: 1920, h: 1080, name: "desktop-wide" },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await context.request.post(`${BASE}/api/auth/login`, {
        data: { institution: "whitedental", identityNo: user.identityNo, password: PASSWORD, rememberMe: false },
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/anasayfa`, { waitUntil: "load", timeout: 20000 });
      await page.waitForTimeout(1500);

      // 1) Dinlenme durumunda: yatay taşma yok.
      const overflowAtRest = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert(
        overflowAtRest.scrollWidth <= overflowAtRest.clientWidth + 1,
        `${vp.name}: dinlenme durumunda yatay taşma var (scrollWidth=${overflowAtRest.scrollWidth} clientWidth=${overflowAtRest.clientWidth})`,
      );

      if (vp.w >= 768) {
        // 2) Masaüstünde: sidebar hover ile genişleyince header/main REFLOW olmalı
        // (önceden `absolute` flyout header'ın altındaki banner/içeriği kapatıyordu).
        await page.mouse.move(30, 300);
        await page.waitForTimeout(400);
        const rects = await page.evaluate(() => {
          const header = document.querySelector("header")?.getBoundingClientRect();
          const main = document.querySelector("main")?.getBoundingClientRect();
          return { headerX: header?.x ?? -1, mainX: main?.x ?? -1 };
        });
        assert(rects.headerX >= 250, `${vp.name}: sidebar genişleyince header reflow olmadı (headerX=${rects.headerX}, beklenen >=250)`);
        assert(rects.mainX >= 250, `${vp.name}: sidebar genişleyince ana içerik reflow olmadı (mainX=${rects.mainX}, beklenen >=250)`);

        const overflowExpanded = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        assert(
          overflowExpanded.scrollWidth <= overflowExpanded.clientWidth + 1,
          `${vp.name}: sidebar genişkenken yatay taşma var`,
        );
      }

      await context.close();
      console.log(`✓ ${vp.name} (${vp.w}x${vp.h}): header/sidebar çakışması yok, taşma yok.`);
    }
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }

  console.log("\nTüm layout senaryoları doğrulandı.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
