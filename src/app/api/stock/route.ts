import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { formatZodError, stockItemCreateSchema } from "@/lib/validators";
import { requireActiveBranch } from "@/lib/branch-context";
import { getCategoryAliases, normalizeCategory } from "@/lib/stock-category";

export const dynamic = "force-dynamic";

const nameKey = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
const round2 = (value: number) => Math.round(value * 100) / 100;

type LastPurchaseLine = {
  unitPrice: Prisma.Decimal | number | string | null;
  quantity: number;
  createdAt: Date;
  purchase: { tarih: Date; faturaNo: string | null; firma: { id: string; name: string } | null } | null;
};

type StockEnrichment = {
  /** Teslim alınmış son alış satırı ("Son alış"). */
  lastLine?: LastPurchaseLine | null;
  /** Teslim alınmış alışların toplam miktarı ve tutarı (partisi kalmamış kartta ortalama maliyet). */
  receivedQuantity?: number;
  receivedCost?: number;
  activeLots?: Array<{ quantityRemaining: number; unitCost: Prisma.Decimal | number | string | null; expiresAt: Date | null }>;
  /** Teslim alınmamış siparişlerdeki miktar ("Siparişte"). */
  onOrderQuantity?: number;
};

function enrichStockItem(item: any, { lastLine = null, receivedQuantity = 0, receivedCost = 0, activeLots = [], onOrderQuantity = 0 }: StockEnrichment) {
  const lotQuantity = activeLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining || 0), 0);
  const lotCost = activeLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining || 0) * Number(lot.unitCost || 0), 0);
  const averageUnitPrice = lotQuantity > 0
    ? round2(lotCost / lotQuantity)
    : receivedQuantity > 0
      ? round2(receivedCost / receivedQuantity)
      : null;
  const expiringLot = [...activeLots]
    .filter((lot) => lot.expiresAt)
    .sort((a, b) => new Date(a.expiresAt as Date).getTime() - new Date(b.expiresAt as Date).getTime())[0];

  return {
    ...item,
    category: normalizeCategory(item.category),
    averageUnitPrice,
    activeLotCount: activeLots.length,
    // Çıkış yalnız partilerden yapılabildiği için ekranda "en fazla" sınırı
    // ve partisi eksik kartların uyarısı bu sayıdan hesaplanır.
    lotQuantity,
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

/**
 * GET /api/stock — stok kartları + özet (son alış, ortalama maliyet, partiler, siparişte).
 * Önceden her çağrıda kartların TÜM alış satırları (fatura/firma ilişkisiyle,
 * sınırsız) Node'a çekilip bellekte toplanıyordu; Stok, menü rozeti ve ana
 * sayfa bunu çağırdığı için zamanla en ağır uç olmuştu. Toplamlar artık
 * veritabanında gruplanır, son alış kart başına tek satır okunur. Yanıt
 * biçimi aynıdır (başka ekranlar kullanıyor).
 *
 * ?lite=1: satın alma formundaki ürün önerileri için yalnız ad/birim/barkod/
 * miktar ve son alış (lot, ortalama, siparişte hesaplanmaz).
 */
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
  const lite = searchParams.get("lite") === "1";
  const scope = {
    ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    branchId: branch.branchId,
  };

  let items: any[] = [];
  try {
    items = await (prisma as any).stockItem.findMany({
      where: {
        isActive: !archived,
        ...scope,
        ...(category ? { category: { in: categoryAliases } } : {}),
      },
      orderBy: { name: "asc" },
      ...(lite ? { select: { id: true, name: true, category: true, unit: true, quantity: true, minQuantity: true, barcode: true } } : {}),
    });
  } catch (error) {
    console.error("[stock GET] fallback:", error);
    return NextResponse.json({ message: "Stok verileri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
  if (items.length === 0) return NextResponse.json([]);

  const itemIds = items.map((item) => item.id as string);
  const lineScope: Prisma.PurchaseItemWhereInput = { stockItemId: { in: itemIds }, archivedAt: null, ...scope };
  const receivedWhere: Prisma.PurchaseItemWhereInput = { ...lineScope, purchase: { status: "AKTIF", receiptStatus: "TESLIM_ALINDI", ...scope } };
  const orderWhere: Prisma.PurchaseItemWhereInput = { ...lineScope, purchase: { status: "AKTIF", receiptStatus: "SIPARIS_VERILDI", ...scope } };

  const [lastLines, receivedSums, orderSums, activeLots, canSeeCost] = await Promise.all([
    // "Son alış" yalnız teslim alınmış satırlardan; kart başına en yeni tek satır.
    prisma.purchaseItem.findMany({
      where: receivedWhere,
      orderBy: [{ purchase: { tarih: "desc" } }, { createdAt: "desc" }],
      distinct: ["stockItemId"],
      select: {
        stockItemId: true,
        unitPrice: true,
        quantity: true,
        createdAt: true,
        purchase: { select: { tarih: true, faturaNo: true, firma: { select: { id: true, name: true } } } },
      },
    }),
    lite ? null : prisma.purchaseItem.groupBy({
      by: ["stockItemId"],
      where: receivedWhere,
      _sum: { quantity: true, lineTotal: true },
    }),
    lite ? null : prisma.purchaseItem.groupBy({
      by: ["stockItemId"],
      where: orderWhere,
      _sum: { quantity: true },
    }),
    lite ? null : prisma.stockLot.findMany({
      where: {
        stockItemId: { in: itemIds },
        status: "AKTIF",
        quantityRemaining: { gt: 0 },
        ...scope,
      },
      select: { stockItemId: true, quantityRemaining: true, unitCost: true, expiresAt: true },
    }),
    // Alış fiyatı ve maliyet finans bilgisidir: finance:read olmayan roller
    // (asistan, banko, doktor) stok miktarını görür ama maliyeti görmez.
    hasEffectivePermission(auth.user, "finance:read"),
  ]);

  const lastByItem = new Map(lastLines.map((line) => [line.stockItemId, line]));
  const receivedByItem = new Map((receivedSums || []).map((row) => [row.stockItemId, row._sum]));
  const onOrderByItem = new Map((orderSums || []).map((row) => [row.stockItemId, Number(row._sum.quantity || 0)]));
  const lotsByItem = new Map<string, NonNullable<typeof activeLots>>();
  for (const lot of activeLots || []) {
    const list = lotsByItem.get(lot.stockItemId) || [];
    list.push(lot);
    lotsByItem.set(lot.stockItemId, list);
  }

  return NextResponse.json(items.map((item) => {
    const received = receivedByItem.get(item.id);
    const enriched = enrichStockItem(item, {
      lastLine: lastByItem.get(item.id) || null,
      receivedQuantity: Number(received?.quantity || 0),
      receivedCost: Number(received?.lineTotal || 0),
      activeLots: lotsByItem.get(item.id) || [],
      onOrderQuantity: onOrderByItem.get(item.id) || 0,
    });
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

  const initialQuantity = quantity;
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
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
          // Açılış stoku varsa SKT o partiye yazılır (aşağıda); kartta kalırsa
          // parti bitip yenileri gelince ürün kalıcı olarak "SKT geçti" görünüyordu.
          expiresAt: initialQuantity > 0 ? null : expiryDate,
          storageLocation,
        },
      });

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
          expiresAt: expiryDate,
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
  return NextResponse.json(enrichStockItem(item, {}), { status: 201 });
}
