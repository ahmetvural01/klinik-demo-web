/* eslint-disable no-console */
/**
 * PATCH /api/stock/[id] (applyStockMovement) idempotency doğrulaması.
 * Kullanım: npx tsx scripts/stock-idempotency-test.ts
 * Oluşturulan tüm test verisi (StockItem/StockMovement/StockLot ve varsa
 * ikinci test kurumu) sonunda silinir.
 */
import { PrismaClient } from "@prisma/client";
import { applyStockMovement } from "../src/lib/stock-ledger";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createTestItem(institutionId: string, label: string) {
  return prisma.stockItem.create({
    data: {
      institutionId,
      name: `Idempotency Testi ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: "SARF",
      unit: "adet",
      quantity: 0,
      minQuantity: 2,
    },
  });
}

async function main() {
  const userA = await prisma.user.findFirst({
    where: { institutionId: { not: null }, isActive: true },
    select: { id: true, institutionId: true },
  });
  if (!userA?.institutionId) throw new Error("Test için aktif kurum kullanıcısı bulunamadı.");

  let userB = await prisma.user.findFirst({
    where: { institutionId: { not: null, notIn: [userA.institutionId] }, isActive: true },
    select: { id: true, institutionId: true },
  });

  // Senaryo 4 (farklı kurum) için ikinci bir aktif kurum/kullanıcı yoksa
  // testin kendisi geçici bir tane oluşturur — sonda temizlenir.
  let tempInstitutionId: string | null = null;
  let tempUserId: string | null = null;
  if (!userB) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tempInstitution = await prisma.institution.create({
      data: { name: `Idempotency Test Kurum ${suffix}`, email: `idem-test-${suffix}@example.invalid` },
    });
    const tempUser = await prisma.user.create({
      data: {
        institutionId: tempInstitution.id,
        identityNo: `TEST${suffix}`.slice(0, 20),
        fullName: "Idempotency Test Kullanıcı",
        passwordHash: "test-not-a-real-hash",
        role: "YONETICI",
      },
    });
    tempInstitutionId = tempInstitution.id;
    tempUserId = tempUser.id;
    userB = { id: tempUser.id, institutionId: tempInstitution.id };
  }

  const createdItemIds: string[] = [];

  try {
    // ── Senaryo 1: Aynı requestKey ile aynı hareketi iki kez gönderme ──────────
    {
      const item = await createTestItem(userA.institutionId, "S1");
      createdItemIds.push(item.id);
      const requestKey = `test-s1-${Date.now()}`;

      const r1 = await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 10, requestKey }),
      );
      const r2 = await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 10, requestKey }),
      );

      assert(!(r1 as any).duplicate, "Senaryo 1: ilk istek duplicate işaretlenmemeli.");
      assert((r2 as any).duplicate === true, "Senaryo 1: ikinci istek duplicate olarak işaretlenmeli.");
      assert(r1.movement.id === r2.movement.id, "Senaryo 1: ikinci istek AYNI hareket kaydını döndürmeli.");

      const finalItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      assert(Number(finalItem.quantity) === 10, `Senaryo 1: miktar 10 olmalı, gerçek: ${finalItem.quantity} (stok İKİ KEZ artırılmamalı).`);

      const movementCount = await prisma.stockMovement.count({ where: { stockItemId: item.id, requestKey } });
      assert(movementCount === 1, `Senaryo 1: aynı requestKey ile yalnızca 1 hareket kaydı olmalı, gerçek: ${movementCount}.`);
      console.log("✓ Senaryo 1: aynı requestKey ile tekrar gönderim — stok tekrar değişmedi.");
    }

    // ── Senaryo 2: Aynı requestKey ile eşzamanlı iki istek (race) ──────────────
    {
      const item = await createTestItem(userA.institutionId, "S2");
      createdItemIds.push(item.id);
      const requestKey = `test-s2-${Date.now()}`;

      const [r1, r2] = await Promise.all([
        prisma.$transaction((tx) =>
          applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 7, requestKey }),
        ),
        prisma.$transaction((tx) =>
          applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 7, requestKey }),
        ),
      ]);

      const duplicateCount = [r1, r2].filter((r) => (r as any).duplicate).length;
      assert(duplicateCount === 1, `Senaryo 2: eşzamanlı isteklerden tam olarak biri duplicate olmalı, gerçek: ${duplicateCount}.`);

      const finalItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      assert(Number(finalItem.quantity) === 7, `Senaryo 2: miktar 7 olmalı (satır kilidi race'i serileştirmeli), gerçek: ${finalItem.quantity}.`);

      const movementCount = await prisma.stockMovement.count({ where: { stockItemId: item.id, requestKey } });
      assert(movementCount === 1, `Senaryo 2: yalnızca 1 hareket kaydı oluşmalı, gerçek: ${movementCount}.`);
      console.log("✓ Senaryo 2: eşzamanlı aynı requestKey — satır kilidi race'i doğru serileştirdi, tek hareket oluştu.");
    }

    // ── Senaryo 3: Farklı requestKey ile iki ayrı gerçek hareket ───────────────
    {
      const item = await createTestItem(userA.institutionId, "S3");
      createdItemIds.push(item.id);

      await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 5, requestKey: `test-s3-a-${Date.now()}` }),
      );
      await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 5, requestKey: `test-s3-b-${Date.now()}` }),
      );

      const finalItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      assert(Number(finalItem.quantity) === 10, `Senaryo 3: miktar 10 olmalı (iki gerçek hareket), gerçek: ${finalItem.quantity}.`);
      const movementCount = await prisma.stockMovement.count({ where: { stockItemId: item.id } });
      assert(movementCount === 2, `Senaryo 3: 2 ayrı hareket kaydı olmalı, gerçek: ${movementCount}.`);
      console.log("✓ Senaryo 3: farklı requestKey — iki hareket de gerçekten uygulandı.");
    }

    // ── Senaryo 4: Aynı requestKey farklı kurumlarda çakışmamalı ────────────────
    if (userB?.institutionId) {
      const itemA = await createTestItem(userA.institutionId, "S4A");
      const itemB = await createTestItem(userB.institutionId, "S4B");
      createdItemIds.push(itemA.id, itemB.id);
      const sharedKey = `test-s4-shared-${Date.now()}`;

      const rA = await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: itemA.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 3, requestKey: sharedKey }),
      );
      const rB = await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: itemB.id, institutionId: userB.institutionId, userId: userB.id, type: "GIRIS", quantity: 3, requestKey: sharedKey }),
      );

      assert(!(rA as any).duplicate && !(rB as any).duplicate, "Senaryo 4: aynı requestKey farklı kurumlarda İKİSİ DE gerçek hareket olarak işlenmeli.");
      const finalA = await prisma.stockItem.findUniqueOrThrow({ where: { id: itemA.id } });
      const finalB = await prisma.stockItem.findUniqueOrThrow({ where: { id: itemB.id } });
      assert(Number(finalA.quantity) === 3 && Number(finalB.quantity) === 3, "Senaryo 4: her iki kurumda da miktar 3 olmalı.");
      console.log("✓ Senaryo 4: aynı requestKey farklı kurumlarda çakışmadı, ikisi de bağımsız işlendi.");
    } else {
      console.log("⚠ Senaryo 4 atlandı: ikinci bir aktif kurum bulunamadı.");
    }

    // ── Senaryo 5: İlk istek iş kuralı hatasıyla başarısız olur, aynı key ile retry başarılı olmalı ──
    {
      const item = await createTestItem(userA.institutionId, "S5");
      createdItemIds.push(item.id);
      const requestKey = `test-s5-${Date.now()}`;

      let firstFailed = false;
      try {
        // Stokta hiç ürün yokken CIKIS istemek iş kuralı hatası fırlatır —
        // transaction rollback olur, requestKey ile hiçbir satır YAZILMAMIŞ olmalı.
        await prisma.$transaction((tx) =>
          applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "CIKIS", quantity: 5, requestKey }),
        );
      } catch {
        firstFailed = true;
      }
      assert(firstFailed, "Senaryo 5: yetersiz stokla ilk istek hata vermeli.");

      const afterFailure = await prisma.stockMovement.count({ where: { stockItemId: item.id, requestKey } });
      assert(afterFailure === 0, `Senaryo 5: başarısız denemeden sonra requestKey ile HİÇBİR hareket kalmamalı, gerçek: ${afterFailure}.`);

      // Aynı requestKey ile, bu sefer geçerli bir GİRİŞ retry edilir — başarılı olmalı.
      const retry = await prisma.$transaction((tx) =>
        applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 4, requestKey }),
      );
      assert(!(retry as any).duplicate, "Senaryo 5: retry, önceki başarısız deneme yüzünden yanlışlıkla duplicate sayılmamalı.");
      const finalItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      assert(Number(finalItem.quantity) === 4, `Senaryo 5: retry sonrası miktar 4 olmalı, gerçek: ${finalItem.quantity}.`);
      console.log("✓ Senaryo 5: başarısız ilk deneme requestKey'i 'kullanılmış' saymadı, retry normal işlendi.");
    }

    // ── Senaryo 6: Stok miktarı ile hareket kayıtları her durumda tutarlı ──────
    {
      const item = await createTestItem(userA.institutionId, "S6");
      createdItemIds.push(item.id);
      await prisma.$transaction((tx) => applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "GIRIS", quantity: 20, requestKey: `test-s6-in-${Date.now()}` }));
      await prisma.$transaction((tx) => applyStockMovement({ tx, stockItemId: item.id, institutionId: userA.institutionId, userId: userA.id, type: "CIKIS", quantity: 8, requestKey: `test-s6-out-${Date.now()}` }));

      const finalItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      const movements = await prisma.stockMovement.findMany({ where: { stockItemId: item.id } });
      const computed = movements.reduce((sum, m) => sum + (m.type === "GIRIS" ? Number(m.quantity) : -Number(m.quantity)), 0);
      assert(Number(finalItem.quantity) === computed, `Senaryo 6: StockItem.quantity (${finalItem.quantity}) hareket toplamıyla (${computed}) eşleşmeli.`);
      assert(Number(finalItem.quantity) === 12, `Senaryo 6: beklenen miktar 12, gerçek: ${finalItem.quantity}.`);
      console.log("✓ Senaryo 6: stok miktarı hareket kayıtlarının toplamıyla tutarlı.");
    }

    console.log("\nTüm idempotency senaryoları doğrulandı.");
  } finally {
    // Test verisini temizle.
    await prisma.stockMovementLotAllocation.deleteMany({ where: { movement: { stockItemId: { in: createdItemIds } } } });
    await prisma.stockMovement.deleteMany({ where: { stockItemId: { in: createdItemIds } } });
    await prisma.stockLot.deleteMany({ where: { stockItemId: { in: createdItemIds } } });
    await prisma.stockItem.deleteMany({ where: { id: { in: createdItemIds } } });
    if (tempUserId) await prisma.user.delete({ where: { id: tempUserId } }).catch(() => {});
    if (tempInstitutionId) await prisma.institution.delete({ where: { id: tempInstitutionId } }).catch(() => {});
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
