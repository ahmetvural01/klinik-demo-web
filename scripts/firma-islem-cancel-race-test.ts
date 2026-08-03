/* eslint-disable no-console */
/**
 * PATCH /api/firma/[id]/islemler/[iid] (iptal akışı) — eşzamanlı iki iptal
 * isteğinin stok/gider geri alımını İKİ KEZ tetiklemediğini doğrular (bkz.
 * denetim raporu: `existing.status !== "IPTAL"` kontrolü transaction
 * DIŞINDA yapılıyordu, klasik TOCTOU yarış durumu vardı).
 *
 * Bu script route'un içindeki atomik "AKTIF -> IPTAL" iddia (claim)
 * deseninin AYNISINI doğrudan Prisma ile çalıştırıp, iki eşzamanlı çağrıdan
 * yalnızca birinin gerçek reversal'ı tetiklediğini kanıtlar.
 *
 * Kullanım: npx tsx scripts/firma-islem-cancel-race-test.ts
 * Oluşturulan test verisi sonunda silinir.
 */
import { PrismaClient } from "@prisma/client";
import { applyFirmaIslemIntegration, reverseFirmaIslemIntegration } from "../src/lib/firma-integration";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function claimCancel(islemId: string, userId: string): Promise<"reversed" | "already-cancelled"> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.firmaIslem.updateMany({
      where: { id: islemId, status: { not: "IPTAL" } },
      data: { status: "IPTAL" },
    });
    if (claim.count === 0) return "already-cancelled";
    await reverseFirmaIslemIntegration(tx, userId, islemId);
    return "reversed";
  });
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { institutionId: { not: null }, isActive: true },
    select: { id: true, institutionId: true },
  });
  if (!user?.institutionId) throw new Error("Test için aktif kurum kullanıcısı bulunamadı.");

  const firma = await prisma.firma.create({
    data: { institutionId: user.institutionId, name: `Race Testi Firma ${Date.now()}`, kategori: "TEDARICI" },
  });
  const stockItem = await prisma.stockItem.create({
    data: { institutionId: user.institutionId, name: `Race Testi Stok ${Date.now()}`, quantity: 0, minQuantity: 1 },
  });

  try {
    // Bir ALIM işlemi oluştur (stok girişi tetikler) — sonra iki eşzamanlı
    // istekle iptal etmeyi dene.
    const islemId = await prisma.$transaction(async (tx) => {
      const islem = await tx.firmaIslem.create({
        data: {
          firmaId: firma.id,
          tarih: new Date(),
          islemTipi: "ALIM",
          tutar: 100,
          status: "AKTIF",
        },
      });
      await applyFirmaIslemIntegration({
        tx,
        userId: user.id,
        firma: { id: firma.id, name: firma.name, institutionId: firma.institutionId },
        islem: { id: islem.id, tarih: islem.tarih, islemTipi: "ALIM", tutar: 100 },
        stockItemId: stockItem.id,
        stockQuantity: 10,
      });
      return islem.id;
    });

    const afterCreate = await prisma.stockItem.findUniqueOrThrow({ where: { id: stockItem.id } });
    assert(Number(afterCreate.quantity) === 10, `Ön koşul: stok 10 olmalı, gerçek: ${afterCreate.quantity}.`);

    // İki eşzamanlı iptal isteği.
    const [r1, r2] = await Promise.all([
      claimCancel(islemId, user.id),
      claimCancel(islemId, user.id),
    ]);

    const reversedCount = [r1, r2].filter((r) => r === "reversed").length;
    assert(reversedCount === 1, `Eşzamanlı iptalden TAM OLARAK biri "reversed" olmalı, gerçek: ${JSON.stringify([r1, r2])}.`);

    const finalStock = await prisma.stockItem.findUniqueOrThrow({ where: { id: stockItem.id } });
    assert(Number(finalStock.quantity) === 0, `İptal sonrası stok 0'a dönmeli (10 giriş - 10 geri alım), gerçek: ${finalStock.quantity} (0 olmaması ÇİFT GERİ ALIM veya HİÇ GERİ ALIM anlamına gelir).`);

    const cikisMovements = await prisma.stockMovement.count({ where: { stockItemId: stockItem.id, type: "CIKIS" } });
    assert(cikisMovements === 1, `Tam olarak 1 CIKIS (geri alım) hareketi olmalı, gerçek: ${cikisMovements}.`);

    console.log("✓ Eşzamanlı iki iptal isteğinden yalnızca biri gerçek geri alımı tetikledi, stok tam olarak bir kez düzeltildi.");
  } finally {
    const movements = await prisma.stockMovement.findMany({ where: { stockItemId: stockItem.id }, select: { id: true } });
    const movementIds = movements.map((m) => m.id);
    await prisma.stockMovementLotAllocation.deleteMany({ where: { movementId: { in: movementIds } } });
    await prisma.stockMovement.deleteMany({ where: { stockItemId: stockItem.id } });
    await prisma.stockLot.deleteMany({ where: { stockItemId: stockItem.id } });
    await prisma.expense.deleteMany({ where: { description: { contains: firma.name } } });
    await prisma.firmaIslem.deleteMany({ where: { firmaId: firma.id } });
    await prisma.stockItem.delete({ where: { id: stockItem.id } });
    await prisma.firma.delete({ where: { id: firma.id } });
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
