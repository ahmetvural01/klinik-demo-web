import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { findPurchasePayments, firmaIslemToken } from "@/lib/purchase-payment-links";

// POST /api/purchases/[id]/cancel — tüm kalemlerin stoğu geri alınır (gerçek FK üzerinden,
// tag-eşleştirme yok), bağlı FirmaIslem ve Purchase İPTAL olarak işaretlenir.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const purchase = await (prisma as any).purchase.findFirst({
      where: { id: params.id, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
      include: { items: true, firma: { select: { name: true } } },
    });
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });
    if (purchase.status !== "AKTIF") {
      return NextResponse.json({ error: "Bu satın alma zaten iptal edilmiş" }, { status: 400 });
    }

    await (prisma as any).$transaction(async (tx: any) => {
      for (const item of purchase.items) {
        await applyStockMovement({
          tx,
          stockItemId: item.stockItemId,
          institutionId: auth.user.institutionId,
          userId: auth.user.id,
          type: "CIKIS",
          quantity: Number(item.quantity),
          note: `Satın alma iptali: ${purchase.firma.name} (${item.productName})`,
        });
      }
      await tx.firmaIslem.update({ where: { id: purchase.firmaIslemId }, data: { status: "IPTAL" } });
      const linkedPayments = await findPurchasePayments(tx, purchase.id, purchase.firmaId);
      for (const payment of linkedPayments) {
        await tx.firmaIslem.update({ where: { id: payment.id }, data: { status: "IPTAL" } });
        await tx.expense.updateMany({
          where: {
            status: "AKTIF",
            description: { contains: firmaIslemToken(payment.id) },
          },
          data: { status: "IPTAL" },
        });
      }
      await tx.purchase.update({ where: { id: purchase.id }, data: { status: "IPTAL" } });
    });

    await writeAudit(auth.user.id, "PURCHASE_CANCEL", `${purchase.firma.name} satın alması iptal edildi (${params.id})`);

    return NextResponse.json({ ok: true, message: "Satın alma iptal edildi, stok ve firma bakiyesi geri alındı" });
  } catch (e) {
    console.error("[purchases/:id/cancel POST]", e);
    const message = e instanceof Error ? e.message : "Satın alma iptal edilemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
