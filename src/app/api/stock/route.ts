import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { formatZodError, stockItemCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const CATEGORY_ALIASES: Record<string, string[]> = {
  "Anestezi": ["Anestezi", "ANESTEZI"],
  "İmplant": ["İmplant", "Implant", "İMPLANT", "IMPLANT"],
  "Protez": ["Protez", "PROTEZ"],
  "Dolgu": ["Dolgu", "DOLGU"],
  "Ortodonti": ["Ortodonti", "ORTODONTI"],
  "Cerrahi": ["Cerrahi", "CERRAHI"],
  "Sarf": ["Sarf", "SARF"],
  "Diğer": ["Diğer", "Diger", "DİĞER", "DIGER"],
};

function normalizeCategory(value?: string | null) {
  if (!value) return "Sarf";
  const normalized = value.trim();
  for (const [label, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => alias.toLocaleLowerCase("tr-TR") === normalized.toLocaleLowerCase("tr-TR"))) {
      return label;
    }
  }
  return normalized;
}

function enrichStockItem(item: any, purchaseLines?: any[]) {
  const purchaseItems = Array.isArray(purchaseLines) ? purchaseLines : Array.isArray(item.purchaseItems) ? item.purchaseItems : [];
  const sortedPurchases = [...purchaseItems].sort((a, b) => {
    const ad = new Date(a.purchase?.tarih || a.createdAt || 0).getTime();
    const bd = new Date(b.purchase?.tarih || b.createdAt || 0).getTime();
    return bd - ad;
  });
  const lastLine = sortedPurchases[0];
  const totalQty = purchaseItems.reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0);
  const totalCost = purchaseItems.reduce((sum: number, line: any) => sum + Number(line.lineTotal || 0), 0);
  const averageUnitPrice = totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : null;

  return {
    ...item,
    category: normalizeCategory(item.category),
    averageUnitPrice,
    lastPurchase: lastLine ? {
      date: lastLine.purchase?.tarih || lastLine.createdAt,
      supplier: lastLine.purchase?.firma?.name || null,
      unitPrice: Number(lastLine.unitPrice || 0),
      quantity: Number(lastLine.quantity || 0),
      invoiceNo: lastLine.purchase?.faturaNo || null,
    } : null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const normalizedCategory = normalizeCategory(category);
  const categoryAliases = category ? (CATEGORY_ALIASES[normalizedCategory] || [normalizedCategory]) : [];

  let items: any[] = [];
  try {
    items = await (prisma as any).stockItem.findMany({
      where: {
        isActive: true,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        ...(category ? { category: { in: categoryAliases } } : {}),
      },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("[stock GET] fallback:", error);
    return NextResponse.json({ message: "Stok verileri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }

  const itemIds = items.map((item) => item.id);
  const purchaseLines = itemIds.length
    ? await (prisma as any).purchaseItem.findMany({
        where: {
          stockItemId: { in: itemIds },
          purchase: {
            status: "AKTIF",
            ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          purchase: {
            select: {
              tarih: true,
              faturaNo: true,
              firma: { select: { name: true } },
            },
          },
        },
      })
    : [];
  const linesByItem = new Map<string, any[]>();
  for (const line of purchaseLines) {
    const arr = linesByItem.get(line.stockItemId) || [];
    arr.push(line);
    linesByItem.set(line.stockItemId, arr);
  }

  return NextResponse.json(items.map((item) => enrichStockItem(item, linesByItem.get(item.id) || [])));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const parsed = stockItemCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok kartı bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { name, category, unit, quantity, minQuantity, barcode, expiresAt, storageLocation } = parsed.data;

  // "Yeni Kart" formu isim çakışmasını kontrol etmiyordu — aynı isimle iki
  // stok kartı açılabiliyordu (bkz. StockItem'a eklenen unique kısıt).
  // Burada önceden, açık bir mesajla engelliyoruz.
  const existingByName = await (prisma as any).stockItem.findFirst({
    where: {
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      isActive: true,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  if (existingByName) {
    return NextResponse.json(
      { error: `"${existingByName.name}" isimli bir stok kartı zaten var. Mevcut kartı kullanın veya farklı bir isim seçin.` },
      { status: 409 }
    );
  }

  let item;
  try {
    item = await (prisma as any).$transaction(async (tx: any) => {
      const created = await tx.stockItem.create({
        data: {
          name,
          institutionId: auth.user.institutionId,
          category: normalizeCategory(category),
          unit,
          quantity: 0,
          minQuantity,
          unitPrice: null,
          supplier: null,
          barcode,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          storageLocation,
        },
      });

      const initialQuantity = quantity;
      if (initialQuantity > 0) {
        const movement = await applyStockMovement({
          tx,
          stockItemId: created.id,
          institutionId: auth.user.institutionId,
          userId: auth.user.id,
          type: "GIRIS",
          quantity: initialQuantity,
          note: "Başlangıç stok girişi",
        });
        return movement.item;
      }

      return created;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: `"${name}" isimli bir stok kartı zaten var.` }, { status: 409 });
    }
    console.error("[stock POST] fallback:", error);
    return NextResponse.json({ error: "Stok kaydı oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "STOCK_ITEM_CREATE", `"${name}" stok kalemi oluşturuldu`);
  return NextResponse.json(enrichStockItem({ ...item, purchaseItems: [] }), { status: 201 });
}
