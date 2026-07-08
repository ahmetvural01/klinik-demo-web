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
};

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
}: StockMovementInput) {
  if (!stockItemId) throw new Error("Stok kalemi zorunlu");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Miktar pozitif olmalı");

  const item = await tx.stockItem.findFirst({
    where: {
      id: stockItemId,
      ...(institutionId ? { institutionId } : {}),
    },
  });

  if (!item) throw new Error("Stok kalemi bulunamadı");
  if (!item.isActive) throw new Error("Pasif stok kalemi güncellenemez");

  const currentQuantity = Number(item.quantity);
  const nextQuantity = type === "GIRIS"
    ? currentQuantity + quantity
    : currentQuantity - quantity;

  if (nextQuantity < 0) {
    throw new Error(`Yetersiz stok. Mevcut: ${currentQuantity}, İstenen çıkış: ${quantity}`);
  }

  const updated = await tx.stockItem.update({
    where: { id: stockItemId },
    data: {
      quantity: nextQuantity,
      ...(type === "GIRIS" && supplier !== undefined ? { supplier: supplier || null } : {}),
      ...(type === "GIRIS" && unitPrice !== undefined ? { unitPrice } : {}),
    },
  });

  const movement = await tx.stockMovement.create({
    data: {
      stockItemId,
      type,
      quantity,
      note: note || null,
      userId,
    },
  });

  return {
    item: updated,
    movement,
    isCritical: Number(updated.quantity) < Number(updated.minQuantity),
  };
}
