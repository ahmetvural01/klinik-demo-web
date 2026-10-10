/* eslint-disable no-console */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const baseUrl = process.env.WHATSAPP_TEST_BASE_URL || "http://localhost:3000";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.resolve("tmp", "whatsapp-entitlement");

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Wa!${suffix}`;
  const institution = await prisma.institution.create({
    data: {
      name: `WhatsApp Yetki Test ${suffix}`,
      email: `wa-entitlement-${suffix}@example.invalid`,
      whatsappEnabled: false,
    },
  });
  const branch = await prisma.clinicBranch.create({
    data: {
      institutionId: institution.id,
      name: "Merkez Şube",
      slug: `wa-merkez-${suffix}`,
      isHeadquarters: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      institutionId: institution.id,
      identityNo: `WA${suffix}`.slice(0, 20),
      fullName: "WhatsApp Yetki Test Yöneticisi",
      passwordHash: await bcrypt.hash(password, 10),
      role: "YONETICI",
      branchMemberships: {
        create: [{ branchId: branch.id, isPrimary: true }],
      },
    },
  });

  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
    const login = await context.request.post(`${baseUrl}/api/auth/login`, {
      data: { institution: institution.name, identityNo: user.identityNo, password },
    });
    assert(login.ok(), `Klinik girişi başarısız: ${login.status()} ${await login.text()}`);

    const capabilitiesOff = await context.request.get(`${baseUrl}/api/capabilities`);
    assert(capabilitiesOff.ok());
    assert.equal((await capabilitiesOff.json()).features.whatsapp, false);
    assert.equal((await context.request.get(`${baseUrl}/api/whatsapp/provider`)).status(), 403);
    assert.equal((await context.request.get(`${baseUrl}/api/whatsapp/messages`)).status(), 403);

    const page = await context.newPage();
    await page.goto(`${baseUrl}/sms`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
    // Güncel İletişim sekmeleri: Mesaj gönder · Otomatik mesajlar · Gönderim geçmişi ·
    // Kanal ve kredi. WhatsApp sohbet ("Görüşmeler") sekmesi hiç yok; WhatsApp
    // bağlantısı "Kanal ve kredi" içindeki "WhatsApp" bölümüdür (#whatsapp-baglanti).
    assert.equal(await page.getByRole("tab", { name: "Görüşmeler", exact: true }).count(), 0);
    await page.getByRole("tab", { name: "Kanal ve kredi", exact: true }).click();
    await page.getByText("SMS gönderimi", { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(await page.locator("#whatsapp-baglanti").count(), 0, "WhatsApp kapalı klinikte bağlantı bölümü görünmemeli.");
    assert.equal(await page.getByText("Gönderim kanalı", { exact: true }).count(), 0, "WhatsApp kapalı klinikte kanal seçimi görünmemeli.");
    await page.screenshot({ path: path.join(outputDir, "01-disabled-sms.png"), fullPage: true });

    await page.goto(`${baseUrl}/ayar?tab=whatsapp`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
    assert.equal(await page.getByRole("tab", { name: "WhatsApp", exact: true }).count(), 0);
    await page.waitForURL((url) => !url.searchParams.has("tab"), { timeout: 15_000 });
    assert(!page.url().includes("tab=whatsapp"), "Kapalı özellik doğrudan URL ile açılamamalı.");

    await prisma.institution.update({ where: { id: institution.id }, data: { whatsappEnabled: true } });
    await page.goto(`${baseUrl}/sms`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("tab", { name: "Kanal ve kredi", exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(await page.getByRole("tab", { name: "Otomatik mesajlar", exact: true }).count(), 1, "WhatsApp açıldığında ortak otomatik mesajlar kaybolmamalı.");
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "Otomatik mesajlar", exact: true }).click();
    await page.getByText("Ödeme hatırlatmaları", { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, "02-enabled-automations.png"), fullPage: true });
    // Eski "Şablonlar" sekmesi: mesaj metinleri artık Otomatik mesajlar satırlarında ("Metin").
    await page.getByText("Randevu bilgilendirme", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Metin", exact: true }).first().waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, "03-templates.png"), fullPage: true });
    // Eski "Kutlama Günleri" sekmesi: Otomatik mesajlar › "Bayram ve özel günler" › Yönet.
    await page.getByRole("button", { name: "Yönet", exact: true }).click();
    const celebrations = page.getByRole("dialog", { name: "Bayram ve özel günler" });
    await celebrations.waitFor({ timeout: 30_000 });
    await celebrations.getByText("Yılbaşı", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, "04-celebrations.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await celebrations.waitFor({ state: "detached", timeout: 15_000 });
    // Eski "Toplu Gönderim" sekmesi: "Mesaj gönder"; özel gün metinleri "Hazır metin" listesinde.
    await page.getByRole("tab", { name: "Mesaj gönder", exact: true }).click();
    await page.getByText("Kime", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("option", { name: /Yılbaşı/ }).first().waitFor({ state: "attached", timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, "05-bulk.png"), fullPage: true });
    // Eski "WhatsApp Bağlantısı" sekmesi: "Kanal ve kredi" › WhatsApp bölümü.
    await page.getByRole("tab", { name: "Kanal ve kredi", exact: true }).click();
    await page.locator("#whatsapp-baglanti").waitFor({ timeout: 30_000 });
    assert.equal(await page.getByText("Meta WhatsApp ortam yapılandırması tamamlanmamış.", { exact: true }).count(), 0);
    await page.getByText("Kliniğinizin WhatsApp numarasını bağlayın; mesajlar bu numaradan gider. Kurumsal numara gerekmez.", { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(await page.getByLabel("WhatsApp Business Hesap ID").count(), 0);
    assert.equal(await page.getByLabel("Telefon Numarası ID").count(), 0);
    const providerState = await context.request.get(`${baseUrl}/api/whatsapp/provider`);
    assert(providerState.ok());
    const providerData = await providerState.json();
    assert.equal(providerData.canManageConnection, true);
    // Bağlantı QR kodu / telefon numarasıyla kurulur; düğme yöneticiye her zaman görünür.
    await page.getByRole("button", { name: "QR kodu göster", exact: true }).waitFor({ timeout: 30_000 });
    const signupStart = await context.request.post(`${baseUrl}/api/whatsapp/embedded-signup`, { data: { action: "start" } });
    assert.equal(signupStart.status(), providerData.platformReady ? 200 : 503, "Yönetici gerçek Embedded Signup başlangıç noktasına ulaşmalı.");
    await page.screenshot({ path: path.join(outputDir, "06-enabled-platform-pending.png"), fullPage: true });

    await prisma.institution.update({ where: { id: institution.id }, data: { whatsappEnabled: false } });
    await page.evaluate(() => window.dispatchEvent(new Event("institution-features-change")));
    await page.locator("#whatsapp-baglanti").waitFor({ state: "detached", timeout: 15_000 });
    assert.equal((await context.request.get(`${baseUrl}/api/whatsapp/provider`)).status(), 403);

    await context.close();
    console.log(`WhatsApp özellik görünürlüğü doğrulandı: ${outputDir}`);
  } finally {
    await browser.close();
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.userBranch.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.institution.delete({ where: { id: institution.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
