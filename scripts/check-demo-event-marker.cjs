const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.patientFollowUpEvent.findMany({
    where: {
      OR: [
        { detail: { contains: "[DEMO_PAKET_20260506]-EVENT-2" } },
        { detail: { contains: "[DEMO_PAKET_20260506]-EVENT-1" } }
      ]
    },
    select: { id: true, summary: true, detail: true }
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})();
