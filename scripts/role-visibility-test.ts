/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const BASE_URL = process.env.ROLE_VISIBILITY_BASE_URL || "http://127.0.0.1:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const password = `Role!${suffix}`;
  const institution = await prisma.institution.create({
    data: { name: `Role Visibility ${suffix}`, email: `role-visibility-${suffix}@example.invalid` },
  });
  const user = await prisma.user.create({
    data: {
      institutionId: institution.id,
      identityNo: `RLE${suffix}`.slice(0, 20),
      fullName: `Rol Test Doktor ${suffix}`,
      passwordHash: await bcrypt.hash(password, 10),
      role: "DOKTOR",
    },
  });
  const patient = await prisma.patient.create({
    data: {
      institutionId: institution.id,
      fullName: `ROL_TEST_HASTA_${suffix}`,
      phone: "5557654321",
      gender: "KADIN",
    },
  });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const login = await context.request.post(`${BASE_URL}/api/auth/login`, {
      data: { institution: institution.name.toUpperCase(), identityNo: user.identityNo, password },
    });
    assert(login.ok(), `Doktor girişi başarısız: ${login.status()} ${await login.text()}`);

    const me = await context.request.get(`${BASE_URL}/api/auth/me`);
    assert(me.ok(), `/api/auth/me başarısız: ${me.status()}`);
    const meJson = await me.json() as { permissions?: string[] };
    assert(meJson.permissions?.includes("earnings:read"), "Doktorun earnings:read izni oturuma yansımadı.");
    assert(!meJson.permissions?.includes("finance:read"), "Doktora finance:read izni sızdı.");
    assert(!meJson.permissions?.includes("patients:phone"), "Doktora patients:phone izni sızdı.");

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/anasayfa`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("main", { timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const homeText = await page.locator("body").innerText();
    assert(!homeText.includes("BUGÜN CİRO") && !homeText.includes("Bugün Ciro"), "Doktor ana sayfasında ciro kartı render edildi.");
    assert(await page.locator('a[href="/muhasebe"]').count() === 0, "Doktor sidebar'ında Muhasebe bağlantısı render edildi.");
    assert(await page.locator('a[href="/finans"]').count() > 0, "Doktor Hakedişim bağlantısı görünmüyor.");

    const financeApi = await context.request.get(`${BASE_URL}/api/finance`);
    assert(financeApi.status() === 403, `Doktor kurum finans API'sine erişebildi: ${financeApi.status()}`);
    const earningsApi = await context.request.get(`${BASE_URL}/api/hakedis?months=1`);
    assert(earningsApi.ok(), `Doktor kendi hakediş API'sine erişemedi: ${earningsApi.status()}`);

    await page.goto(`${BASE_URL}/hasta`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("main", { timeout: 30_000 });
    await page.waitForTimeout(700);
    const patientText = await page.locator("body").innerText();
    assert(!patientText.includes("5557654321"), "Yetkisiz doktor ekranında hasta telefonu göründü.");
    assert(!patientText.includes("Yeni Hasta") && !patientText.includes("Hasta Ekle"), "Doktor ekranında hasta ekleme kontrolü render edildi.");

    const patientApi = await context.request.get(`${BASE_URL}/api/patients/${patient.id}`);
    assert(patientApi.ok(), `Doktor hasta kartını okuyamadı: ${patientApi.status()}`);
    const patientJson = await patientApi.json() as { phone?: string | null };
    assert(patientJson.phone !== patient.phone, "Hasta telefonu API yanıtında maskelenmedi.");

    await page.goto(`${BASE_URL}/muhasebe`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForURL((url) => url.pathname === "/yetkisiz", { timeout: 15_000 });
    assert(!(await page.locator("body").innerText()).includes("Muhasebe Merkezi"), "Yetkisiz muhasebe içeriği yönlendirmeden önce render edildi.");

    await page.goto(`${BASE_URL}/ayar`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForURL((url) => url.pathname === "/yetkisiz", { timeout: 15_000 });
    assert(!(await page.locator("body").innerText()).includes("Klinik Ayarları"), "Yetkisiz ayar içeriği render edildi.");

    await context.close();
    console.log("✓ Doktor görünümü, API alan filtreleri ve doğrudan URL koruması doğrulandı.");
  } finally {
    await browser.close();
    await prisma.patientAccessLog.deleteMany({ where: { patientId: patient.id } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.patient.delete({ where: { id: patient.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.institution.delete({ where: { id: institution.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
