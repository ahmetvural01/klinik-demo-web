const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`);
  const cols = await prisma.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('User','Setting','Institution') ORDER BY table_name, ordinal_position;`);
  const counts = {};
  for (const t of ['User','Setting','Institution']) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM \"${t}\";`);
      counts[t] = r?.[0]?.c ?? null;
    } catch {
      counts[t] = null;
    }
  }
  console.log(JSON.stringify({tables, cols, counts}, null, 2));
  await prisma.$disconnect();
})();
