/* eslint-disable no-console */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { request as playwrightRequest } from "playwright-core";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

/**
 * İlk 9 haneden algoritmaya uygun TC kimlik no üretir (10. ve 11. kontrol
 * haneleri; bkz. src/lib/tc-kimlik.ts). Personel düzenleme ucu (PUT) da yeni
 * yazılan TC'yi algoritmayla denetler; rastgele 11 hane artık 400 alır.
 */
function validIdentity(firstNine: string) {
  const digits = Array.from(firstNine, Number);
  const odd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const even = digits[1] + digits[3] + digits[5] + digits[7];
  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  const eleventh = (digits.reduce((sum, digit) => sum + digit, 0) + tenth) % 10;
  return `${firstNine}${tenth}${eleventh}`;
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const adminIdentity = `8${suffix.slice(-10)}`;
  const targetIdentity = `7${suffix.slice(-10)}`;
  const changedIdentity = validIdentity(`6${suffix.slice(-8)}`);
  const adminPassword = `Admin!${suffix}`;
  const oldPassword = `Old!${suffix}`;
  const newPassword = `New!${suffix}`;
  const institution = await prisma.institution.create({ data: { name: `Kimlik Test ${suffix}`, email: `credential-${suffix}@example.invalid` } });
  const branch = await prisma.clinicBranch.create({ data: { institutionId: institution.id, name: "Merkez Şube", slug: `credential-${suffix}`, isHeadquarters: true } });
  const [admin, target] = await Promise.all([
    prisma.user.create({ data: { institutionId: institution.id, identityNo: adminIdentity, fullName: "Kimlik Test Yöneticisi", role: "YONETICI", passwordHash: await bcrypt.hash(adminPassword, 10), branchMemberships: { create: { branchId: branch.id, isPrimary: true } } } }),
    prisma.user.create({ data: { institutionId: institution.id, identityNo: targetIdentity, fullName: "Giriş Test Yöneticisi", role: "YONETICI", passwordHash: await bcrypt.hash(oldPassword, 10), branchMemberships: { create: { branchId: branch.id, isPrimary: true } } } }),
  ]);
  const context = await playwrightRequest.newContext({ baseURL: baseUrl });

  try {
    const adminLogin = await context.post("/api/auth/login", { data: { institution: institution.name, identityNo: adminIdentity, password: adminPassword } });
    assert(adminLogin.ok(), `Yönetici girişi başarısız: ${adminLogin.status()} ${await adminLogin.text()}`);

    const update = await context.put(`/api/staff/${target.id}`, { data: { identityNo: changedIdentity, password: newPassword } });
    assert(update.ok(), `Kimlik bilgisi güncellenemedi: ${update.status()} ${await update.text()}`);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(stored.identityNo, changedIdentity);
    assert(await bcrypt.compare(newPassword, stored.passwordHash), "Yeni şifre hash'i kaydedilmedi.");
    assert(!(await bcrypt.compare(oldPassword, stored.passwordHash)), "Eski şifre geçerliliğini korumamalı.");

    const targetContext = await playwrightRequest.newContext({ baseURL: baseUrl });
    try {
      const targetLogin = await targetContext.post("/api/auth/login", { data: { institution: institution.name, identityNo: changedIdentity, password: newPassword } });
      assert(targetLogin.ok(), `Güncellenen bilgilerle giriş başarısız: ${targetLogin.status()} ${await targetLogin.text()}`);
    } finally {
      await targetContext.dispose();
    }
    console.log("Personel TC/şifre güncelleme ve gerçek giriş kontrolü başarılı.");
  } finally {
    await context.dispose();
    await prisma.auditLog.deleteMany({ where: { userId: { in: [admin.id, target.id] } } });
    await prisma.userBranch.deleteMany({ where: { userId: { in: [admin.id, target.id] } } });
    await prisma.profile.deleteMany({ where: { userId: { in: [admin.id, target.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, target.id] } } });
    await prisma.institution.delete({ where: { id: institution.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
