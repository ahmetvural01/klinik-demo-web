const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const identityNo = process.env.SUPERADMIN_IDENTITY || process.env.SUPERADMIN_LOGIN_IDENTITY;
    if (!identityNo) throw new Error('SUPERADMIN_IDENTITY veya SUPERADMIN_LOGIN_IDENTITY ayarlayın.');
    const user = await prisma.user.findUnique({ where: { identityNo } });
    console.log(JSON.stringify(user, null, 2));
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
