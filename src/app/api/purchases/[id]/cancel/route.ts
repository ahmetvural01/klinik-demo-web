import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAllAuth, writeAudit } from "@/lib/api";
import { reversePurchaseItemStock } from "@/lib/stock-ledger";
import { findPurchasePayments, firmaIslemToken } from "@/lib/purchase-payment-links";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";
import { requireActiveBranch } from "@/lib/branch-context";
import { BusinessRuleError, publicErrorResponse } from "@/lib/public-error";

// POST /api/purchases/[id]/cancel — tüm kalemlerin stoğu geri alınır (gerçek FK üzerinden,
// tag-eşleştirme yok), bağlı FirmaIslem ve Purchase İPTAL olarak işaretlenir.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAllAuth(["finance:write", "stock:write"]);
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const purchase = await (prisma as any).purchase.findFirst({
      where: { id: params.id, branchId: branch.branchId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
      include: { items: { where: { archivedAt: null } }, firma: { select: { name: true } } },
    });
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });
    if (purchase.status !== "AKTIF") {
      return NextResponse.json({
        ok: true,
        duplicateRequest: true,
        message: "Bu satın alma zaten iptal edilmiş",
      });
    }

    const result = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${purchase.id} FOR UPDATE`;
      const current = await tx.purchase.findFirst({
        where: {
          id: purchase.id,
          branchId: branch.branchId,
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
        include: { items: { where: { archivedAt: null } }, firma: { select: { name: true } } },
      });
      if (!current) throw new Error("PURCHASE_NOT_FOUND");
      if (current.status !== "AKTIF") {
        return { duplicate: true, receiptStatus: current.receiptStatus, firmaName: current.firma.name };
      }

      const systemLinkedPayments = await findPurchasePayments(tx, current.id, current.firmaId);
      const systemLinkedPaymentIds = new Set(systemLinkedPayments.map((payment: any) => payment.id));
      if (current.firmaIslemId) {
        const allocations = await tx.firmaPaymentAllocation.findMany({
          where: { debtIslemId: current.firmaIslemId },
          select: {
            paymentIslemId: true,
            paymentIslem: {
              select: {
                paymentAllocations: {
                  select: { debtIslemId: true },
                },
              },
            },
          },
        });
        const hasExternalPayment = allocations.some(
          (allocation: any) => !systemLinkedPaymentIds.has(allocation.paymentIslemId),
        );
        const hasSharedPayment = allocations.some(
          (allocation: any) => allocation.paymentIslem.paymentAllocations.some(
            (item: any) => item.debtIslemId !== current.firmaIslemId,
          ),
        );
        if (hasExternalPayment || hasSharedPayment) {
          throw new BusinessRuleError(
            "Bu satın alma firma ödemelerinden mahsup edilmiş. Önce ilgili firma ödeme kaydını iptal edin veya düzeltin.",
            409,
          );
        }
      }

      if (current.receiptStatus === "TESLIM_ALINDI") {
        for (const item of current.items) {
          await reversePurchaseItemStock({
            tx,
            purchaseItemId: item.id,
            stockItemId: item.stockItemId,
            institutionId: auth.user.institutionId,
            branchId: branch.branchId,
            userId: auth.user.id,
            note: `Satın alma iptali: ${current.firma.name} (${item.productName})`,
          });
        }
      }
      if (current.firmaIslemId) {
        await tx.firmaIslem.update({ where: { id: current.firmaIslemId }, data: { status: "IPTAL" } });
      }
      for (const payment of systemLinkedPayments) {
        await tx.firmaIslem.update({ where: { id: payment.id }, data: { status: "IPTAL" } });
        await tx.expense.updateMany({
          where: {
            branchId: branch.branchId,
            status: "AKTIF",
            OR: [
              { sourceType: "FIRMA_ISLEM", sourceId: payment.id },
              { description: { contains: firmaIslemToken(payment.id) } },
            ],
          },
          data: { status: "IPTAL" },
        });
      }
      await tx.purchase.update({ where: { id: current.id }, data: { status: "IPTAL" } });
      await rebuildFirmaPaymentAllocations(tx, current.firmaId, branch.branchId);
      return { duplicate: false, receiptStatus: current.receiptStatus, firmaName: current.firma.name };
    });

    if (!result.duplicate) {
      await writeAudit(auth.user.id, "PURCHASE_CANCEL", `${result.firmaName} satın alması iptal edildi (${params.id})`);
    }

    return NextResponse.json({
      ok: true,
      duplicateRequest: result.duplicate,
      message: result.duplicate
        ? "Bu satın alma zaten iptal edilmiş"
        : result.receiptStatus === "TESLIM_ALINDI"
        ? "Satın alma iptal edildi, stok ve firma bakiyesi geri alındı"
        : "Teslim alınmamış sipariş iptal edildi; stok ve firma bakiyesi değişmedi",
    });
  } catch (e) {
    console.error("[purchases/:id/cancel POST]", e);
    if (e instanceof Error && e.message === "PURCHASE_NOT_FOUND") {
      return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });
    }
    const publicError = publicErrorResponse(e, "Satın alma iptal edilemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
