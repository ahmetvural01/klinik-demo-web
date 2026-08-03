/* eslint-disable no-console */
/**
 * Ortak Modal bileşeninin (src/components/ui/Modal.tsx) isDirty sözleşmesini
 * gerçek tarayıcıda, Hasta ekleme modalı (PatientFormModal) üzerinden uçtan
 * uca doğrular:
 *  - Temiz formda backdrop tıklaması kapatır.
 *  - Dirty formda backdrop tıklaması KAPATMAZ, veriyi korur, dikkat vurgusu gösterir.
 *  - ESC dirty formda onay ister; "Düzenlemeye Devam Et" veriyi korur.
 *  - "Değişiklikleri Sil ve Çık" gerçekten kapatır.
 *  - Yeni açılışta önceki dirty state sızmaz (regresyon yok).
 *
 * Gerçek tarayıcı (playwright-core + yerel Chrome) ve çalışan bir dev sunucu
 * gerektirir. Kullanım:
 *   npx tsx scripts/modal-dirty-state-test.ts
 * Oluşturulan test kullanıcısı sonunda silinir.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.LAYOUT_TEST_BASE_URL || "http://127.0.0.1:3001";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "ModalTest!2026";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      identityNo: `9${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "MODAL-TEST YONETICI",
      passwordHash: hash,
      role: "YONETICI",
      institutionId: "inst-default",
      isActive: true,
    },
    select: { id: true, identityNo: true },
  });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.request.post(`${BASE}/api/auth/login`, {
      data: { institution: "whitedental", identityNo: user.identityNo, password: PASSWORD, rememberMe: false },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/hasta`, { waitUntil: "load", timeout: 20000 });
    await page.waitForTimeout(1200);

    const openModal = async () => {
      await page.locator("button", { hasText: "Yeni Hasta" }).first().click();
      await page.waitForTimeout(500);
    };
    const dialogCount = () => page.locator('[role="dialog"]').count();

    // 1) Temiz form + backdrop -> kapanır
    await openModal();
    assert((await dialogCount()) === 1, "Modal açılmadı");
    await page.mouse.click(20, 20);
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 0, "Temiz formda backdrop tıklaması modalı kapatmadı");
    console.log("✓ Temiz formda backdrop tıklaması modalı kapatıyor.");

    // 2) Dirty form + backdrop -> KAPANMAZ, veri korunur
    await openModal();
    const nameInput = page.locator('input[placeholder="Ad Soyad"]');
    const testValue = `Modal Dirty Test ${Date.now()}`;
    await nameInput.fill(testValue);
    await page.mouse.click(20, 20);
    await page.waitForTimeout(60);
    const hintVisible = (await page.locator("text=Kaydedilmemiş değişiklikleriniz var.").count()) > 0;
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 1, "Dirty formda backdrop tıklaması modalı kapattı (veri kaybı riski)");
    assert((await nameInput.inputValue()) === testValue, "Backdrop tıklaması sonrası form verisi korunmadı");
    assert((await page.locator('[role="alertdialog"]').count()) === 0, "Backdrop tıklamasında istenmeyen onay diyaloğu açıldı");
    assert(hintVisible, "Dirty backdrop tıklamasında dikkat ipucu gösterilmedi");
    console.log("✓ Dirty formda backdrop tıklaması modalı kapatmıyor, veri korunuyor, onay diyaloğu açılmıyor.");

    // 3) ESC -> onay iste; "Düzenlemeye Devam Et" -> modal açık kalır, veri korunur
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert((await page.locator('[role="alertdialog"]').count()) === 1, "ESC dirty formda onay diyaloğu açmadı");
    await page.locator('[role="alertdialog"] button', { hasText: "Düzenlemeye Devam Et" }).click();
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 1, "'Düzenlemeye Devam Et' sonrası modal kapandı");
    assert((await nameInput.inputValue()) === testValue, "'Düzenlemeye Devam Et' sonrası form verisi korunmadı");
    console.log("✓ ESC onay ister, 'Düzenlemeye Devam Et' formu ve odağı korur.");

    // 4) ESC tekrar -> "Değişiklikleri Sil ve Çık" -> gerçekten kapanır
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.locator('[role="alertdialog"] button', { hasText: "Değişiklikleri Sil ve Çık" }).click();
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 0, "'Değişiklikleri Sil ve Çık' sonrası modal kapanmadı");
    console.log("✓ 'Değişiklikleri Sil ve Çık' modalı gerçekten kapatıyor.");

    // 5) Yeni açılış: önceki dirty veri sızmamalı, backdrop yine kapatabilmeli
    await openModal();
    assert((await nameInput.inputValue()) === "", "Yeni modal açılışında önceki dirty veri sızdı");
    await page.mouse.click(20, 20);
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 0, "Temiz yeni açılışta backdrop kapatamadı (regresyon)");
    console.log("✓ Yeni modal açılışında önceki dirty state sızmıyor, regresyon yok.");

    await context.close();
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }

  console.log("\nTüm modal dirty-state senaryoları doğrulandı.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
