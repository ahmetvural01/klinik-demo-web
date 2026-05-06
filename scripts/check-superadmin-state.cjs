const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findUnique({ where: { identityNo: "11509380760" }, select: { id: true, fullName: true, identityNo: true, role: true, isActive: true } });
  const perms = user ? await prisma.superadminPermission.findUnique({ where: { userId: user.id } }) : null;
  console.log(JSON.stringify({ user, hasSuperadminPermission: !!perms, modules: perms?.modules || null }, null, 2));
  await prisma.$disconnect();
})();
