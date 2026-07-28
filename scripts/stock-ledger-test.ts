/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { applyStockMovement } from "../src/lib/stock-ledger";

const prisma = new PrismaClient();
const ROLLBACK = "STOCK_LEDGER_TEST_ROLLBACK";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { institutionId: { not: null }, isActive: true },
    select: { id: true, institutionId: true },
  });
  if (!user?.institutionId) {
    throw new Error("Stok testi için aktif kurum kullanıcısı bulunamadı.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          institutionId: user.institutionId,
          name: `Stok Testi ${Date.now()}`,
          category: "SARF",
          unit: "adet",
          quantity: 0,
          minQuantity: 2,
        },
      });

      await applyStockMovement({
        tx,
        stockItemId: item.id,
        institutionId: user.institutionId,
        userId: user.id,
        type: "GIRIS",
        quantity: 10,
        unitPrice: 15,
        supplier: "Test Tedarikçi A",
        lotNo: "FEFO-ERKEN",
        receivedAt: new Date("2026-01-01T09:00:00Z"),
        expiresAt: new Date("2026-09-01T00:00:00Z"),
      });
      await applyStockMovement({
        tx,
        stockItemId: item.id,
        institutionId: user.institutionId,
        userId: user.id,
        type: "GIRIS",
        quantity: 10,
        unitPrice: 25,
        supplier: "Test Tedarikçi B",
        lotNo: "FEFO-GEC",
        receivedAt: new Date("2026-01-02T09:00:00Z"),
        expiresAt: new Date("2027-03-01T00:00:00Z"),
      });
      const result = await applyStockMovement({
        tx,
        stockItemId: item.id,
        institutionId: user.institutionId,
        userId: user.id,
        type: "CIKIS",
        quantity: 12,
        note: "FEFO testi",
      });

      const lots = await tx.stockLot.findMany({
        where: { stockItemId: item.id },
        orderBy: { expiresAt: "asc" },
      });
      const allocations = await tx.stockMovementLotAllocation.findMany({
        where: { movementId: result.movement.id },
        orderBy: { unitCost: "asc" },
      });

      assert(Number(result.item.quantity) === 8, "Stok bakiyesi 8 olmalı.");
      assert(lots.length === 2, "İki stok partisi oluşmalı.");
      assert(lots[0].status === "TUKENDI" && Number(lots[0].quantityRemaining) === 0, "Erken SKT partisi önce tüketilmeli.");
      assert(lots[1].status === "AKTIF" && Number(lots[1].quantityRemaining) === 8, "Geç SKT partisinde 8 adet kalmalı.");
      assert(allocations.length === 2, "Çıkış iki partiye dağıtılmalı.");
      assert(Number(allocations[0].quantity) === 10 && Number(allocations[0].unitCost) === 15, "İlk partiden 10 adet çıkmalı.");
      assert(Number(allocations[1].quantity) === 2 && Number(allocations[1].unitCost) === 25, "İkinci partiden 2 adet çıkmalı.");

      const remainingValue = lots.reduce(
        (sum, lot) => sum + Number(lot.quantityRemaining) * Number(lot.unitCost),
        0,
      );
      const remainingQuantity = lots.reduce((sum, lot) => sum + Number(lot.quantityRemaining), 0);
      assert(remainingValue / remainingQuantity === 25, "Kalan stok ortalama maliyeti 25 TL olmalı.");

      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error instanceof Error && error.message === ROLLBACK) {
      console.log("Stok parti, FEFO ve ağırlıklı maliyet kuralları doğrulandı.");
      return;
    }
    throw error;
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
