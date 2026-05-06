const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const passwordHash = await bcrypt.hash("10711453", 10);
  const user = await prisma.user.upsert({
    where: { identityNo: "11509380760" },
    update: {
      fullName: "Ahmet Gulden",
      role: "SUPERADMIN",
      institutionId: null,
      passwordHash,
      isActive: true,
    },
    create: {
      identityNo: "11509380760",
      fullName: "Ahmet Gulden",
      role: "SUPERADMIN",
      institutionId: null,
      passwordHash,
      isActive: true,
    },
    select: { id: true, identityNo: true, fullName: true, role: true, institutionId: true, isActive: true },
  });

  console.log(JSON.stringify(user, null, 2));
  await prisma.$disconnect();
})();
