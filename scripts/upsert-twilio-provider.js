const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.smsProviderConfig.upsert({
    where: { code: "TWILIO" },
    update: {
      name: "Twilio",
      isActive: false,
      priority: 20,
      sendUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Messages.json",
      balanceUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Balance.json",
      httpMethod: "POST",
      sender: "+15005550006",
    },
    create: {
      code: "TWILIO",
      name: "Twilio",
      isActive: false,
      priority: 20,
      sendUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Messages.json",
      balanceUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Balance.json",
      httpMethod: "POST",
      sender: "+15005550006",
    },
  });

  console.log("TWILIO provider hazir");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
