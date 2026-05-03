import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("10711453", 10);

  // Create Institution
  const institution = await prisma.institution.create({
    data: {
      name: "whitedental",
      email: "info@whitedental.com",
      phone: "05306375370",
      address: "Cukurova / Adana",
      subscriptionPlan: "PROFESYONEL",
      smsBalance: 100,
      isActive: true
    }
  }).catch(() => prisma.institution.findFirst({ where: { email: "info@whitedental.com" } }));

  if (!institution) throw new Error("Institution creation failed");

  // Create Admin User
  const admin = await prisma.user.create({
    data: {
      identityNo: "10000000001",
      institutionId: institution.id,
      fullName: "Klinik Yoneticisi",
      role: Role.YONETICI,
      passwordHash: adminPass,
      isActive: true,
      profile: {
        create: {
          workStart: "08:30",
          workEnd: "23:59"
        }
      }
    }
  }).catch(() => null);

  // Create Setting
  await prisma.setting.create({
    data: {
      institutionId: institution.id,
      institutionName: "Adana White Dental Clinic",
      institutionAddress: "Cukurova / Adana",
      institutionPhone: "05306375370",
      institutionWebsite: "www.adanawhitedental.com",
      openingTime: "08:30",
      closingTime: "23:59",
      appointmentDuration: 15
    }
  }).catch(() => null);

  console.log("✓ Seed completed successfully");
  console.log(`  Institution: ${institution.name}`);
  console.log(`  Admin: ${admin?.fullName || "N/A"}`);
  console.log(`  Login: whitedental / 10000000001 / 10711453`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
