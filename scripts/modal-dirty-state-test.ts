/* eslint-disable no-console */
/**
 * Ortak Modal bileşeninin (src/components/ui/Modal.tsx) isDirty sözleşmesini
 * gerçek tarayıcıda, Hasta ekleme modalı (PatientFormModal) üzerinden uçtan
 * uca doğrular:
 *  - Temiz formda backdrop tıklaması kapatır.
 *  - Dirty formda backdrop tıklaması KAPATMAZ, veriyi korur, kalıcı uyarı gösterir.
 *  - ESC dirty formda "Değişiklikler kaybolsun mu?" onayı açar: "Forma dön"
 *    veriyi korur, onaydaki Esc yalnız onayı kapatır, "Kapat" pencereyi kapatır.
 *    (Önceden Esc dirty formu onaysız kapatıyordu; canlı H8/H10/H17/H18/O3'te
 *    uzun formlar bu yüzden siliniyordu.)
 *  - Yeni açılışta pencerenin dirty durumu (uyarı şeridi) sızmaz; yarım
 *    kalan yeni hasta taslağı bilerek geri gelir ve "Temizle" ile boşalır.
 *  - Temiz formda ESC onay sormadan kapatır.
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
const BASE = process.env.LAYOUT_TEST_BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.MODAL_TEST_PASSWORD || "changeme";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const branch = await prisma.clinicBranch.findFirstOrThrow({
    where: { institutionId: "inst-default", isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      identityNo: `9${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "MODAL-TEST YONETICI",
      passwordHash: hash,
      role: "YONETICI",
      institutionId: "inst-default",
      isActive: true,
      branchMemberships: { create: { branchId: branch.id, isPrimary: true } },
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
    // Ad soyad alanı pencerenin ilk odak alanıdır (data-autofocus).
    const nameInput = page.locator('[role="dialog"] input[data-autofocus]');
    const testValue = `Modal Dirty Test ${Date.now()}`;
    await nameInput.fill(testValue);
    await page.mouse.click(20, 20);
    await page.waitForTimeout(60);
    const hintVisible = (await page.locator("text=Kaydedilmemiş değişiklik var. Form açık tutuldu.").count()) > 0;
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 1, "Dirty formda backdrop tıklaması modalı kapattı (veri kaybı riski)");
    assert((await nameInput.inputValue()) === testValue, "Backdrop tıklaması sonrası form verisi korunmadı");
    assert((await page.locator('[role="alertdialog"]').count()) === 0, "Backdrop tıklamasında istenmeyen onay diyaloğu açıldı");
    assert(hintVisible, "Dirty backdrop tıklamasında dikkat ipucu gösterilmedi");
    await page.waitForTimeout(900);
    assert((await page.locator("text=Kaydedilmemiş değişiklik var. Form açık tutuldu.").count()) > 0, "Dirty uyarısı kalıcı görünmedi");
    console.log("✓ Dirty formda backdrop tıklaması modalı kapatmıyor, veri korunuyor, kalıcı uyarı görünüyor.");

    // 3) ESC -> onay açar; "Forma dön" veriyi korur
    const confirm = page.locator('[role="alertdialog"]');
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert((await confirm.count()) === 1, "ESC dirty formda onay sormadı (veri kaybı riski)");
    assert((await confirm.innerText()).includes("Değişiklikler kaybolsun mu?"), "Onay metni beklenen gibi değil");
    assert((await dialogCount()) === 1, "Onay açıkken pencere kapandı");
    await confirm.getByRole("button", { name: "Forma dön" }).click();
    await page.waitForTimeout(300);
    assert((await confirm.count()) === 0, "Forma dön onayı kapatmadı");
    assert((await dialogCount()) === 1, "Forma dön pencereyi kapattı");
    assert((await nameInput.inputValue()) === testValue, "Forma dön sonrası form verisi korunmadı");
    console.log("✓ ESC dirty formda onay soruyor; Forma dön veriyi koruyor.");

    // 3b) Onaydaki ESC yalnız onayı kapatır, alttaki pencere açık kalır
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert((await confirm.count()) === 1, "İkinci ESC onay açmadı");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert((await confirm.count()) === 0, "Onaydaki ESC onayı kapatmadı");
    assert((await dialogCount()) === 1, "Onaydaki ESC alttaki pencereyi de kapattı");
    assert((await nameInput.inputValue()) === testValue, "Onaydaki ESC sonrası form verisi korunmadı");
    console.log("✓ Onaydaki ESC yalnız onayı kapatıyor.");

    // 3c) ESC -> onayda "Kapat" pencereyi kapatır
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await confirm.getByRole("button", { name: "Kapat" }).click();
    await page.waitForTimeout(400);
    assert((await confirm.count()) === 0, "Kapat sonrası onay açık kaldı");
    assert((await dialogCount()) === 0, "Onayda Kapat pencereyi kapatmadı");
    console.log("✓ Onayda Kapat dirty pencereyi kapatıyor.");

    // 4) Yeni açılış: pencerenin dirty uyarısı sızmaz; yarım kalan yeni hasta
    // taslağı bilerek geri gelir (PatientFormModal createDraft) ve Temizle ile boşalır.
    await openModal();
    assert((await page.locator("text=Kaydedilmemiş değişiklik var. Form açık tutuldu.").count()) === 0, "Yeni açılışta önceki dirty uyarısı sızdı");
    if ((await page.locator("text=Kaydedilmemiş bilgiler geri getirildi.").count()) > 0) {
      assert((await nameInput.inputValue()) === testValue, "Geri getirilen taslak yazılanı içermiyor");
      await page.getByRole("dialog").getByRole("button", { name: "Temizle" }).click();
      await page.waitForTimeout(200);
    }
    assert((await nameInput.inputValue()) === "", "Yeni modal açılışında form boşaltılamadı");
    await page.mouse.click(20, 20);
    await page.waitForTimeout(400);
    assert((await dialogCount()) === 0, "Temiz yeni açılışta backdrop kapatamadı (regresyon)");
    console.log("✓ Yeni modal açılışında önceki dirty state sızmıyor, regresyon yok.");

    // 5) Temiz formda ESC onay sormadan kapatır
    await openModal();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert((await confirm.count()) === 0, "Temiz formda ESC gereksiz onay açtı");
    assert((await dialogCount()) === 0, "Temiz formda ESC pencereyi kapatmadı");
    console.log("✓ Temiz formda ESC onaysız kapatıyor.");

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
