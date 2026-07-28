import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { purchaseUpdateSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement, reversePurchaseItemStock } from "@/lib/stock-ledger";
import { resolveOrCreateStockItem } from "@/lib/purchase-helpers";
import { findPurchasePayments, firmaIslemToken, purchasePaymentToken, sumPurchasePayments } from "@/lib/purchase-payment-links";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";

function toPublicPurchase(purchase: any) {
  if (!purchase) return purchase;
  const {
    requestKey: _requestKey,
    receiptRequestKey: _receiptRequestKey,
    ...publicPurchase
  } = purchase;
  return publicPurchase;
}

async function loadPurchase(id: string, institutionId: string | null) {
  return (prisma as any).purchase.findFirst({
    where: { id, ...(institutionId ? { institutionId } : {}) },
    include: {
      items: true,
      firma: { select: { id: true, name: true, institutionId: true, paymentTerms: true, customPaymentDays: true } },
      firmaIslem: true,
    },
  });
}

// GET /api/purchases/[id] — tek satın alma + kalemleri
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const purchase = await loadPurchase(params.id, auth.user.institutionId);
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });

    const payments = await findPurchasePayments(
      prisma as any,
      purchase.id,
      purchase.firmaId,
      purchase.firmaIslemId,
    );
    const paidTotal = sumPurchasePayments(payments);
    const total = Math.round(
      Number(
        purchase.firmaIslem?.tutar
        || purchase.items.reduce((sum: number, item: any) => sum + Number(item.lineTotal || 0), 0),
      ) * 100,
    ) / 100;
    const remaining = Math.round((total - paidTotal) * 100) / 100;

    return NextResponse.json({
      ...toPublicPurchase(purchase),
      paymentSummary: {
        total,
        paidTotal,
        remaining,
        status: paidTotal <= 0 ? "ODENMEDI" : remaining <= 0 ? "ODENDI" : "KISMI",
        payments: payments.map((payment: any) => ({
          id: payment.id,
          tarih: payment.tarih,
          tutar: Number(payment.tutar),
          yontem: payment.yontem,
        })),
      },
    });
  } catch (e) {
    console.error("[purchases/:id GET]", e);
    return NextResponse.json({ error: "Satın alma yüklenemedi" }, { status: 503 });
  }
}

