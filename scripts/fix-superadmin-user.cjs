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
  const passwordHash = await bcrypt.hash(requireEnv("SUPERADMIN_PASSWORD"), 10);
  const identityNo = process.env.SUPERADMIN_IDENTITY || process.env.SUPERADMIN_LOGIN_IDENTITY;
  const fullName = process.env.SUPERADMIN_FULL_NAME || "";
  if (!identityNo || !fullName) {
    throw new Error("SUPERADMIN_IDENTITY, SUPERADMIN_LOGIN_IDENTITY veya SUPERADMIN_FULL_NAME ayarlayın.");
  }
  const user = await prisma.user.upsert({
    where: { identityNo },
    update: {
      fullName,
      role: "SUPERADMIN",
      institutionId: null,
      passwordHash,
      isActive: true,
    },
    create: {
      identityNo,
      fullName,
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
