const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.smsProviderConfig.updateMany({
    where: { code: "NETGSM" },
    data: { isActive: false, priority: 10 },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "MOCK" },
    update: {
      name: "Ucretsiz Test (Mock)",
      isActive: true,
      priority: 1,
      httpMethod: "POST",
      sender: "KlinikModern",
      bodyTemplate: "phone={{phone}}&message={{message}}",
      successPattern: "MOCK",
    },
    create: {
      code: "MOCK",
      name: "Ucretsiz Test (Mock)",
      isActive: true,
      priority: 1,
      httpMethod: "POST",
      sender: "KlinikModern",
      bodyTemplate: "phone={{phone}}&message={{message}}",
      successPattern: "MOCK",
    },
  });

  const list = await prisma.smsProviderConfig.findMany({
    select: { code: true, isActive: true, priority: true },
    orderBy: { priority: "asc" },
  });

  console.log(JSON.stringify(list, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
