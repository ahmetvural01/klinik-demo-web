const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { identityNo: '11509380760' } });
    console.log(JSON.stringify(user, null, 2));
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
