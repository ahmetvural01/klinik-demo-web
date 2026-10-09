import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { formatZodError, stockItemCreateSchema } from "@/lib/validators";
import { requireActiveBranch } from "@/lib/branch-context";
import { getCategoryAliases, normalizeCategory } from "@/lib/stock-category";

export const dynamic = "force-dynamic";

const nameKey = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

function enrichStockItem(item: any, purchaseLines?: any[], activeLots?: any[], onOrderQuantity = 0) {
  const purchaseItems = Array.isArray(purchaseLines) ? purchaseLines : Array.isArray(item.purchaseItems) ? item.purchaseItems : [];
  const lots = Array.isArray(activeLots) ? activeLots : [];
  const sortedPurchases = [...purchaseItems].sort((a, b) => {
    const ad = new Date(a.purchase?.tarih || a.createdAt || 0).getTime();
    const bd = new Date(b.purchase?.tarih || b.createdAt || 0).getTime();
    return bd - ad;
  });
  const lastLine = sortedPurchases[0];
  const totalQty = purchaseItems.reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0);
  const totalCost = purchaseItems.reduce((sum: number, line: any) => sum + Number(line.lineTotal || 0), 0);
  const lotQuantity = lots.reduce((sum: number, lot: any) => sum + Number(lot.quantityRemaining || 0), 0);
  const lotCost = lots.reduce(
    (sum: number, lot: any) => sum + Number(lot.quantityRemaining || 0) * Number(lot.unitCost || 0),
    0,
  );
  const averageUnitPrice = lotQuantity > 0
    ? Math.round((lotCost / lotQuantity) * 100) / 100
    : totalQty > 0
      ? Math.round((totalCost / totalQty) * 100) / 100
      : null;
  const expiringLot = [...lots]
    .filter((lot) => lot.expiresAt)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];

  return {
    ...item,
    category: normalizeCategory(item.category),
    averageUnitPrice,
    activeLotCount: lots.length,
    // Çıkış yalnız partilerden yapılabildiği için ekranda "en fazla" sınırı
    // ve partisi eksik kartların uyarısı bu sayıdan hesaplanır.
    lotQuantity,
    // Teslim alınmamış siparişlerdeki miktar ("Siparişte").
    onOrderQuantity,
    nearestExpiry: expiringLot?.expiresAt || null,
    lastPurchase: lastLine ? {
      date: lastLine.purchase?.tarih || lastLine.createdAt,
      supplier: lastLine.purchase?.firma?.name || null,
      supplierId: lastLine.purchase?.firma?.id || null,
      unitPrice: Number(lastLine.unitPrice || 0),
      quantity: Number(lastLine.quantity || 0),
      invoiceNo: lastLine.purchase?.faturaNo || null,
    } : null,
  };
}

function hideStockCost(item: any) {
  return {
    ...item,
    unitPrice: null,
    averageUnitPrice: null,
    lastPurchase: item.lastPurchase ? { ...item.lastPurchase, unitPrice: null, invoiceNo: null } : null,
  };
}

