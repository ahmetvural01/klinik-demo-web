import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required for seeding.`);
  }
  return value;
}

async function main() {
  const adminPass = await bcrypt.hash(requireEnv("DEMO_ADMIN_PASSWORD"), 10);
  const institutionName = process.env.DEMO_INSTITUTION_NAME || "demo-klinik";
  const institutionEmail = process.env.DEMO_INSTITUTION_EMAIL || "demo@local.test";
  const institutionWebsite = process.env.DEMO_INSTITUTION_WEBSITE || "www.demo.local";
  const demoAdminIdentity = process.env.DEMO_ADMIN_IDENTITY || "00000000000";
  const demoAdminFullName = process.env.DEMO_ADMIN_FULL_NAME || "Demo Kullanici";

  // Create Institution
  const institution = await prisma.institution.create({
    data: {
        name: institutionName,
        email: institutionEmail,
      phone: "05306375370",
      address: "Cukurova / Adana",
      subscriptionPlan: "PROFESYONEL",
      smsBalance: 100,
      isActive: true
    }
  }).catch(() => prisma.institution.findFirst({ where: { email: institutionEmail } }));

  if (!institution) throw new Error("Institution creation failed");

  // Create Admin User
  const admin = await prisma.user.create({
    data: {
      identityNo: demoAdminIdentity,
      institutionId: institution.id,
      fullName: demoAdminFullName,
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
      institutionWebsite,
      openingTime: "08:30",
      closingTime: "23:59",
      appointmentDuration: 15
    }
  }).catch(() => null);

  console.log("✓ Seed completed successfully");
  console.log(`  Institution: ${institution.name}`);
  console.log(`  Admin: ${admin?.fullName || "N/A"}`);
  console.log(`  Login: ${institutionName} / ${demoAdminIdentity} / DEMO_ADMIN_PASSWORD`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
