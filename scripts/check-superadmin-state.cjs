const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(function main() {
  const identityNo = process.env.SUPERADMIN_IDENTITY || process.env.SUPERADMIN_LOGIN_IDENTITY;
  if (!identityNo) {
    throw new Error("SUPERADMIN_IDENTITY veya SUPERADMIN_LOGIN_IDENTITY ayarlayın.");
  }
  (async () => {
    const user = await prisma.user.findUnique({ where: { identityNo }, select: { id: true, fullName: true, identityNo: true, role: true, isActive: true } });
    const perms = user ? await prisma.superadminPermission.findUnique({ where: { userId: user.id } }) : null;
    console.log(JSON.stringify({ user, hasSuperadminPermission: !!perms, modules: perms?.modules || null }, null, 2));
    await prisma.$disconnect();
  })().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
})();
