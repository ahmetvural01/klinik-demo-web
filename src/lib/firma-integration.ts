import { writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";

const SOURCE_PREFIX = "[SISTEM:FIRMA_ISLEM:";

type TxClient = any;

type IntegrationInput = {
  tx: TxClient;
  userId: string;
  firma: { id: string; name: string; institutionId?: string | null };
  islem: {
    id: string;
    tarih: Date;
    islemTipi: "ALIM" | "HIZMET" | "ODEME";
    urunHizmet?: string | null;
    aciklama?: string | null;
    tutar: number;
    faturaNo?: string | null;
    yontem?: string | null;
    kdvOrani?: number | null;
  };
  stockItemId?: string | null;
  stockQuantity?: number | null;
};

type IntegrationSummary = {
  stockApplied: boolean;
  expenseApplied: boolean;
  notes: string[];
};

function buildSourceTag(islemId: string) {
  return `${SOURCE_PREFIX}${islemId}]`;
}

function buildBaseDescription(firmaName: string, itemName?: string | null, detail?: string | null) {
  const pieces = [firmaName, itemName, detail].map((value) => value?.trim()).filter(Boolean);
  return pieces.join(" | ");
}

async function ensureExpenseCategory(tx: TxClient, name: string, institutionId?: string | null) {
  const existing = await tx.expenseCategory.findFirst({ where: { name, ...(institutionId ? { institutionId } : {}) } });
  if (existing) return existing;
  return tx.expenseCategory.create({ data: { name, institutionId: institutionId || null } });
}

export async function applyFirmaIslemIntegration({
  tx,
  userId,
  firma,
  islem,
  stockItemId,
  stockQuantity,
}: IntegrationInput): Promise<IntegrationSummary> {
  const summary: IntegrationSummary = { stockApplied: false, expenseApplied: false, notes: [] };
  const tag = buildSourceTag(islem.id);
  const baseDescription = buildBaseDescription(firma.name, islem.urunHizmet, islem.aciklama);

  if (islem.islemTipi === "ALIM" && stockItemId && stockQuantity && stockQuantity > 0) {
    await applyStockMovement({
      tx,
      stockItemId,
      institutionId: firma.institutionId,
      userId,
      type: "GIRIS",
      quantity: Number(stockQuantity),
      note: `${baseDescription || "Tedarikçi alımı"} ${tag}`,
      supplier: firma.name,
      unitPrice: Number(islem.tutar) > 0 ? Number(islem.tutar) / Number(stockQuantity) : undefined,
    });

    summary.stockApplied = true;
    summary.notes.push("stok girişi oluşturuldu");
  }

  if (islem.islemTipi === "HIZMET" || islem.islemTipi === "ODEME") {
    const categoryName = islem.islemTipi === "HIZMET" ? "Firma Hizmeti" : "Firma Ödemesi";
    const category = await ensureExpenseCategory(tx, categoryName, firma.institutionId);

    await tx.expense.create({
      data: {
        institutionId: firma.institutionId || null,
        tarih: islem.tarih,
        categoryId: category.id,
        category: category.name,
        description: `${baseDescription || category.name} ${tag}`,
        tutar: Number(islem.tutar),
        yontem: islem.yontem || "NAKIT",
        faturaNo: islem.faturaNo || null,
        kdvOrani: Number(islem.kdvOrani || 0),
        status: "AKTIF",
      },
    });

    summary.expenseApplied = true;
    summary.notes.push("muhasebe gider kaydı oluşturuldu");
  }

  return summary;
}

export async function reverseFirmaIslemIntegration(tx: TxClient, userId: string, islemId: string) {
  const tag = buildSourceTag(islemId);

  const stockMovements = await tx.stockMovement.findMany({
    where: {
      type: "GIRIS",
      note: { contains: tag },
    },
    include: { stockItem: true },
  });

  for (const movement of stockMovements) {
    const nextQuantity = Math.max(0, Number(movement.stockItem.quantity) - Number(movement.quantity));

    await tx.stockItem.update({
      where: { id: movement.stockItemId },
      data: { quantity: nextQuantity },
    });

    await tx.stockMovement.create({
      data: {
        stockItemId: movement.stockItemId,
        type: "CIKIS",
        quantity: Number(movement.quantity),
        note: `İptal geri alımı ${tag}`,
        userId,
      },
    });
  }

  await tx.expense.updateMany({
    where: {
      status: "AKTIF",
      description: { contains: tag },
    },
    data: { status: "IPTAL" },
  });
}

export function buildFirmaIntegrationMessage(summary: IntegrationSummary) {
  if (!summary.notes.length) {
    return "İşlem kaydedildi";
  }

  return `İşlem kaydedildi, ${summary.notes.join(" ve ")}.`;
}

export async function writeFirmaIntegrationAudit(
  userId: string,
  action: string,
  firmaName: string,
  islemTipi: string,
  tutar: number,
  summary?: IntegrationSummary,
) {
  const detailParts = [
    `${firmaName} için ${islemTipi.toLowerCase()} işlemi kaydedildi.`,
    `Tutar: ${tutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
  ];

  if (summary?.notes.length) {
    detailParts.push(`Otomatik işlemler: ${summary.notes.join(", ")}`);
  }

  await writeAudit(userId, action, detailParts.join("\n"));
}