export const GET = withApiTiming("stock", async function GET(req: NextRequest) {
  const auth = await requireAuth("stock:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const categoryAliases = category ? getCategoryAliases(category) : [];
  // ?arsiv=1: arşivlenmiş kartlar (geri almak için).
  const archived = searchParams.get("arsiv") === "1";

  let items: any[] = [];
  try {
    items = await (prisma as any).stockItem.findMany({
      where: {
        isActive: !archived,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
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
          archivedAt: null,
          purchase: {
            status: "AKTIF",
            ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
            branchId: branch.branchId,
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          purchase: {
            select: {
              tarih: true,
              faturaNo: true,
              receiptStatus: true,
              firma: { select: { id: true, name: true } },
            },
          },
        },
      })
    : [];
  // "Son alış" ve ortalama maliyet yalnız teslim alınmış satırlardan;
  // gelmemiş sipariş ayrı "Siparişte" miktarı olarak gösterilir.
  const onOrderByItem = new Map<string, number>();
  const linesByItem = new Map<string, any[]>();
  for (const line of purchaseLines) {
    if (line.purchase?.receiptStatus === "SIPARIS_VERILDI") {
      onOrderByItem.set(line.stockItemId, (onOrderByItem.get(line.stockItemId) || 0) + Number(line.quantity || 0));
      continue;
    }
    const arr = linesByItem.get(line.stockItemId) || [];
    arr.push(line);
    linesByItem.set(line.stockItemId, arr);
  }

  const activeLots = itemIds.length
    ? await (prisma as any).stockLot.findMany({
        where: {
          stockItemId: { in: itemIds },
          status: "AKTIF",
          quantityRemaining: { gt: 0 },
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
          branchId: branch.branchId,
        },
        select: {
          stockItemId: true,
          quantityRemaining: true,
          unitCost: true,
          expiresAt: true,
        },
      })
    : [];
  const lotsByItem = new Map<string, any[]>();
  for (const lot of activeLots) {
    const arr = lotsByItem.get(lot.stockItemId) || [];
    arr.push(lot);
    lotsByItem.set(lot.stockItemId, arr);
  }

  // Alış fiyatı ve maliyet finans bilgisidir: finance:read olmayan roller
  // (asistan, banko, doktor) stok miktarını görür ama maliyeti görmez.
  const canSeeCost = await hasEffectivePermission(auth.user, "finance:read");
  return NextResponse.json(items.map((item) => {
    const enriched = enrichStockItem(
      item,
      linesByItem.get(item.id) || [],
      lotsByItem.get(item.id) || [],
      onOrderByItem.get(item.id) || 0,
    );
    return canSeeCost ? enriched : hideStockCost(enriched);
  }));
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth("stock:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Stok kartı için kurum bağlamı zorunlu" }, { status: 403 });
  }

  const parsed = stockItemCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok kartı bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { name, category, unit, quantity, minQuantity, unitPrice, barcode, expiresAt, storageLocation } = parsed.data;

  // "Yeni Kart" formu isim çakışmasını kontrol etmiyordu — aynı isimle iki
  // stok kartı açılabiliyordu (bkz. StockItem'a eklenen unique kısıt).
  // Burada önceden, açık bir mesajla engelliyoruz.
  // Veritabanı karşılaştırması Türkçe İ/ı harflerini ayırt ediyordu ("İmplant"
  // ile "implant" iki ayrı kart açılıyordu); karşılaştırma Türkçe küçük harfle yapılır.
  const sameBranchItems = await (prisma as any).stockItem.findMany({
    where: {
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    select: { id: true, name: true, isActive: true },
  });
  const existingByName = sameBranchItems.find((row: { name: string }) => nameKey(row.name) === nameKey(name));
  if (existingByName) {
    return NextResponse.json(
      {
        error: existingByName.isActive
          ? `"${existingByName.name}" isimli bir stok kartı zaten var. Mevcut kartı kullanın veya farklı bir isim seçin.`
          : `"${existingByName.name}" isimli kart arşivde. Stok listesinde "Arşiv" filtresinden geri alabilirsiniz.`,
      },
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
          branchId: branch.branchId,
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
          branchId: branch.branchId,
          userId: auth.user.id,
          type: "GIRIS",
          quantity: initialQuantity,
          note: "Açılış stoku (sayım)",
          // Açılış partisi birim maliyetiyle açılır; önceden ₺0 maliyetle
          // açıldığı için ortalama maliyet ve stok değeri düşük görünüyordu.
          ...(unitPrice !== null && unitPrice !== undefined ? { unitPrice: Number(unitPrice) } : {}),
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
  return NextResponse.json(enrichStockItem({ ...item, purchaseItems: [] }, [], []), { status: 201 });
}
