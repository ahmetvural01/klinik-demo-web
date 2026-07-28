import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { purchaseCreateSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement } from "@/lib/stock-ledger";
import { resolveOrCreateStockItem } from "@/lib/purchase-helpers";
import { applyFirmaIslemIntegration } from "@/lib/firma-integration";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";
import { purchasePaymentToken } from "@/lib/purchase-payment-links";

function toPublicPurchase(purchase: any) {
  if (!purchase) return purchase;
  const {
    requestKey: _requestKey,
    receiptRequestKey: _receiptRequestKey,
    ...publicPurchase
  } = purchase;
  return publicPurchase;
}

// GET /api/purchases?firmaId=&from=&to=&q= — tüm satın alımlar (firmaId verilmezse kurumdaki tüm firmalar)
export const GET = withApiTiming("purchases", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const firmaId = searchParams.get("firmaId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {
      status: "AKTIF",
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    };
    if (firmaId) where.firmaId = firmaId;
    if (from || to) {
      where.tarih = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59") } : {}),
      };
    }
    if (q) {
      where.OR = [
        { faturaNo: { contains: q, mode: "insensitive" } },
        { firma: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const purchases = await (prisma as any).purchase.findMany({
      where,
      include: {
        firma: { select: { id: true, name: true } },
        firmaIslem: { select: { tutar: true, dueDate: true } },
        items: { select: { lineTotal: true } },
        _count: { select: { items: true } },
      },
      orderBy: { tarih: "desc" },
      take: 2000, // güvenlik sınırı: tek istek asla tüm tabloyu döndürmesin
    });

    return NextResponse.json(purchases.map((purchase: any) => {
      const publicPurchase = toPublicPurchase(purchase);
      const { items, ...summary } = publicPurchase;
      return {
        ...summary,
        total: Math.round(
          Number(
            purchase.firmaIslem?.tutar
            || items.reduce((sum: number, item: any) => sum + Number(item.lineTotal || 0), 0),
          ) * 100,
        ) / 100,
      };
    }));
  } catch (e) {
    console.error("[purchases GET]", e);
    return NextResponse.json({ message: "Satın alımlar yüklenemedi" }, { status: 503 });
  }
});

