const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

(async () => {
  const identityNo = process.env.SUPERADMIN_IDENTITY || process.env.SUPERADMIN_LOGIN_IDENTITY;
  const fullName = process.env.SUPERADMIN_FULL_NAME || "";
  if (!identityNo || !fullName) {
    throw new Error("SUPERADMIN_IDENTITY, SUPERADMIN_LOGIN_IDENTITY veya SUPERADMIN_FULL_NAME ayarlayın.");
  }
  const u = await prisma.user.findUnique({
    where: { identityNo },
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

  const ok = await bcrypt.compare(requireEnv("SUPERADMIN_PASSWORD"), u.passwordHash);
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
