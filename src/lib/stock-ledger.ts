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

  // Çıkış için: eşzamanlı iki hareketin birbirinin üzerine yazmasını (lost update)
  // önlemek amacıyla, koşullu atomik bir UPDATE ile miktarın hâlâ yeterli olduğunu
  // veritabanı seviyesinde garanti ediyoruz. GİRİŞ için basit artırma yeterli.
  const updated =
    type === "GIRIS"
      ? await tx.stockItem.update({
          where: { id: stockItemId },
          data: {
            quantity: { increment: quantity },
            ...(supplier !== undefined ? { supplier: supplier || null } : {}),
            ...(unitPrice !== undefined ? { unitPrice } : {}),
          },
        })
      : await (async () => {
          const result = await tx.stockItem.updateMany({
            where: { id: stockItemId, quantity: { gte: quantity } },
            data: { quantity: { decrement: quantity } },
          });
          if (result.count === 0) {
            const fresh = await tx.stockItem.findUnique({ where: { id: stockItemId }, select: { quantity: true } });
            throw new Error(`Yetersiz stok. Mevcut: ${Number(fresh?.quantity ?? 0)}, İstenen çıkış: ${quantity}`);
          }
          return tx.stockItem.findUnique({ where: { id: stockItemId } });
        })();

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
