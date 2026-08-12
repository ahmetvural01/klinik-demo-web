/* eslint-disable no-console */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const baseUrl = process.env.WHATSAPP_TEST_BASE_URL || "http://localhost:3000";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.resolve("tmp", "whatsapp-connection-management");

async function login(request: import("playwright-core").APIRequestContext, institution: string, identityNo: string, password: string) {
  const response = await request.post(`${baseUrl}/api/auth/login`, {
    data: { institution, identityNo, password },
  });
  assert(response.ok(), `Giriş başarısız: ${response.status()} ${await response.text()}`);
}

async function loginSuperadmin(request: import("playwright-core").APIRequestContext, identityNo: string, password: string) {
  const response = await request.post(`${baseUrl}/api/auth/superadmin/login`, {
    data: { identityNo, password },
  });
  assert(response.ok(), `Süperadmin girişi başarısız: ${response.status()} ${await response.text()}`);
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Wa!${suffix}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const institution = await prisma.institution.create({
    data: {
      name: `WhatsApp Bağlantı Test ${suffix}`,
      email: `wa-connect-${suffix}@example.invalid`,
      whatsappEnabled: true,
    },
  });
  const branch = await prisma.clinicBranch.create({
    data: { institutionId: institution.id, name: "Merkez Şube", slug: `wa-connect-${suffix}`, isHeadquarters: true },
  });
  const manager = await prisma.user.create({
    data: {
      institutionId: institution.id,
      identityNo: `WAM${suffix}`.slice(0, 20),
      fullName: "WhatsApp Bağlantı Yöneticisi",
      passwordHash,
      role: "YONETICI",
      branchMemberships: { create: [{ branchId: branch.id, isPrimary: true }] },
    },
  });
  const assistant = await prisma.user.create({
    data: {
      institutionId: institution.id,
      identityNo: `WAA${suffix}`.slice(0, 20),
      fullName: "WhatsApp Bağlantı Asistanı",
      passwordHash,
      role: "ASISTAN",
      branchMemberships: { create: [{ branchId: branch.id, isPrimary: true }] },
    },
  });
  const superadmin = await prisma.user.create({
    data: {
      identityNo: `WAS${suffix}`.slice(0, 20),
      fullName: "WhatsApp Geçiş Süperadmini",
      email: `wa-superadmin-${suffix}@example.invalid`,
      passwordHash,
      role: "SUPERADMIN",
    },
  });

  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const managerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
    await login(managerContext.request, institution.name, manager.identityNo, password);
    const state = await managerContext.request.get(`${baseUrl}/api/whatsapp/provider`);
    assert(state.ok());
    const stateData = await state.json();
    assert.equal(stateData.canManageConnection, true);
    const signupStart = await managerContext.request.post(`${baseUrl}/api/whatsapp/embedded-signup`, { data: { action: "start" } });
    assert.equal(signupStart.status(), stateData.platformReady ? 200 : 503, "Yönetici gerçek Embedded Signup başlangıç noktasına ulaşmalı.");

    const page = await managerContext.newPage();
    await page.goto(`${baseUrl}/sms?tab=baglanti`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const deepLinkedTab = page.getByRole("tab", { name: "WhatsApp Bağlantısı", exact: true });
    await deepLinkedTab.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("WhatsApp Bağlantısı"));
    await page.getByText("WhatsApp Business numaranızı bağlayın", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("API bilgisi, erişim anahtarı veya teknik kurulum gerekmez.", { exact: true }).waitFor();
    const connectButton = page.getByRole("button", { name: "Numaramı Bağla", exact: true });
    if (stateData.platformReady) {
      assert.equal(await connectButton.isEnabled(), true, "Hazır platformda gerçek bağlantı düğmesi etkin olmalı.");
    } else {
      assert.equal(await connectButton.count(), 0, "Başlatılamayan bağlantı için çalışmayan bir düğme gösterilmemeli.");
      await page.getByText("Numara bağlama hizmeti şu anda kullanılamıyor.", { exact: true }).waitFor();
    }
    assert.equal(await page.getByLabel("WhatsApp Business Hesap ID").count(), 0);
    assert.equal(await page.getByLabel("Telefon Numarası ID").count(), 0);
    assert.equal(await page.getByText("Meta Uygulama Sırrı", { exact: true }).count(), 0);
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), true, "Bağlantı kartı yatay taşmamalı.");
    await page.screenshot({ path: path.join(outputDir, "manager-embedded-signup.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), true, "Mobil bağlantı kartı yatay taşmamalı.");
    await page.screenshot({ path: path.join(outputDir, "manager-embedded-signup-mobile.png"), fullPage: true });

    await prisma.whatsappProviderConfig.upsert({
      where: { institutionId_code: { institutionId: institution.id, code: "META_EMBEDDED" } },
      create: {
        institutionId: institution.id,
        code: "META_EMBEDDED",
        name: "Test Klinik WhatsApp",
        providerType: "META_CLOUD",
        isActive: true,
        connectionStatus: "CONNECTED",
        businessAccountId: `waba-${suffix}`,
        phoneNumberId: `phone-${suffix}`,
        verifiedName: "Test Ağız ve Diş Sağlığı",
        displayPhoneNumber: "+90 532 123 45 67",
      },
      update: {
        isActive: true,
        connectionStatus: "CONNECTED",
        verifiedName: "Test Ağız ve Diş Sağlığı",
        displayPhoneNumber: "+90 532 123 45 67",
      },
    });
    const connectedState = await managerContext.request.get(`${baseUrl}/api/whatsapp/provider`);
    assert(connectedState.ok());
    const connectedStateData = await connectedState.json();
    assert.equal(connectedStateData.provider?.connectionStatus, "CONNECTED");
    assert.equal(connectedStateData.provider?.isActive, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/sms?tab=baglanti`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("WhatsApp Bağlantısı"));
    await page.getByText("WhatsApp hesabınız kullanıma hazır.", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("Test Ağız ve Diş Sağlığı", { exact: true }).waitFor();
    await page.getByText("+90 532 123 45 67", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Test Mesajı Gönder", exact: true }).waitFor();
    await page.getByRole("button", { name: "Bağlantıyı Kes", exact: true }).waitFor();
    assert.equal(await page.getByText(/WABA|Phone Number|Access Token|App Secret/).count(), 0, "Bağlı hesap ekranı teknik kimlik göstermemeli.");
    await page.screenshot({ path: path.join(outputDir, "manager-connected-account.png"), fullPage: true });
    await managerContext.close();

    const assistantContext = await browser.newContext({ locale: "tr-TR" });
    await login(assistantContext.request, institution.name, assistant.identityNo, password);
    const denied = await assistantContext.request.post(`${baseUrl}/api/whatsapp/embedded-signup`, { data: { action: "start" } });
    assert.equal(denied.status(), 403, "Yönetici olmayan personel bağlantı kuramamalı.");
    await assistantContext.close();

    await prisma.whatsappProviderConfig.deleteMany({ where: { institutionId: institution.id } });
    await prisma.institution.update({ where: { id: institution.id }, data: { whatsappEnabled: false } });
    const superadminContext = await browser.newContext({ locale: "tr-TR" });
    await loginSuperadmin(superadminContext.request, superadmin.identityNo, password);
    const saveResponse = await superadminContext.request.put(`${baseUrl}/api/superadmin/institutions/${institution.id}`, {
      data: { whatsappEnabled: true },
    });
    assert(saveResponse.ok(), `Klinik WhatsApp erişimi kaydedilemedi: ${saveResponse.status()} ${await saveResponse.text()}`);
    assert.equal((await prisma.institution.findUniqueOrThrow({ where: { id: institution.id }, select: { whatsappEnabled: true } })).whatsappEnabled, true, "Klinik WhatsApp erişimi platform ayarından bağımsız kaydedilmeli.");
    await superadminContext.close();

    console.log(`WhatsApp Embedded Signup rolü ve sade bağlantı kartı doğrulandı: ${outputDir}`);
  } finally {
    await browser.close();
    await prisma.auditLog.deleteMany({ where: { userId: { in: [manager.id, assistant.id, superadmin.id] } } });
    await prisma.userBranch.deleteMany({ where: { userId: { in: [manager.id, assistant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [manager.id, assistant.id, superadmin.id] } } });
    await prisma.institution.delete({ where: { id: institution.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
