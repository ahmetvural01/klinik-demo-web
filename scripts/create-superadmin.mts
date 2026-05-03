import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("10711453", 10);
  const legacyUser = await prisma.user.findUnique({
    where: { identityNo: "99999999999" },
  });
  const requestedUser = await prisma.user.findUnique({
    where: { identityNo: "11509380760" },
  });

  const user = legacyUser && (!requestedUser || requestedUser.id === legacyUser.id)
    ? await prisma.user.update({
        where: { id: legacyUser.id },
        data: {
          identityNo: "11509380760",
          fullName: "Ahmet Gulden",
          role: "SUPERADMIN",
          institutionId: null,
          passwordHash: hash,
          isActive: true,
        },
      })
    : await prisma.user.upsert({
        where: { identityNo: "11509380760" },
        update: {
          fullName: "Ahmet Gulden",
          role: "SUPERADMIN",
          institutionId: null,
          passwordHash: hash,
          isActive: true,
        },
        create: {
          identityNo: "11509380760",
          fullName: "Ahmet Gulden",
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