// POST /api/purchases — çok kalemli satın alma: her satır stoğa girer, toplam tek bir ALIM
// tipi FirmaIslem'e yazılır (firma bakiyesi/ekstre hesabı bu satırdan hiç etkilenmeden çalışır).
export async function POST(req: NextRequest) {
  let requestKey: string | null = null;
  let institutionId: string | null = null;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    institutionId = auth.user.institutionId;
    requestKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 180) || null;

    if (requestKey) {
      const existing = await (prisma as any).purchase.findFirst({
        where: {
          requestKey,
          ...(institutionId ? { institutionId } : {}),
        },
        include: { items: true },
      });
      if (existing) {
        return NextResponse.json({ ...toPublicPurchase(existing), duplicateRequest: true }, { status: 200 });
      }
    }

    const parsed = purchaseCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Satın alma bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
    const {
      firmaId,
      tarih,
      receiptStatus,
      faturaNo,
      aciklama,
      kdvOrani,
      items,
      paidNow,
      paymentDate,
      paymentMethod,
      paymentAmount,
    } = parsed.data;

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: firmaId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, name: true, institutionId: true, paymentTerms: true, customPaymentDays: true },
    });
    if (!firma) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });
    }

    const transactionDate = new Date(tarih);

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const lineData: {
        stockItemId: string;
        productName: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        lineTotal: number;
        lotNo: string | null;
        expiresAt: Date | null;
      }[] = [];

      for (const item of items) {
        const resolved = await resolveOrCreateStockItem(tx, auth.user.institutionId, firma.name, item);
        lineData.push({
          stockItemId: resolved.id,
          productName: resolved.name,
          quantity: item.quantity,
          unit: resolved.unit,
          unitPrice: item.unitPrice,
          lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
          lotNo: item.lotNo || null,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
        });
      }

      const total = Math.round(lineData.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
      const isReceived = receiptStatus === "TESLIM_ALINDI";

      const firmaIslem = isReceived
        ? await tx.firmaIslem.create({
            data: {
              firmaId: firma.id,
              tarih: transactionDate,
              islemTipi: "ALIM",
              urunHizmet: `${lineData.length} kalem`,
              aciklama: aciklama || null,
              tutar: total,
              faturaNo: faturaNo || null,
              dueDate: null,
              kdvOrani,
              status: "AKTIF",
            },
          })
        : null;

      const purchase = await tx.purchase.create({
        data: {
          institutionId: auth.user.institutionId,
          firmaId: firma.id,
          firmaIslemId: firmaIslem?.id || null,
          tarih: transactionDate,
          receiptStatus,
          receivedAt: isReceived ? transactionDate : null,
          faturaNo: faturaNo || null,
          aciklama: aciklama || null,
          kdvOrani,
          status: "AKTIF",
          createdById: auth.user.id,
          requestKey,
        },
      });
      if (firmaIslem) {
        await tx.firmaIslem.update({
          where: { id: firmaIslem.id },
          data: { sourceType: "PURCHASE", sourceId: purchase.id },
        });
      }

      const createdItems = [];
      for (const line of lineData) {
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            stockItemId: line.stockItemId,
            productName: line.productName,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            lotNo: line.lotNo,
            expiresAt: line.expiresAt,
          },
        });
        const movement = isReceived
          ? await applyStockMovement({
              tx,
              stockItemId: line.stockItemId,
              institutionId: auth.user.institutionId,
              userId: auth.user.id,
              type: "GIRIS",
              quantity: line.quantity,
              note: `${firma.name} satın alma${faturaNo ? ` (Fatura: ${faturaNo})` : ""}`,
              supplier: firma.name,
              unitPrice: line.unitPrice,
              purchaseItemId: purchaseItem.id,
              lotNo: line.lotNo,
              receivedAt: transactionDate,
              expiresAt: line.expiresAt,
            })
          : null;

        if (movement) {
          await tx.purchaseItem.update({
            where: { id: purchaseItem.id },
            data: { stockMovementId: movement.movement.id },
          });
        }
        createdItems.push(purchaseItem);
      }

      let paymentIslem = null;
      if (isReceived && paidNow) {
        const amount = Math.round(Number(paymentAmount ?? total) * 100) / 100;
        const paymentTransactionDate = new Date(paymentDate || tarih);
        paymentIslem = await tx.firmaIslem.create({
          data: {
            firmaId: firma.id,
            tarih: paymentTransactionDate,
            islemTipi: "ODEME",
            urunHizmet: "Satın alma ödemesi",
            aciklama: `${faturaNo ? `Fatura ${faturaNo} ` : ""}satın alma ödemesi ${purchasePaymentToken(purchase.id)}`,
            tutar: amount,
            faturaNo: faturaNo || null,
            yontem: paymentMethod,
            dueDate: null,
            kdvOrani,
            status: "AKTIF",
            requestKey: requestKey ? `${requestKey}:payment` : null,
            sourceType: "PURCHASE_PAYMENT",
            sourceId: purchase.id,
          },
        });

        await applyFirmaIslemIntegration({
          tx,
          userId: auth.user.id,
          firma,
          islem: {
            ...paymentIslem,
            tutar: Number(paymentIslem.tutar),
            kdvOrani: Number(paymentIslem.kdvOrani),
          },
        });
        await rebuildFirmaPaymentAllocations(tx, firma.id, {
          preferredDebtByPayment: new Map([[paymentIslem.id, [firmaIslem!.id]]]),
        });
      } else if (firmaIslem) {
        await rebuildFirmaPaymentAllocations(tx, firma.id);
      }

      return { purchase, items: createdItems, total, firmaIslem, paymentIslem, isReceived };
    });

    await writeAudit(
      auth.user.id,
      "PURCHASE_CREATE",
      `${firma.name} için ${result.items.length} kalemlik ${result.isReceived ? "teslim alınmış satın alma" : "sipariş"} kaydedildi. Toplam: ${result.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL${result.paymentIslem ? " · ödeme de işlendi" : ""}`,
    );

    return NextResponse.json({
      ...toPublicPurchase(result.purchase),
      items: result.items,
      total: result.total,
      paymentIslem: result.paymentIslem
        ? (({ requestKey: _requestKey, ...publicPayment }: any) => publicPayment)(result.paymentIslem)
        : null,
    }, { status: 201 });
  } catch (e) {
    if (
      requestKey
      && e
      && typeof e === "object"
      && "code" in e
      && (e as { code?: string }).code === "P2002"
    ) {
      const existing = await (prisma as any).purchase.findFirst({
        where: {
          requestKey,
          ...(institutionId ? { institutionId } : {}),
        },
        include: { items: true },
      });
      if (existing) {
        return NextResponse.json({ ...toPublicPurchase(existing), duplicateRequest: true }, { status: 200 });
      }
    }
    console.error("[purchases POST]", e);
    const message = e instanceof Error ? e.message : "Satın alma kaydedilemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
