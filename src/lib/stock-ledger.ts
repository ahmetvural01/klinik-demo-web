type TxClient = any;

type StockMovementInput = {
  tx: TxClient;
  stockItemId: string;
  institutionId?: string | null;
  userId: string;
  type: "GIRIS" | "CIKIS";
  quantity: number;
  note?: string | null;
  supplier?: string | null;
  unitPrice?: number | null;
  purchaseItemId?: string | null;
  lotNo?: string | null;
  receivedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  /**
   * İstemcinin ürettiği tekrar-önleme anahtarı (manuel stok GİRİŞ/ÇIKIŞ formu).
   * Aynı requestKey ile ikinci bir çağrı (çift tıklama, ağ hatası sonrası
   * retry) stok miktarını TEKRAR değiştirmez — mevcut hareket olduğu gibi
   * döndürülür (bkz. denetim raporu, PATCH /api/stock/[id] idempotency eksikliği).
   */
  requestKey?: string | null;
};

function dateOrNull(value?: Date | string | null) {
  return value ? new Date(value) : null;
}

async function lockStockItem(tx: TxClient, stockItemId: string) {
  await tx.$queryRaw`SELECT "id" FROM "StockItem" WHERE "id" = ${stockItemId} FOR UPDATE`;
}

async function allocateLots(
  tx: TxClient,
  stockItemId: string,
  movementId: string,
  quantity: number,
) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "StockLot"
    WHERE "stockItemId" = ${stockItemId}
      AND "status" = 'AKTIF'
      AND "quantityRemaining" > 0
    ORDER BY "expiresAt" ASC NULLS LAST, "receivedAt" ASC, "createdAt" ASC
    FOR UPDATE
  `;

  const lots = await tx.stockLot.findMany({
    where: {
      stockItemId,
      status: "AKTIF",
      quantityRemaining: { gt: 0 },
    },
    orderBy: [
      { expiresAt: { sort: "asc", nulls: "last" } },
      { receivedAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  let remaining = quantity;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.quantityRemaining);
    const used = Math.min(available, remaining);
    const after = available - used;

    await tx.stockLot.update({
      where: { id: lot.id },
      data: {
        quantityRemaining: after,
        status: after === 0 ? "TUKENDI" : "AKTIF",
      },
    });
    await tx.stockMovementLotAllocation.create({
      data: {
        movementId,
        lotId: lot.id,
        quantity: used,
        unitCost: Number(lot.unitCost),
      },
    });
    remaining -= used;
  }

  if (remaining > 0) {
    throw new Error(
      `Stok partileri ile kart bakiyesi uyumsuz. ${remaining} birim için kullanılabilir parti bulunamadı.`,
    );
  }
}

export async function applyStockMovement({
  tx,
  stockItemId,
  institutionId,
  userId,
  type,
  quantity,
  note,
  supplier,
  unitPrice,
  purchaseItemId,
  lotNo,
  receivedAt,
  expiresAt,
  requestKey,
}: StockMovementInput) {
  if (!stockItemId) throw new Error("Stok kalemi zorunlu");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Miktar pozitif olmalı");

  await lockStockItem(tx, stockItemId);
  const item = await tx.stockItem.findFirst({
    where: {
      id: stockItemId,
      ...(institutionId ? { institutionId } : {}),
    },
  });

  if (!item) throw new Error("Stok kalemi bulunamadı");
  if (!item.isActive) throw new Error("Pasif stok kalemi güncellenemez");

  // Satır kilidi alındıktan SONRA kontrol edilir: aynı requestKey ile eşzamanlı
  // gelen ikinci istek, birincisi commit olana kadar burada bekler (FOR UPDATE),
  // sonra bu kontrolde mevcut hareketi bulup miktarı TEKRAR değiştirmeden döner.
  if (requestKey) {
    const existingMovement = await tx.stockMovement.findFirst({
      where: { institutionId: item.institutionId, requestKey },
    });
    if (existingMovement) {
      return {
        item,
        movement: existingMovement,
        isCritical: Number(item.quantity) < Number(item.minQuantity),
        duplicate: true,
      };
    }
  }

  if (type === "CIKIS" && Number(item.quantity) < quantity) {
    throw new Error(`Yetersiz stok. Mevcut: ${Number(item.quantity)}, İstenen çıkış: ${quantity}`);
  }

  const updated = await tx.stockItem.update({
    where: { id: stockItemId },
    data: {
      quantity: type === "GIRIS"
        ? { increment: quantity }
        : { decrement: quantity },
    },
  });

  const movement = await tx.stockMovement.create({
    data: {
      stockItemId,
      institutionId: item.institutionId,
      requestKey: requestKey || null,
      type,
      quantity,
      note: note || null,
      userId,
      supplier: supplier || null,
      unitPrice: unitPrice ?? null,
    },
  });

  if (type === "GIRIS") {
    await tx.stockLot.create({
      data: {
        institutionId: item.institutionId,
        stockItemId,
        purchaseItemId: purchaseItemId || null,
        lotNo: lotNo?.trim() || null,
        receivedAt: dateOrNull(receivedAt) || new Date(),
        expiresAt: dateOrNull(expiresAt),
        quantityReceived: quantity,
        quantityRemaining: quantity,
        unitCost: Number(unitPrice || 0),
        supplierName: supplier?.trim() || null,
        status: "AKTIF",
      },
    });
  } else {
    await allocateLots(tx, stockItemId, movement.id, quantity);
  }

  return {
    item: updated,
    movement,
    isCritical: Number(updated.quantity) < Number(updated.minQuantity),
  };
}

export async function assertPurchaseItemLotEditable(tx: TxClient, purchaseItemId: string) {
  const lots = await tx.stockLot.findMany({
    where: { purchaseItemId, status: { not: "IPTAL" } },
    select: { quantityReceived: true, quantityRemaining: true },
  });
  const consumed = lots.some(
    (lot: { quantityReceived: number; quantityRemaining: number }) =>
      Number(lot.quantityRemaining) < Number(lot.quantityReceived),
  );
  if (consumed) {
    throw new Error(
      "Bu satın alma partisinden stok çıkışı yapılmış. Ürün, miktar veya maliyet değiştirilemez; düzeltme için ters stok hareketi oluşturun.",
    );
  }
}

export async function reversePurchaseItemStock({
  tx,
  purchaseItemId,
  stockItemId,
  institutionId,
  userId,
  note,
}: {
  tx: TxClient;
  purchaseItemId: string;
  stockItemId: string;
  institutionId?: string | null;
  userId: string;
  note: string;
}) {
  await assertPurchaseItemLotEditable(tx, purchaseItemId);
  await lockStockItem(tx, stockItemId);

  const lots = await tx.stockLot.findMany({
    where: { purchaseItemId, status: { not: "IPTAL" } },
  });
  const quantity = lots.reduce(
    (sum: number, lot: { quantityRemaining: number }) => sum + Number(lot.quantityRemaining),
    0,
  );

  if (quantity === 0) return null;
  const item = await tx.stockItem.findFirst({
    where: {
      id: stockItemId,
      ...(institutionId ? { institutionId } : {}),
    },
  });
  if (!item || Number(item.quantity) < quantity) {
    throw new Error("Satın alma partisi kart bakiyesiyle uyuşmuyor; otomatik geri alma durduruldu.");
  }

  const updated = await tx.stockItem.update({
    where: { id: stockItemId },
    data: { quantity: { decrement: quantity } },
  });
  const movement = await tx.stockMovement.create({
    data: {
      stockItemId,
      type: "CIKIS",
      quantity,
      note,
      userId,
    },
  });

  for (const lot of lots) {
    await tx.stockMovementLotAllocation.create({
      data: {
        movementId: movement.id,
        lotId: lot.id,
        quantity: Number(lot.quantityRemaining),
        unitCost: Number(lot.unitCost),
      },
    });
    await tx.stockLot.update({
      where: { id: lot.id },
      data: { quantityRemaining: 0, status: "IPTAL" },
    });
  }

  return {
    item: updated,
    movement,
    isCritical: Number(updated.quantity) < Number(updated.minQuantity),
  };
}
