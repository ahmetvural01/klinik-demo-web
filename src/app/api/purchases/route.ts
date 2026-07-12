import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { purchaseCreateSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement } from "@/lib/stock-ledger";
import { resolveOrCreateStockItem } from "@/lib/purchase-helpers";
import { applyFirmaIslemIntegration } from "@/lib/firma-integration";
import { purchasePaymentToken } from "@/lib/purchase-payment-links";

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
        _count: { select: { items: true } },
      },
      orderBy: { tarih: "desc" },
      take: 2000, // güvenlik sınırı: tek istek asla tüm tabloyu döndürmesin
    });

    return NextResponse.json(purchases);
  } catch (e) {
    console.error("[purchases GET]", e);
    return NextResponse.json({ message: "Satın alımlar yüklenemedi" }, { status: 503 });
  }
});

// POST /api/purchases — çok kalemli satın alma: her satır stoğa girer, toplam tek bir ALIM
// tipi FirmaIslem'e yazılır (firma bakiyesi/ekstre hesabı bu satırdan hiç etkilenmeden çalışır).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const parsed = purchaseCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Satın alma bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
    const { firmaId, tarih, faturaNo, aciklama, kdvOrani, items, paidNow, paymentDate, paymentMethod, paymentAmount } = parsed.data;

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
      const lineData: { stockItemId: string; productName: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }[] = [];

      for (const item of items) {
        const resolved = await resolveOrCreateStockItem(tx, auth.user.institutionId, firma.name, item);
        lineData.push({
          stockItemId: resolved.id,
          productName: resolved.name,
          quantity: item.quantity,
          unit: resolved.unit,
          unitPrice: item.unitPrice,
          lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
        });
      }

      const total = Math.round(lineData.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;

      const firmaIslem = await tx.firmaIslem.create({
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
      });

      const purchase = await tx.purchase.create({
        data: {
          institutionId: auth.user.institutionId,
          firmaId: firma.id,
          firmaIslemId: firmaIslem.id,
          tarih: transactionDate,
          faturaNo: faturaNo || null,
          aciklama: aciklama || null,
          kdvOrani,
          status: "AKTIF",
          createdById: auth.user.id,
        },
      });

      const createdItems = [];
      for (const line of lineData) {
        const movement = await applyStockMovement({
          tx,
          stockItemId: line.stockItemId,
          institutionId: auth.user.institutionId,
          userId: auth.user.id,
          type: "GIRIS",
          quantity: line.quantity,
          note: `${firma.name} satın alma${faturaNo ? ` (Fatura: ${faturaNo})` : ""}`,
          supplier: firma.name,
          unitPrice: line.unitPrice,
        });

        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            stockItemId: line.stockItemId,
            productName: line.productName,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            stockMovementId: movement.movement.id,
          },
        });
        createdItems.push(purchaseItem);
      }

      let paymentIslem = null;
      if (paidNow) {
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
      }

      return { purchase, items: createdItems, total, firmaIslem, paymentIslem };
    });

    await writeAudit(
      auth.user.id,
      "PURCHASE_CREATE",
      `${firma.name} için ${result.items.length} kalemlik satın alma kaydedildi. Toplam: ${result.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL${result.paymentIslem ? " · ödeme de işlendi" : ""}`,
    );

    return NextResponse.json({ ...result.purchase, items: result.items, total: result.total, paymentIslem: result.paymentIslem }, { status: 201 });
  } catch (e) {
    console.error("[purchases POST]", e);
    const message = e instanceof Error ? e.message : "Satın alma kaydedilemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
