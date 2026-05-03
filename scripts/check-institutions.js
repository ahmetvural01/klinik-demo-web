const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.institution.findMany({
    select: {
      id: true,
      name: true,
      isActive: true,
      serviceMode: true,
      suspendedUntil: true,
      paymentGraceUntil: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
