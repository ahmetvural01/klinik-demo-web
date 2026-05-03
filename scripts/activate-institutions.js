const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.institution.updateMany({
    where: {
      OR: [
        { isActive: false },
        { serviceMode: { not: "NORMAL" } },
      ],
    },
    data: {
      isActive: true,
      serviceMode: "NORMAL",
      suspendedUntil: null,
      paymentGraceUntil: null,
      serviceNote: null,
    },
  });

  console.log("updatedCount=", updated.count);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
