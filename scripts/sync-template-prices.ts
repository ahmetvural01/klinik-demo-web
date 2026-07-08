import { PrismaClient } from "@prisma/client";
import { CUSTOM_DENTAL_TREATMENT_TEMPLATES, TDB_2026_CORE_PRICE_CATALOG } from "../src/lib/dental-treatment-catalog";

const prisma = new PrismaClient();

async function syncStandardPrices(institutionId: string | null) {
  for (const item of TDB_2026_CORE_PRICE_CATALOG) {
    const existing = await prisma.priceItem.findFirst({
      where: { institutionId, code: item.code, treatment: item.treatment },
    });
    if (existing) {
      await prisma.priceItem.update({
        where: { id: existing.id },
        data: { amount: item.amount, isCustom: false },
      });
    } else {
      await prisma.priceItem.create({
        data: { institutionId, code: item.code, treatment: item.treatment, amount: item.amount, isCustom: false },
      });
    }
  }
}

async function syncCustomPrices(institutionId: string | null) {
  const desiredByCode = new Map(CUSTOM_DENTAL_TREATMENT_TEMPLATES.map((item) => [item.code, item]));
  const existing = await prisma.priceItem.findMany({
    where: { institutionId, isCustom: true, code: { startsWith: "OZL-" } }
  });

  for (const row of existing) {
    const desired = desiredByCode.get(row.code);
    if (!desired || desired.treatment !== row.treatment) {
      await prisma.priceItem.delete({ where: { id: row.id } });
    }
  }

  for (const item of CUSTOM_DENTAL_TREATMENT_TEMPLATES) {
    const current = await prisma.priceItem.findFirst({
      where: { institutionId, isCustom: true, code: item.code }
    });

    if (current) {
      await prisma.priceItem.update({
        where: { id: current.id },
        data: { treatment: item.treatment, amount: item.amount, isCustom: true }
      });
      continue;
    }

    await prisma.priceItem.create({
      data: { institutionId, code: item.code, treatment: item.treatment, amount: item.amount, isCustom: true }
    });
  }
}

async function main() {
  const institutions = await prisma.institution.findMany({ select: { id: true } });
  const institutionIds = institutions.length > 0 ? institutions.map((item) => item.id) : [null];

  for (const institutionId of institutionIds) {
    await syncStandardPrices(institutionId);
    await syncCustomPrices(institutionId);
  }

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
