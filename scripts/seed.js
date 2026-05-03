#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("📊 Seed başlıyor...");
    
    // 1. Kurum oluştur
    const inst = await prisma.institution.create({
      data: {
        id: require("crypto").randomUUID(),
        name: "whitedental",
        email: "info@whitedental.com",
        phone: "05306375370",
        address: "Cukurova / Adana",
        subscriptionPlan: "PROFESYONEL",
        smsBalance: 100,
        isActive: true,
      }
    });
    console.log(`✓ Kurum oluşturuldu: ${inst.name}`);

    // 2. Admin kullanıcı oluştur
    const hash = await bcrypt.hash("10711453", 10);
    const user = await prisma.user.create({
      data: {
        id: require("crypto").randomUUID(),
        identityNo: "10000000001",
        institutionId: inst.id,
        fullName: "Klinik Yoneticisi",
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
        institutionWebsite: "www.adanawhitedental.com",
        openingTime: "08:30",
        closingTime: "23:59",
        appointmentDuration: 15,
      }
    });
    console.log("✓ Ayarlar oluşturuldu");

    console.log("\n✅ Seed başarılı!");
    console.log("📝 Giriş bilgileri:");
    console.log("   Kurum: whitedental");
    console.log("   TC: 10000000001");
    console.log("   Şifre: 10711453");

  } catch (error) {
    console.error("❌ Seed hatası:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
