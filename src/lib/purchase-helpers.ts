import { normalizeCategory } from "@/lib/stock-category";
import { BusinessRuleError } from "@/lib/public-error";

type TxClient = any;

function normalizeProductName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Satın alma satırındaki ürünü çözer: `stockItemId` verilmişse mevcut (aktif,
 * aynı kuruma ait) stok kalemini doğrular. `stockItemId` verilmemişse ürün adı
 * önce kurum stok kartlarında aranır; birebir isim eşleşmesi varsa o karta
 * bağlanır, yoksa yeni stok kartı oluşturulur.
 */
export async function resolveOrCreateStockItem(
  tx: TxClient,
  institutionId: string | null,
  branchId: string,
  _supplierName: string,
  item: { stockItemId?: string | null; newProductName?: string | null; category?: string | null; unit?: string | null; unitPrice: number },
): Promise<{ id: string; name: string; unit: string }> {
  if (item.stockItemId) {
    const existing = await tx.stockItem.findFirst({
      where: { id: item.stockItemId, ...(institutionId ? { institutionId } : {}), branchId },
    });
    if (!existing) throw new BusinessRuleError("Seçilen stok kalemi bulunamadı.", 404);
    if (!existing.isActive) throw new BusinessRuleError(`Pasif stok kalemi kullanılamaz: ${existing.name}`, 409);
    return { id: existing.id, name: existing.name, unit: existing.unit };
  }

  const name = normalizeProductName(item.newProductName || "");
  if (!name) throw new BusinessRuleError("Ürün seçimi veya yeni ürün adı zorunlu");

  const existingByName = await tx.stockItem.findFirst({
    where: {
      ...(institutionId ? { institutionId } : {}),
      branchId,
      isActive: true,
      name: { equals: name, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (existingByName) {
    return { id: existingByName.id, name: existingByName.name, unit: existingByName.unit };
  }

  const inactiveByName = await tx.stockItem.findFirst({
    where: {
      ...(institutionId ? { institutionId } : {}),
      branchId,
      isActive: false,
      name: { equals: name, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (inactiveByName) {
    const reactivated = await tx.stockItem.update({
      where: { id: inactiveByName.id },
      data: {
        isActive: true,
        category: normalizeCategory(item.category),
        unit: item.unit || inactiveByName.unit || "adet",
      },
    });
    return { id: reactivated.id, name: reactivated.name, unit: reactivated.unit };
  }

  const created = await tx.stockItem.create({
    data: {
      institutionId,
      branchId,
      name,
      category: normalizeCategory(item.category),
      unit: item.unit || "adet",
      quantity: 0,
      minQuantity: 5,
      unitPrice: null,
      supplier: null,
    },
  });
  return { id: created.id, name: created.name, unit: created.unit };
}
