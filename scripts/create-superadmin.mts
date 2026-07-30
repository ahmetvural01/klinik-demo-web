import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

async function main() {
  const hash = await bcrypt.hash(requireEnv("SUPERADMIN_PASSWORD"), 10);
  const identityNo = process.env.SUPERADMIN_IDENTITY || "";
  const fullName = process.env.SUPERADMIN_FULL_NAME || "";
  if (!identityNo || !fullName) {
    throw new Error("SUPERADMIN_IDENTITY ve SUPERADMIN_FULL_NAME ayarlayın.");
  }
  const legacyUser = await prisma.user.findUnique({
    where: { identityNo },
  });
  const requestedUser = await prisma.user.findUnique({
    where: { identityNo },
  });

  const user = legacyUser && (!requestedUser || requestedUser.id === legacyUser.id)
    ? await prisma.user.update({
        where: { id: legacyUser.id },
        data: {
          identityNo,
          fullName,
          role: "SUPERADMIN",
          institutionId: null,
          passwordHash: hash,
          isActive: true,
        },
      })
    : await prisma.user.upsert({
        where: { identityNo },
        update: {
          fullName,
          role: "SUPERADMIN",
          institutionId: null,
          passwordHash: hash,
          isActive: true,
        },
        create: {
          identityNo,
          fullName,
          role: "SUPERADMIN",
          institutionId: null,
          passwordHash: hash,
          isActive: true,
        },
      });

  console.log("SUPERADMIN created/updated:", user.identityNo, user.role);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
