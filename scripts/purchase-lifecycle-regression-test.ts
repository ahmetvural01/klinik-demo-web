/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();
const BASE = process.env.PURCHASE_TEST_BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.PURCHASE_TEST_PASSWORD || "PurchaseTest!2026";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const institution = await prisma.institution.findFirstOrThrow({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const branch = await prisma.clinicBranch.findFirstOrThrow({
    where: { institutionId: institution.id, isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }],
    select: { id: true },
  });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: {
      institutionId: institution.id,
      identityNo: `PT${suffix}`.slice(0, 20),
      fullName: "Purchase Lifecycle Test",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: "YONETICI",
      branchMemberships: {
        create: { branchId: branch.id, isPrimary: true },
      },
    },
  });
  const firma = await prisma.firma.create({
    data: {
      institutionId: institution.id,
      branchId: branch.id,
      name: `Purchase Lifecycle Firma ${suffix}`,
      kategori: "TEDARICI",
    },
  });
  const stockItem = await prisma.stockItem.create({
    data: {
      institutionId: institution.id,
      branchId: branch.id,
      name: `Purchase Lifecycle Stock ${suffix}`,
      quantity: 0,
      minQuantity: 0,
    },
  });
  const purchase = await prisma.purchase.create({
    data: {
      institutionId: institution.id,
      branchId: branch.id,
      firmaId: firma.id,
      tarih: new Date(),
      receiptStatus: "SIPARIS_VERILDI",
      createdById: user.id,
      items: {
        create: {
          stockItemId: stockItem.id,
          productName: stockItem.name,
          quantity: 5,
          unit: "adet",
          unitPrice: 20,
          lineTotal: 100,
        },
      },
    },
    include: { items: true },
  });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const context = await browser.newContext();
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: {
        institution: institution.name,
        identityNo: user.identityNo,
        password: PASSWORD,
        rememberMe: false,
      },
    });
    assert(login.ok(), `Login failed: ${login.status()} ${await login.text()}`);

    const receive = await context.request.post(`${BASE}/api/purchases/${purchase.id}/receive`, {
      headers: { "Idempotency-Key": `receive-${suffix}` },
      data: {
        receivedAt: new Date().toISOString(),
        itemLots: [{ purchaseItemId: purchase.items[0].id, lotNo: `LOT-${suffix}` }],
        paidNow: true,
        paymentDate: new Date().toISOString(),
        paymentMethod: "NAKIT",
        paymentAmount: 100,
      },
    });
    assert(receive.status() === 201, `Receive failed: ${receive.status()} ${await receive.text()}`);

    const afterReceive = await prisma.stockItem.findUniqueOrThrow({ where: { id: stockItem.id } });
    assert(Number(afterReceive.quantity) === 5, `Stock must be 5 after receive, got ${afterReceive.quantity}.`);
    const payment = await prisma.firmaIslem.findFirst({
      where: { sourceType: "PURCHASE_PAYMENT", sourceId: purchase.id },
    });
    assert(payment?.institutionId === institution.id, "Purchase payment must keep institution scope.");
    assert(payment?.branchId === branch.id, "Purchase payment must keep branch scope.");
    console.log("OK: Pending purchase was received with stock, debt and payment records.");

    const [cancelA, cancelB] = await Promise.all([
      context.request.post(`${BASE}/api/purchases/${purchase.id}/cancel`),
      context.request.post(`${BASE}/api/purchases/${purchase.id}/cancel`),
    ]);
    assert(cancelA.ok() && cancelB.ok(), `Concurrent cancel failed: ${cancelA.status()}/${cancelB.status()}.`);
    const cancelBodies = [await cancelA.json(), await cancelB.json()] as Array<{ duplicateRequest?: boolean }>;
    assert(
      cancelBodies.filter((body) => body.duplicateRequest === true).length === 1,
      `Exactly one cancel must be a duplicate: ${JSON.stringify(cancelBodies)}.`,
    );

    const [finalPurchase, finalStock, movements] = await Promise.all([
      prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } }),
      prisma.stockItem.findUniqueOrThrow({ where: { id: stockItem.id } }),
      prisma.stockMovement.findMany({ where: { stockItemId: stockItem.id } }),
    ]);
    assert(finalPurchase.status === "IPTAL", "Purchase must be cancelled.");
    assert(Number(finalStock.quantity) === 0, `Stock must return to 0, got ${finalStock.quantity}.`);
    assert(movements.filter((row) => row.type === "GIRIS").length === 1, "Exactly one stock input is expected.");
    assert(movements.filter((row) => row.type === "CIKIS").length === 1, "Exactly one stock reversal is expected.");
    console.log("OK: Concurrent cancellation reversed the lifecycle exactly once.");

    await context.close();
  } finally {
    await browser.close();

    const islemIds = (await prisma.firmaIslem.findMany({
      where: { firmaId: firma.id },
      select: { id: true },
    })).map((row) => row.id);
    await prisma.firmaPaymentAllocation.deleteMany({ where: { firmaId: firma.id } });
    await prisma.expense.deleteMany({
      where: { OR: [{ sourceId: { in: islemIds } }, { description: { contains: suffix } }] },
    });
    await prisma.purchaseItem.updateMany({
      where: { purchaseId: purchase.id },
      data: { stockMovementId: null },
    });
    await prisma.stockMovementLotAllocation.deleteMany({
      where: { movement: { stockItemId: stockItem.id } },
    });
    await prisma.stockLot.deleteMany({ where: { stockItemId: stockItem.id } });
    await prisma.stockMovement.deleteMany({ where: { stockItemId: stockItem.id } });
    await prisma.purchase.deleteMany({ where: { id: purchase.id } });
    await prisma.firmaIslem.deleteMany({ where: { firmaId: firma.id } });
    await prisma.stockItem.deleteMany({ where: { id: stockItem.id } });
    await prisma.firma.deleteMany({ where: { id: firma.id } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
