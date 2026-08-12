/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Page } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.UI_NETWORK_TEST_BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.UI_NETWORK_TEST_PASSWORD || "changeme";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectRetryableFailure(page: Page, options: {
  tab: "pos" | "tedavi";
  apiPath: string;
  inputPlaceholder: string;
  buttonName: string;
  value: string;
  expectedMessage: string;
}) {
  await page.goto(`${BASE}/ayar?tab=${options.tab}`, { waitUntil: "load", timeout: 60_000 });
  await page.getByRole("heading", { name: "Ayarlar" }).waitFor({ state: "visible", timeout: 60_000 });

  await page.route(`**${options.apiPath}`, async (route) => {
    if (route.request().method() === "POST") await route.abort("internetdisconnected");
    else await route.continue();
  });

  const input = page.getByPlaceholder(options.inputPlaceholder);
  const button = page.getByRole("button", { name: options.buttonName });
  await input.fill(options.value);
  await button.click();

  const alert = page.getByRole("alert").filter({ hasText: options.expectedMessage });
  await alert.waitFor({ state: "visible", timeout: 10_000 });
  await button.waitFor({ state: "visible" });

  assert(await button.isEnabled(), `${options.buttonName} bağlantı hatasından sonra kilitli kaldı`);
  assert((await input.inputValue()) === options.value, `${options.buttonName} başarısız olduğunda girilen veri kayboldu`);
  await page.unroute(`**${options.apiPath}`);
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const branch = await prisma.clinicBranch.findFirstOrThrow({
    where: { institutionId: "inst-default", isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      identityNo: `6${String(Date.now()).slice(-10)}`.slice(0, 11),
      fullName: "UI NETWORK TEST YONETICI",
      passwordHash,
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
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { institution: "whitedental", identityNo: user.identityNo, password: PASSWORD, rememberMe: false },
    });
    assert(login.ok(), `Test oturumu açılamadı (${login.status()})`);

    const page = await context.newPage();
    await expectRetryableFailure(page, {
      tab: "pos",
      apiPath: "/api/pos-devices",
      inputPlaceholder: "Cihaz adı (örn: İşbankası POS, Vakıfbank POS…)",
      buttonName: "POS Ekle",
      value: `Ağ Test POS ${Date.now()}`,
      expectedMessage: "Bağlantınızı kontrol edin",
    });
    console.log("✓ POS ekleme bağlantı hatasında kilitlenmiyor ve form verisini koruyor.");

    await expectRetryableFailure(page, {
      tab: "tedavi",
      apiPath: "/api/treatment-types",
      inputPlaceholder: "Tedavi adı (örn: Diş Beyazlatma)",
      buttonName: "Tedavi Ekle",
      value: `Ağ Test Tedavi ${Date.now()}`,
      expectedMessage: "Bağlantınızı kontrol edin",
    });
    console.log("✓ Tedavi türü ekleme bağlantı hatasında kilitlenmiyor ve form verisini koruyor.");

    await context.close();
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }

  console.log("\nTüm ağ hatası ve yeniden deneme senaryoları doğrulandı.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
