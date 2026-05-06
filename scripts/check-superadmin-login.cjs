const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const u = await prisma.user.findUnique({
    where: { identityNo: "11509380760" },
    select: {
      id: true,
      fullName: true,
      identityNo: true,
      role: true,
      isActive: true,
      passwordHash: true,
      institutionId: true,
    },
  });

  if (!u) {
    console.log("USER_NOT_FOUND");
    await prisma.$disconnect();
    return;
  }

  const ok = await bcrypt.compare("10711453", u.passwordHash);
  console.log(
    JSON.stringify(
      {
        exists: true,
        id: u.id,
        fullName: u.fullName,
        identityNo: u.identityNo,
        role: u.role,
        isActive: u.isActive,
        institutionId: u.institutionId,
        passwordMatch: ok,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
