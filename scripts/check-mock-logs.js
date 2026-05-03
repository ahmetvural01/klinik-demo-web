const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.mockSmsLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  console.log(JSON.stringify(logs, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
