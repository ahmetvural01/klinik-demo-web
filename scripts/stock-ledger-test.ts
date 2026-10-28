/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { applyStockMovement } from "../src/lib/stock-ledger";

const prisma = new PrismaClient();
const ROLLBACK = "STOCK_LEDGER_TEST_ROLLBACK";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const branch = await prisma.clinicBranch.findFirst({
    where: { isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }],
  });
  if (!branch) throw new Error("Stok testi için aktif şube bulunamadı.");
  const institutionId: string = branch.institutionId;

  try {
    await prisma.$transaction(async (tx) => {
      // Her şey bu işlemin içinde kurulur ve sonunda geri alınır (boş test
      // veritabanında da çalışsın diye kullanıcı yoksa geçici kullanıcı açılır).
      const user = await tx.user.findFirst({ where: { institutionId, isActive: true }, select: { id: true } })
        ?? await tx.user.create({
          data: { institutionId, identityNo: `STOKTEST${Date.now()}`.slice(0, 20), fullName: "Stok Testi", passwordHash: "x", role: "YONETICI" },
          select: { id: true },
        });

      // ── 1. FEFO + ağırlıklı maliyet (eski istemcinin gönderdiği lot/SKT ile) ──
      const item = await tx.stockItem.create({
        data: {
          institutionId,
          branchId: branch.id,
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
        institutionId,
        branchId: branch.id,
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
        institutionId,
        branchId: branch.id,
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
        institutionId,
        branchId: branch.id,
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

      // ── 2. Maliyet katmanı olmayan (eski/doğrudan yazılmış) stoktan kullanım ──
      // Önceden "kullanılabilir parti bulunamadı" ile reddediliyordu; artık eksik
      // miktar için katman açılır ve kullanım kaydedilir. Maliyet: kalan katmanların
      // ortalaması, yoksa son teslim alınan alış fiyatı.
      const firma = await tx.firma.create({
        data: { institutionId, branchId: branch.id, name: `Stok Testi Firma ${Date.now()}`, kategori: "TEDARICI" },
      });
      const legacy = await tx.stockItem.create({
        data: { institutionId, branchId: branch.id, name: `Stok Testi Eski ${Date.now()}`, unit: "kutu", quantity: 5, minQuantity: 0 },
      });
      await tx.purchase.create({
        data: {
          institutionId,
          branchId: branch.id,
          firmaId: firma.id,
          tarih: new Date("2026-02-01T09:00:00Z"),
          receiptStatus: "TESLIM_ALINDI",
          receivedAt: new Date("2026-02-01T09:00:00Z"),
          createdById: user.id,
          items: {
            create: {
              stockItemId: legacy.id,
              productName: legacy.name,
              quantity: 5,
              unit: "kutu",
              unitPrice: 40,
              lineTotal: 200,
            },
          },
        },
      });
      const legacyOut = await applyStockMovement({
        tx,
        stockItemId: legacy.id,
        institutionId,
        branchId: branch.id,
        userId: user.id,
        type: "CIKIS",
        quantity: 3,
        note: "Kayıtsız stoktan kullanım",
      });
      const legacyLots = await tx.stockLot.findMany({ where: { stockItemId: legacy.id } });
      const legacyAllocations = await tx.stockMovementLotAllocation.findMany({ where: { movementId: legacyOut.movement.id } });
      assert(Number(legacyOut.item.quantity) === 2, "Kayıtsız stoktan 3 kullanılınca 2 kalmalı.");
      assert(legacyLots.length === 1 && Number(legacyLots[0].quantityReceived) === 5 && Number(legacyLots[0].quantityRemaining) === 2, "Eksik 5 kutu için tek katman açılmalı, 2 kalmalı.");
      assert(Number(legacyLots[0].unitCost) === 40, "Katman maliyeti son alış fiyatı (40 TL) olmalı.");
      assert(legacyAllocations.length === 1 && Number(legacyAllocations[0].quantity) === 3 && Number(legacyAllocations[0].unitCost) === 40, "Kullanım 3 × 40 TL maliyetle kaydedilmeli.");

      // Katmanlarla kart eşitlendikten sonra ikinci kullanım yeni katman açmaz.
      await applyStockMovement({ tx, stockItemId: legacy.id, institutionId, branchId: branch.id, userId: user.id, type: "CIKIS", quantity: 2 });
      const afterSecond = await tx.stockLot.findMany({ where: { stockItemId: legacy.id } });
      assert(afterSecond.length === 1 && Number(afterSecond[0].quantityRemaining) === 0 && afterSecond[0].status === "TUKENDI", "İkinci kullanım aynı katmandan düşmeli.");

      // Kart katmanlardan fazlaysa (kısmi kayıt) eksik kısım kalan katmanların ortalamasıyla açılır.
      const partial = await tx.stockItem.create({
        data: { institutionId, branchId: branch.id, name: `Stok Testi Kısmi ${Date.now()}`, unit: "adet", quantity: 10, minQuantity: 0 },
      });
      await applyStockMovement({ tx, stockItemId: partial.id, institutionId, branchId: branch.id, userId: user.id, type: "GIRIS", quantity: 4, unitPrice: 30 });
      const partialOut = await applyStockMovement({ tx, stockItemId: partial.id, institutionId, branchId: branch.id, userId: user.id, type: "CIKIS", quantity: 6 });
      const partialLots = await tx.stockLot.findMany({ where: { stockItemId: partial.id }, orderBy: { receivedAt: "asc" } });
      const partialTracked = partialLots.filter((lot) => lot.status === "AKTIF").reduce((sum, lot) => sum + Number(lot.quantityRemaining), 0);
      assert(Number(partialOut.item.quantity) === 8, "Kısmi kartta 14 − 6 = 8 kalmalı.");
      assert(partialTracked === 8, "Kullanımdan sonra katmanlar kart miktarına eşit olmalı.");
      assert(partialLots.every((lot) => Number(lot.unitCost) === 30), "Eksik kısım kalan katmanların ortalamasıyla (30 TL) açılmalı.");

      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error instanceof Error && error.message === ROLLBACK) {
      console.log("Stok katmanları (FIFO/FEFO), ağırlıklı maliyet ve katmanı eksik stoktan kullanım doğrulandı.");
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
