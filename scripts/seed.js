#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required for seeding.`);
  }
  return value;
}

async function main() {
  try {
    console.log("📊 Seed başlıyor...");
    const institutionName = process.env.DEMO_INSTITUTION_NAME || "demo-klinik";
    const institutionEmail = process.env.DEMO_INSTITUTION_EMAIL || "demo@local.test";
    const institutionWebsite = process.env.DEMO_INSTITUTION_WEBSITE || "www.demo.local";
    const demoAdminIdentity = process.env.DEMO_ADMIN_IDENTITY || "00000000000";
    const demoAdminFullName = process.env.DEMO_ADMIN_FULL_NAME || "Demo Kullanici";
    
    // 1. Kurum oluştur
    const inst = await prisma.institution.create({
      data: {
        id: require("crypto").randomUUID(),
        name: institutionName,
        email: institutionEmail,
        phone: "05306375370",
        address: "Cukurova / Adana",
        subscriptionPlan: "PROFESYONEL",
        smsBalance: 100,
        isActive: true,
      }
    });
    console.log(`✓ Kurum oluşturuldu: ${inst.name}`);

    // 2. Admin kullanıcı oluştur
    const hash = await bcrypt.hash(requireEnv("DEMO_ADMIN_PASSWORD"), 10);
    const user = await prisma.user.create({
      data: {
        id: require("crypto").randomUUID(),
        identityNo: demoAdminIdentity,
        institutionId: inst.id,
        fullName: demoAdminFullName,
        role: "YONETICI",
        passwordHash: hash,
        isActive: true,
      }
    });
    console.log(`✓ Admin kullanıcı oluşturuldu: ${user.fullName}`);

    // 3. Setting oluştur
    const setting = await prisma.setting.create({
      data: {
        id: require("crypto").randomUUID(),
        institutionId: inst.id,
        institutionName: "Adana White Dental Clinic",
        institutionAddress: "Cukurova / Adana",
        institutionPhone: "05306375370",
        institutionWebsite,
        openingTime: "08:30",
        closingTime: "23:59",
        appointmentDuration: 15,
      }
    });
    console.log("✓ Ayarlar oluşturuldu");

    console.log("\n✅ Seed başarılı!");
    console.log("📝 Giriş bilgileri:");
    console.log(`   Kurum: ${institutionName}`);
    console.log(`   TC: ${demoAdminIdentity}`);
    console.log("   Şifre: DEMO_ADMIN_PASSWORD");

  } catch (error) {
    console.error("❌ Seed hatası:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
