/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.TASK_TEST_BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.TASK_TEST_PASSWORD || "changeme";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function openTaskModal(page: Page) {
  const createButton = page.getByRole("button", { name: "Yeni Görev", exact: true });
  await createButton.waitFor({ state: "visible", timeout: 60_000 });
  await createButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 60_000 });
  return dialog;
}

async function verifyListboxes(page: Page, mobile = false) {
  const dialog = await openTaskModal(page);
  // Görev türü beş seçenekli düz açılır liste; sorumlu seçimi aramalı çoklu listbox.
  const typeSelect = dialog.locator("select#task-type");
  await typeSelect.selectOption("LAB");
  assert(await typeSelect.inputValue() === "LAB", "Görev türü seçimi uygulanmadı");

  const listboxes = dialog.locator('button[role="combobox"]');
  assert(await listboxes.count() === 1, "Görev formunda sorumlu listbox'ı bulunamadı");
  const staffListbox = listboxes.nth(0);
  await staffListbox.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const combobox = document.querySelector('[role="dialog"] button[role="combobox"]');
    return Boolean(combobox && !(combobox as HTMLButtonElement).disabled && combobox.textContent?.includes("(ben)"));
  }, undefined, { timeout: 60_000 });
  assert((await staffListbox.innerText()).includes("(ben)"), "Yeni görev varsayılan olarak açan kişiye atanmadı");

  await staffListbox.click();
  const staffSearch = dialog.getByPlaceholder("İsim veya rolle ara");
  await staffSearch.waitFor({ state: "visible" });
  await staffSearch.fill("yönetici");
  assert(await dialog.getByRole("listbox").getByRole("option").count() >= 1, "Personel rol araması sonuç döndürmedi");
  await staffSearch.fill("");
  await dialog.getByRole("button", { name: "Tümünü seç" }).click();
  assert((await staffListbox.innerText()).includes("Tüm personel"), "Toplu personel seçimi özete yansımadı");

  if (mobile) {
    const popover = dialog.locator(".ui-popover").last();
    const box = await popover.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390, "Personel listbox'ı mobil görünümden taşıyor");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobil sayfada yatay taşma oluştu");
  }

  await dialog.getByRole("button", { name: "Temizle" }).click();
  assert((await staffListbox.innerText()).includes("Personel seçin"), "Personel seçimini temizleme özete yansımadı");
  await dialog.getByRole("heading", { name: "Yeni Görev" }).click();
  assert(await dialog.getByRole("listbox").count() === 0, "Liste dış alana tıklanınca kapanmadı");

  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert(await page.getByRole("alertdialog").count() === 0, "Vazgeç düğmesi gereksiz çıkış onayı açtı");
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const requestKey = `task-listbox-test-${Date.now()}`;
  const branch = await prisma.clinicBranch.findFirstOrThrow({
    where: { institutionId: "inst-default", isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      identityNo: `8${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "TASK LISTBOX TEST YONETICI",
      passwordHash,
      role: "YONETICI",
      institutionId: "inst-default",
      isActive: true,
      branchMemberships: { create: { branchId: branch.id, isPrimary: true } },
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
      branchMemberships: { create: { branchId: branch.id, isPrimary: true } },
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

    // Kimseye atanmadan açılan görev, açan kişinin "Benim işlerim" (involved) listesinde görünmeli.
    const unassignedCreate = await context.request.post(`${BASE}/api/clinic-tasks`, {
      headers: { "Idempotency-Key": `${requestKey}-unassigned` },
      data: { title: "Atanmamış görev regresyon testi", type: "DIGER", priority: 2, status: "ACIK", assignedToIds: [] },
    });
    assert(unassignedCreate.status() === 201, `Atanmamış görev oluşturulamadı (${unassignedCreate.status()})`);
    const unassignedTask = await unassignedCreate.json() as { id: string };
    const involvedResponse = await context.request.get(`${BASE}/api/clinic-tasks?scope=involved&take=500&status=ACIK,BEKLEMEDE`);
    const involvedTasks = await involvedResponse.json() as Array<{ id: string }>;
    assert(involvedResponse.ok() && involvedTasks.some((task) => task.id === unassignedTask.id), "Atanmamış görev açan kişinin listesinde görünmedi");
    const mineAgain = await (await context.request.get(`${BASE}/api/clinic-tasks?scope=mine&take=500`)).json() as Array<{ id: string }>;
    assert(!mineAgain.some((task) => task.id === unassignedTask.id), "'mine' kapsamı (uyarı zili) atanmamış görevi saymamalı");
    const cancelUnassigned = await context.request.put(`${BASE}/api/clinic-tasks/${unassignedTask.id}`, { data: { status: "IPTAL" } });
    assert(cancelUnassigned.ok(), `Atanmamış görev iptal edilemedi (${cancelUnassigned.status()})`);

    const cancelResponse = await context.request.delete(`${BASE}/api/clinic-tasks/${firstTask.id}`);
    assert(cancelResponse.ok(), `Görev iptal edilemedi (${cancelResponse.status()})`);
    const canceled = await prisma.clinicTask.findUnique({ where: { id: firstTask.id }, select: { status: true } });
    assert(canceled?.status === "IPTAL", "Görev iptali kaydı silmeden durum geçmişini korumadı");
    console.log("Toplu atama, idempotent kayıt, kapsam ve iptal API senaryoları doğrulandı.");

    const page = await context.newPage();
    await page.goto(`${BASE}/gorevler`, { waitUntil: "load", timeout: 60_000 });
    await page.getByRole("heading", { name: "Görevler", level: 1 }).waitFor({ state: "visible" });
    await verifyListboxes(page);
    console.log("Masaüstü görev listbox senaryoları doğrulandı.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("heading", { name: "Görevler", level: 1 }).waitFor({ state: "visible" });
    await verifyListboxes(page, true);
    console.log("Mobil görev listbox ve taşma senaryoları doğrulandı.");

    await context.close();
  } finally {
    await browser?.close();
    await prisma.clinicTask.deleteMany({ where: { requestKey: { in: [requestKey, `${requestKey}-unassigned`] } } }).catch(() => {});
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
