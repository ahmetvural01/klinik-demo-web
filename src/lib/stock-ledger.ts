import { BusinessRuleError } from "@/lib/public-error";

type TxClient = any;

type StockMovementInput = {
  tx: TxClient;
  stockItemId: string;
  institutionId?: string | null;
  branchId: string;
  userId: string;
  type: "GIRIS" | "CIKIS";
  quantity: number;
  note?: string | null;
  supplier?: string | null;
  unitPrice?: number | null;
  purchaseItemId?: string | null;
  /**
   * Eski API uyumluluğu: ekranlar artık lot no ve son kullanma tarihi
   * göndermez. Katmanlar (StockLot) yalnız maliyet (FIFO) için tutulur.
   */
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

const roundCost = (value: number) => Math.round(value * 100) / 100;

/**
 * Maliyet katmanı (StockLot) olmayan stok: parti sistemi gelmeden açılmış ya
 * da miktarı doğrudan yazılmış kartlarda kart miktarı katmanlardan fazladır.
 * Katmanlar kullanıcıya görünmez; bu fark yüzünden "Kullanım" reddedilmesin
 * diye çıkıştan önce eksik miktar için bir katman açılır. Maliyeti: kalan
 * katmanların ağırlıklı ortalaması, yoksa son teslim alınan alış fiyatı,
 * yoksa son bilinen katman maliyeti, hiçbiri yoksa 0.
 */
async function coverUntrackedStock(
  tx: TxClient,
  item: { id: string; institutionId: string; branchId: string; quantity: number; createdAt: Date },
) {
  const activeLots: Array<{ quantityRemaining: number; unitCost: unknown }> = await tx.stockLot.findMany({
    where: {
      institutionId: item.institutionId,
      branchId: item.branchId,
      stockItemId: item.id,
      status: "AKTIF",
      quantityRemaining: { gt: 0 },
    },
    select: { quantityRemaining: true, unitCost: true },
  });
  const tracked = activeLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining), 0);
  const gap = Number(item.quantity) - tracked;
  if (gap <= 0) return;

  let unitCost = 0;
  if (tracked > 0) {
    unitCost = roundCost(activeLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining) * Number(lot.unitCost || 0), 0) / tracked);
  } else {
    const lastLine = await tx.purchaseItem.findFirst({
      where: {
        stockItemId: item.id,
        institutionId: item.institutionId,
        branchId: item.branchId,
        archivedAt: null,
        purchase: { status: "AKTIF", receiptStatus: "TESLIM_ALINDI" },
      },
      orderBy: [{ purchase: { tarih: "desc" } }, { createdAt: "desc" }],
      select: { unitPrice: true },
    });
    const lastLot = lastLine ? null : await tx.stockLot.findFirst({
      where: { institutionId: item.institutionId, branchId: item.branchId, stockItemId: item.id },
      orderBy: { receivedAt: "desc" },
      select: { unitCost: true },
    });
    unitCost = roundCost(Number(lastLine?.unitPrice ?? lastLot?.unitCost ?? 0));
  }

  await tx.stockLot.create({
    data: {
      institutionId: item.institutionId,
      branchId: item.branchId,
      stockItemId: item.id,
      purchaseItemId: null,
      lotNo: null,
      // Kayıtsız stok en eski stoktur: FIFO'da önce o kullanılır.
      receivedAt: item.createdAt,
      expiresAt: null,
      quantityReceived: gap,
      quantityRemaining: gap,
      unitCost,
      supplierName: null,
      status: "AKTIF",
    },
  });
}

async function allocateLots(
  tx: TxClient,
  institutionId: string,
  branchId: string,
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
      institutionId,
      branchId,
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
        institutionId,
        branchId,
        movementId,
        lotId: lot.id,
        quantity: used,
        unitCost: Number(lot.unitCost),
      },
    });
    remaining -= used;
  }

  if (remaining > 0) {
    // coverUntrackedStock kart miktarını katmanlarla eşitlediği için buraya düşülmez; son savunma.
    throw new BusinessRuleError("Stok kaydı ürün kartıyla uyuşmuyor; işlem kaydedilmedi. Sistem yöneticinize bildirin.");
  }
}

export async function applyStockMovement({
  tx,
  stockItemId,
  institutionId,
  branchId,
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
  if (!stockItemId) throw new BusinessRuleError("Stok kalemi zorunlu");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new BusinessRuleError("Miktar pozitif olmalı");

  await lockStockItem(tx, stockItemId);
  const item = await tx.stockItem.findFirst({
    where: {
      id: stockItemId,
      ...(institutionId ? { institutionId } : {}),
      branchId,
    },
  });

  if (!item) throw new BusinessRuleError("Stok kalemi bulunamadı", 404);
  if (!item.isActive) throw new BusinessRuleError(`"${item.name}" arşivde; önce Stok'ta “Arşiv” sekmesinden geri alın.`, 409);

  // Satır kilidi alındıktan SONRA kontrol edilir: aynı requestKey ile eşzamanlı
  // gelen ikinci istek, birincisi commit olana kadar burada bekler (FOR UPDATE),
  // sonra bu kontrolde mevcut hareketi bulup miktarı TEKRAR değiştirmeden döner.
  if (requestKey) {
    const existingMovement = await tx.stockMovement.findFirst({
      where: { branchId: item.branchId, requestKey },
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
    throw new BusinessRuleError(`Yetersiz stok. Mevcut: ${Number(item.quantity)}, istenen çıkış: ${quantity}`, 409);
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
      branchId: item.branchId,
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
        branchId: item.branchId,
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
    // `item` hareketten önceki kart (miktar düşülmeden): eksik katman bu miktara göre tamamlanır.
    await coverUntrackedStock(tx, item);
    await allocateLots(tx, item.institutionId, item.branchId, stockItemId, movement.id, quantity);
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
    throw new BusinessRuleError(
      "Bu satın almayla gelen üründen kullanılmış. Ürün, miktar veya fiyat değiştirilemez; fark Stok'tan “Stok hareketi” ile düzeltilir.",
    );
  }
}

export async function reversePurchaseItemStock({
  tx,
  purchaseItemId,
  stockItemId,
  institutionId,
  branchId,
  userId,
  note,
}: {
  tx: TxClient;
  purchaseItemId: string;
  stockItemId: string;
  institutionId?: string | null;
  branchId: string;
  userId: string;
  note: string;
}) {
  await assertPurchaseItemLotEditable(tx, purchaseItemId);
  await lockStockItem(tx, stockItemId);

  const lots = await tx.stockLot.findMany({
    where: { institutionId: institutionId || undefined, branchId, purchaseItemId, status: { not: "IPTAL" } },
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
      branchId,
    },
  });
  if (!item || Number(item.quantity) < quantity) {
    throw new BusinessRuleError("Üründe kalan stok bu satın almadaki miktardan az; geri alma yapılamadı.", 409);
  }

  const updated = await tx.stockItem.update({
    where: { id: stockItemId },
    data: { quantity: { decrement: quantity } },
  });
  const movement = await tx.stockMovement.create({
    data: {
      stockItemId,
      institutionId: item.institutionId,
      branchId: item.branchId,
      type: "CIKIS",
      quantity,
      note,
      userId,
    },
  });

  for (const lot of lots) {
    await tx.stockMovementLotAllocation.create({
      data: {
        institutionId: item.institutionId,
        branchId: item.branchId,
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