// PATCH /api/purchases/[id] — başlık düzeltmesi + satır bazlı düzeltme (miktar/fiyat/ürün
// değişikliği stok ve firma bakiyesine otomatik olarak fark kadar yansıtılır).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const purchase = await loadPurchase(params.id, auth.user.institutionId);
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });
    if (purchase.status !== "AKTIF") {
      return NextResponse.json({ error: "İptal edilmiş bir satın alma düzenlenemez" }, { status: 400 });
    }

    const parsed = purchaseUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Düzeltme bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
    const { tarih, faturaNo, aciklama, kdvOrani, items } = parsed.data;
    const institutionId = auth.user.institutionId;
    const firma = purchase.firma;
    const isReceived = purchase.receiptStatus === "TESLIM_ALINDI";

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const existingById = new Map<string, any>(purchase.items.map((i: any) => [i.id, i]));
      const incomingIds = new Set(items.filter((i) => i.id).map((i) => i.id));

      // Silinen satırlar: stoğu geri al, kaydı sil.
      for (const existing of purchase.items) {
        if (incomingIds.has(existing.id)) continue;
        if (isReceived) {
          await reversePurchaseItemStock({
            tx,
            purchaseItemId: existing.id,
            stockItemId: existing.stockItemId,
            institutionId,
            userId: auth.user.id,
            note: `Satın alma düzeltmesi: satır silindi (${existing.productName})`,
          });
        }
        await tx.purchaseItem.delete({ where: { id: existing.id } });
      }

      let runningTotal = 0;

      for (const incoming of items) {
        const existing = incoming.id ? existingById.get(incoming.id) : null;

        if (!existing) {
          // Yeni satır eklendi.
          const resolved = await resolveOrCreateStockItem(tx, institutionId, firma.name, incoming);
          const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
          const createdItem = await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              stockItemId: resolved.id,
              productName: resolved.name,
              quantity: incoming.quantity,
              unit: resolved.unit,
              unitPrice: incoming.unitPrice,
              lineTotal,
              lotNo: incoming.lotNo || null,
              expiresAt: incoming.expiresAt ? new Date(incoming.expiresAt) : null,
            },
          });
          const movement = isReceived
            ? await applyStockMovement({
                tx,
                stockItemId: resolved.id,
                institutionId,
                userId: auth.user.id,
                type: "GIRIS",
                quantity: incoming.quantity,
                note: `${firma.name} satın alma düzeltmesi: yeni satır`,
                supplier: firma.name,
                unitPrice: incoming.unitPrice,
                purchaseItemId: createdItem.id,
                lotNo: incoming.lotNo,
                receivedAt: purchase.receivedAt || purchase.tarih,
                expiresAt: incoming.expiresAt,
              })
            : null;
          if (movement) {
            await tx.purchaseItem.update({
              where: { id: createdItem.id },
              data: { stockMovementId: movement.movement.id },
            });
          }
          runningTotal += lineTotal;
          continue;
        }

        // Ürün değişti mi? Yazıyla girilen ürün adı önce mevcut stok kartına
        // çözümlenir; aynı karta denk geliyorsa gereksiz çıkış/giriş yapılmaz.
        const resolvedIncoming = incoming.stockItemId
          ? null
          : await resolveOrCreateStockItem(tx, institutionId, firma.name, incoming);
        const incomingStockItemId = incoming.stockItemId || resolvedIncoming?.id || null;
        const productChanged = Boolean(incomingStockItemId && incomingStockItemId !== existing.stockItemId);

        if (productChanged) {
          if (isReceived) {
            await reversePurchaseItemStock({
              tx,
              purchaseItemId: existing.id,
              stockItemId: existing.stockItemId,
              institutionId,
              userId: auth.user.id,
              note: `Satın alma düzeltmesi: ürün değiştirildi (${existing.productName} çıkarıldı)`,
            });
          }
          const resolved = resolvedIncoming || (await resolveOrCreateStockItem(tx, institutionId, firma.name, incoming));
          const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
          await tx.purchaseItem.update({
            where: { id: existing.id },
            data: {
              stockItemId: resolved.id,
              productName: resolved.name,
              quantity: incoming.quantity,
              unit: resolved.unit,
              unitPrice: incoming.unitPrice,
              lineTotal,
              stockMovementId: null,
              lotNo: incoming.lotNo || null,
              expiresAt: incoming.expiresAt ? new Date(incoming.expiresAt) : null,
            },
          });
          const movement = isReceived
            ? await applyStockMovement({
                tx,
                stockItemId: resolved.id,
                institutionId,
                userId: auth.user.id,
                type: "GIRIS",
                quantity: incoming.quantity,
                note: `${firma.name} satın alma düzeltmesi: ürün değişti`,
                supplier: firma.name,
                unitPrice: incoming.unitPrice,
                purchaseItemId: existing.id,
                lotNo: incoming.lotNo,
                receivedAt: purchase.receivedAt || purchase.tarih,
                expiresAt: incoming.expiresAt,
              })
            : null;
          if (movement) {
            await tx.purchaseItem.update({
              where: { id: existing.id },
              data: { stockMovementId: movement.movement.id },
            });
          }
          runningTotal += lineTotal;
          continue;
        }

        // Aynı üründe miktar, maliyet veya parti bilgisi değiştiyse henüz
        // tüketilmemiş eski parti kapatılır ve düzeltilmiş parti yeniden açılır.
        const incomingExpiry = incoming.expiresAt ? new Date(incoming.expiresAt).getTime() : null;
        const existingExpiry = existing.expiresAt ? new Date(existing.expiresAt).getTime() : null;
        const stockDataChanged =
          incoming.quantity !== Number(existing.quantity)
          || incoming.unitPrice !== Number(existing.unitPrice)
          || (incoming.lotNo || null) !== (existing.lotNo || null)
          || incomingExpiry !== existingExpiry;
        if (isReceived && stockDataChanged) {
          await reversePurchaseItemStock({
            tx,
            purchaseItemId: existing.id,
            stockItemId: existing.stockItemId,
            institutionId,
            userId: auth.user.id,
            note: `Satın alma düzeltmesi: parti yeniden oluşturuldu (${existing.productName})`,
          });
        }
        const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
        await tx.purchaseItem.update({
          where: { id: existing.id },
          data: {
            quantity: incoming.quantity,
            unitPrice: incoming.unitPrice,
            lineTotal,
            lotNo: incoming.lotNo || null,
            expiresAt: incoming.expiresAt ? new Date(incoming.expiresAt) : null,
            stockMovementId: stockDataChanged && isReceived ? null : undefined,
          },
        });
        if (isReceived && stockDataChanged) {
          const movement = await applyStockMovement({
            tx,
            stockItemId: existing.stockItemId,
            institutionId,
            userId: auth.user.id,
            type: "GIRIS",
            quantity: incoming.quantity,
            note: "Satın alma düzeltmesi: parti yeniden oluşturuldu",
            supplier: firma.name,
            unitPrice: incoming.unitPrice,
            purchaseItemId: existing.id,
            lotNo: incoming.lotNo,
            receivedAt: purchase.receivedAt || purchase.tarih,
            expiresAt: incoming.expiresAt,
          });
          await tx.purchaseItem.update({
            where: { id: existing.id },
            data: { stockMovementId: movement.movement.id },
          });
        }
        runningTotal += lineTotal;
      }

      const total = Math.round(runningTotal * 100) / 100;
      const newTarih = tarih ? new Date(tarih) : purchase.tarih;
      const newFaturaNo = faturaNo !== undefined ? faturaNo : purchase.faturaNo;
      const newAciklama = aciklama !== undefined ? aciklama : purchase.aciklama;
      const newKdvOrani = kdvOrani !== undefined ? kdvOrani : purchase.kdvOrani;

      const allocatedPayments = await findPurchasePayments(
        tx,
        purchase.id,
        purchase.firmaId,
        purchase.firmaIslemId,
      );
      const systemLinkedPayments = await findPurchasePayments(tx, purchase.id, purchase.firmaId);
      const paidTotal = sumPurchasePayments(allocatedPayments);
      if (paidTotal > total) {
        throw new Error(
          `Bağlı ödeme toplamı (${paidTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL) satın alma toplamını aşamaz. Önce ödeme kaydını düzeltin veya iptal edin.`,
        );
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { tarih: newTarih, faturaNo: newFaturaNo, aciklama: newAciklama, kdvOrani: newKdvOrani },
      });

      if (purchase.firmaIslemId) {
        await tx.firmaIslem.update({
          where: { id: purchase.firmaIslemId },
          data: {
            tutar: total,
            tarih: newTarih,
            faturaNo: newFaturaNo,
            kdvOrani: newKdvOrani,
            dueDate: null,
          },
        });
      }

      for (const payment of systemLinkedPayments) {
        await tx.firmaIslem.update({
          where: { id: payment.id },
          data: {
            faturaNo: newFaturaNo,
            kdvOrani: newKdvOrani,
            aciklama: `${newFaturaNo ? `Fatura ${newFaturaNo} ` : ""}satın alma ödemesi ${purchasePaymentToken(purchase.id)}`.trim(),
          },
        });
        await tx.expense.updateMany({
          where: {
            status: "AKTIF",
            OR: [
              { sourceType: "FIRMA_ISLEM", sourceId: payment.id },
              { description: { contains: firmaIslemToken(payment.id) } },
            ],
          },
          data: {
            faturaNo: newFaturaNo,
            kdvOrani: newKdvOrani,
          },
        });
      }
      await rebuildFirmaPaymentAllocations(tx, purchase.firmaId);

      return tx.purchase.findUnique({ where: { id: purchase.id }, include: { items: true } });
    });

    await writeAudit(auth.user.id, "PURCHASE_UPDATE", `${firma.name} satın alması düzeltildi (${params.id})`);

    return NextResponse.json(toPublicPurchase(updated));
  } catch (e) {
    console.error("[purchases/:id PATCH]", e);
    const message = e instanceof Error ? e.message : "Satın alma düzeltilemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
