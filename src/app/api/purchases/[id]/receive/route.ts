import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { purchaseReceiveSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement } from "@/lib/stock-ledger";
import { applyFirmaIslemIntegration } from "@/lib/firma-integration";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";
import { purchasePaymentToken } from "@/lib/purchase-payment-links";

function toPublicPurchase(purchase: any) {
  if (!purchase) return purchase;
  const {
    requestKey: _requestKey,
    receiptRequestKey: _receiptRequestKey,
    ...rest
  } = purchase;
  return rest;
}

async function loadPurchase(id: string, institutionId: string | null) {
  return (prisma as any).purchase.findFirst({
    where: { id, ...(institutionId ? { institutionId } : {}) },
    include: {
      items: true,
      firma: {
        select: {
          id: true,
          name: true,
          institutionId: true,
          paymentTerms: true,
          customPaymentDays: true,
        },
      },
      firmaIslem: true,
    },
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const requestKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 180) || null;
  const purchase = await loadPurchase(params.id, auth.user.institutionId);
  if (!purchase) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (purchase.status !== "AKTIF") {
    return NextResponse.json({ error: "İptal edilmiş sipariş teslim alınamaz" }, { status: 400 });
  }
  if (purchase.receiptStatus === "TESLIM_ALINDI") {
    return NextResponse.json(
      { ...toPublicPurchase(purchase), duplicateRequest: Boolean(requestKey && purchase.receiptRequestKey === requestKey) },
      { status: 200 },
    );
  }

  const parsed = purchaseReceiveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Teslim alma bilgileri geçersiz", errors: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  const total = Math.round(
    purchase.items.reduce((sum: number, item: any) => sum + Number(item.lineTotal || 0), 0) * 100,
  ) / 100;
  const paymentAmount = parsed.data.paidNow
    ? Math.round(Number(parsed.data.paymentAmount ?? total) * 100) / 100
    : 0;
  if (paymentAmount > total) {
    return NextResponse.json({ error: "Ödeme tutarı sipariş toplamını aşamaz" }, { status: 400 });
  }

  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${purchase.id} FOR UPDATE`;
      const current = await tx.purchase.findUnique({
        where: { id: purchase.id },
        select: { receiptStatus: true, receiptRequestKey: true },
      });
      if (current?.receiptStatus === "TESLIM_ALINDI") {
        return { duplicate: true, paymentIslem: null };
      }

      const receivedAt = new Date(parsed.data.receivedAt);
      const firmaIslem = await tx.firmaIslem.create({
        data: {
          firmaId: purchase.firma.id,
          tarih: receivedAt,
          islemTipi: "ALIM",
          urunHizmet: `${purchase.items.length} kalem`,
          aciklama: purchase.aciklama || null,
          tutar: total,
          faturaNo: purchase.faturaNo || null,
          dueDate: null,
          kdvOrani: purchase.kdvOrani,
          status: "AKTIF",
        },
      });

      for (const item of purchase.items) {
        const movement = await applyStockMovement({
          tx,
          stockItemId: item.stockItemId,
          institutionId: auth.user.institutionId,
          userId: auth.user.id,
          type: "GIRIS",
          quantity: Number(item.quantity),
          note: `${purchase.firma.name} sipariş teslimi${purchase.faturaNo ? ` (Fatura: ${purchase.faturaNo})` : ""}`,
          supplier: purchase.firma.name,
          unitPrice: Number(item.unitPrice),
        });
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { stockMovementId: movement.movement.id },
        });
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          firmaIslemId: firmaIslem.id,
          receiptStatus: "TESLIM_ALINDI",
          receivedAt,
          receiptRequestKey: requestKey,
        },
      });

      let paymentIslem = null;
      if (parsed.data.paidNow) {
        paymentIslem = await tx.firmaIslem.create({
          data: {
            firmaId: purchase.firma.id,
            tarih: new Date(parsed.data.paymentDate || parsed.data.receivedAt),
            islemTipi: "ODEME",
            urunHizmet: "Satın alma ödemesi",
            aciklama: `${purchase.faturaNo ? `Fatura ${purchase.faturaNo} ` : ""}satın alma ödemesi ${purchasePaymentToken(purchase.id)}`,
            tutar: paymentAmount,
            faturaNo: purchase.faturaNo || null,
            yontem: parsed.data.paymentMethod,
            dueDate: null,
            kdvOrani: purchase.kdvOrani,
            status: "AKTIF",
            requestKey: requestKey ? `${requestKey}:payment` : null,
          },
        });
        await applyFirmaIslemIntegration({
          tx,
          userId: auth.user.id,
          firma: purchase.firma,
          islem: {
            ...paymentIslem,
            tutar: Number(paymentIslem.tutar),
            kdvOrani: Number(paymentIslem.kdvOrani),
          },
        });
      }
      await rebuildFirmaPaymentAllocations(tx, purchase.firma.id, {
        preferredDebtByPayment: paymentIslem
          ? new Map([[paymentIslem.id, [firmaIslem.id]]])
          : undefined,
      });
      return { duplicate: false, paymentIslem };
    });

    const fresh = await loadPurchase(purchase.id, auth.user.institutionId);
    await writeAudit(
      auth.user.id,
      "PURCHASE_RECEIVE",
      `${purchase.firma.name} siparişi teslim alındı; ${purchase.items.length} kalem stoğa işlendi${result.paymentIslem ? " ve ödeme kaydedildi" : ""}.`,
    );
    return NextResponse.json(
      { ...toPublicPurchase(fresh), duplicateRequest: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (
      requestKey
      && error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "P2002"
    ) {
      const existing = await loadPurchase(purchase.id, auth.user.institutionId);
      if (existing?.receiptStatus === "TESLIM_ALINDI") {
        return NextResponse.json({ ...toPublicPurchase(existing), duplicateRequest: true }, { status: 200 });
      }
    }
    console.error("[purchases/:id/receive POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sipariş teslim alınamadı" },
      { status: 400 },
    );
  }
}
