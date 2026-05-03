import { PrismaClient } from "@prisma/client";
import { CUSTOM_DENTAL_TREATMENT_TEMPLATES, TDB_2026_CORE_PRICE_CATALOG } from "../src/lib/dental-treatment-catalog";

const prisma = new PrismaClient();

async function syncStandardPrices() {
  for (const item of TDB_2026_CORE_PRICE_CATALOG) {
    await prisma.priceItem.upsert({
      where: { code_treatment: { code: item.code, treatment: item.treatment } },
      update: { amount: item.amount, isCustom: false },
      create: { code: item.code, treatment: item.treatment, amount: item.amount, isCustom: false }
    });
  }
}

async function syncCustomPrices() {
  const desiredByCode = new Map(CUSTOM_DENTAL_TREATMENT_TEMPLATES.map((item) => [item.code, item]));
  const existing = await prisma.priceItem.findMany({
    where: { isCustom: true, code: { startsWith: "OZL-" } }
  });

  for (const row of existing) {
    const desired = desiredByCode.get(row.code);
    if (!desired || desired.treatment !== row.treatment) {
      await prisma.priceItem.delete({ where: { id: row.id } });
    }
  }

  for (const item of CUSTOM_DENTAL_TREATMENT_TEMPLATES) {
    const current = await prisma.priceItem.findFirst({
      where: { isCustom: true, code: item.code }
    });

    if (current) {
      await prisma.priceItem.update({
        where: { id: current.id },
        data: { treatment: item.treatment, amount: item.amount, isCustom: true }
      });
      continue;
    }

    await prisma.priceItem.create({
      data: { code: item.code, treatment: item.treatment, amount: item.amount, isCustom: true }
    });
  }
}

async function main() {
  await syncStandardPrices();
  await syncCustomPrices();

  const standardCount = await prisma.priceItem.count({ where: { isCustom: false } });
  const customCount = await prisma.priceItem.count({ where: { isCustom: true } });

  console.log(JSON.stringify({ standardCount, customCount }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
