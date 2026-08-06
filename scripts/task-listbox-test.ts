/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.TASK_TEST_BASE_URL || "http://127.0.0.1:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.TASK_TEST_PASSWORD || "changeme";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function openTaskModal(page: Page) {
  await page.getByRole("button", { name: "Görev Oluştur" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  return dialog;
}

async function verifyListboxes(page: Page, mobile = false) {
  const dialog = await openTaskModal(page);
  const listboxes = dialog.locator('button[role="combobox"]');
  assert(await listboxes.count() === 2, "Görev formunda iki listbox bulunamadı");

  await listboxes.nth(0).click();
  const typeSearch = dialog.getByPlaceholder("Görev türünde ara");
  await typeSearch.fill("lab");
  const typeOptions = dialog.getByRole("listbox").getByRole("option");
  const labOption = typeOptions.filter({ hasText: "Laboratuvar" });
  await labOption.waitFor({ state: "visible" });
  assert(await typeOptions.count() === 1, "Görev türü araması listeyi doğru filtrelemedi");
  await labOption.click();
  assert((await listboxes.nth(0).innerText()).includes("Laboratuvar"), "Görev türü seçimi özete yansımadı");

  await listboxes.nth(1).click();
  const staffSearch = dialog.getByPlaceholder("İsim veya rolle ara");
  await staffSearch.waitFor({ state: "visible" });
  await staffSearch.fill("yönetici");
  assert(await dialog.getByRole("listbox").getByRole("option").count() >= 1, "Personel rol araması sonuç döndürmedi");
  await staffSearch.fill("");
  await dialog.getByRole("button", { name: "Tümünü seç" }).click();
  assert((await listboxes.nth(1).innerText()).includes("Tüm personel"), "Toplu personel seçimi özete yansımadı");

  if (mobile) {
    const popover = dialog.locator(".ui-popover").last();
    const box = await popover.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390, "Personel listbox'ı mobil görünümden taşıyor");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobil sayfada yatay taşma oluştu");
  }

  await dialog.getByRole("button", { name: "Temizle" }).click();
  assert((await listboxes.nth(1).innerText()).includes("Personel seçin"), "Personel seçimini temizleme özete yansımadı");
  await dialog.getByRole("heading", { name: "Yeni Görev" }).click();
  assert(await dialog.getByRole("listbox").count() === 0, "Liste dış alana tıklanınca kapanmadı");

  await dialog.getByRole("button", { name: "İptal" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert(await page.getByRole("alertdialog").count() === 0, "İptal düğmesi gereksiz çıkış onayı açtı");
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const requestKey = `task-listbox-test-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      identityNo: `8${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "TASK LISTBOX TEST YONETICI",
      passwordHash,
      role: "YONETICI",
      institutionId: "inst-default",
      isActive: true,
    },
    select: { id: true, identityNo: true },
  });
  const assignee = await prisma.user.create({
    data: {
      identityNo: `7${String(Date.now() + 1).slice(-10)}`.slice(0, 11),
      fullName: "TASK LISTBOX TEST ASISTAN",
      passwordHash,
      role: "ASISTAN",
      institutionId: "inst-default",
      isActive: true,
    },
    select: { id: true },
  });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { institution: "whitedental", identityNo: user.identityNo, password: PASSWORD, rememberMe: false },
    });
    assert(login.ok(), `Test oturumu açılamadı (${login.status()})`);

    const taskPayload = {
      title: "Toplu atama regresyon testi",
      type: "DIGER",
      priority: 2,
      status: "ACIK",
      assignedToIds: [user.id, assignee.id],
    };
    const firstCreate = await context.request.post(`${BASE}/api/clinic-tasks`, {
      headers: { "Idempotency-Key": requestKey },
      data: taskPayload,
    });
    assert(firstCreate.status() === 201, `Toplu görev oluşturulamadı (${firstCreate.status()})`);
    const firstTask = await firstCreate.json() as { id: string; assignees?: Array<{ userId: string }> };
    assert(firstTask.assignees?.length === 2, "API iki personel atamasını döndürmedi");

    const repeatedCreate = await context.request.post(`${BASE}/api/clinic-tasks`, {
      headers: { "Idempotency-Key": requestKey },
      data: taskPayload,
    });
    assert(repeatedCreate.ok(), `Aynı görev isteği güvenli tekrar edilemedi (${repeatedCreate.status()})`);
    const repeatedTask = await repeatedCreate.json() as { id: string };
    assert(repeatedTask.id === firstTask.id, "Aynı işlem anahtarı ikinci bir görev üretti");
    assert(await prisma.clinicTask.count({ where: { requestKey } }) === 1, "Idempotent görev isteği veritabanında çoğaldı");

    const mineResponse = await context.request.get(`${BASE}/api/clinic-tasks?scope=mine&take=500`);
    const mineTasks = await mineResponse.json() as Array<{ id: string }>;
    assert(mineResponse.ok() && mineTasks.some((task) => task.id === firstTask.id), "Çoklu atanan görev 'Bana Atananlar' listesinde görünmedi");

    const cancelResponse = await context.request.delete(`${BASE}/api/clinic-tasks/${firstTask.id}`);
    assert(cancelResponse.ok(), `Görev iptal edilemedi (${cancelResponse.status()})`);
    const canceled = await prisma.clinicTask.findUnique({ where: { id: firstTask.id }, select: { status: true } });
    assert(canceled?.status === "IPTAL", "Görev iptali kaydı silmeden durum geçmişini korumadı");
    console.log("Toplu atama, idempotent kayıt, kapsam ve iptal API senaryoları doğrulandı.");

    const page = await context.newPage();
    await page.goto(`${BASE}/gorevler`, { waitUntil: "load", timeout: 30_000 });
    await page.getByRole("heading", { name: "Görev Merkezi" }).waitFor({ state: "visible" });
    await verifyListboxes(page);
    console.log("Masaüstü görev listbox senaryoları doğrulandı.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("heading", { name: "Görev Merkezi" }).waitFor({ state: "visible" });
    await verifyListboxes(page, true);
    console.log("Mobil görev listbox ve taşma senaryoları doğrulandı.");

    await context.close();
  } finally {
    await browser?.close();
    await prisma.clinicTask.deleteMany({ where: { requestKey } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [user.id, assignee.id] } } }).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
