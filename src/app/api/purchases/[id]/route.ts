import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAllAuth, requireAuth, writeAudit } from "@/lib/api";
import { purchaseUpdateSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement, reversePurchaseItemStock } from "@/lib/stock-ledger";
import { resolveOrCreateStockItem } from "@/lib/purchase-helpers";
import { findPurchasePayments, firmaIslemToken, purchasePaymentToken, sumPurchasePayments } from "@/lib/purchase-payment-links";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";
import { requireActiveBranch } from "@/lib/branch-context";
import { BusinessRuleError, publicErrorResponse } from "@/lib/public-error";
import { BUSY_MESSAGE, PURCHASE_TX_OPTIONS, isTransientDbError, withProductName } from "../transaction-errors";

function toPublicPurchase(purchase: any) {
  if (!purchase) return purchase;
  const {
    requestKey: _requestKey,
    receiptRequestKey: _receiptRequestKey,
    ...publicPurchase
  } = purchase;
  return publicPurchase;
}

async function loadPurchase(id: string, institutionId: string | null, branchId: string) {
  return (prisma as any).purchase.findFirst({
    where: { id, branchId, ...(institutionId ? { institutionId } : {}) },
    include: {
      items: { where: { archivedAt: null } },
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
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const purchase = await loadPurchase(params.id, auth.user.institutionId, branch.branchId);
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });

    const itemIds = purchase.items.map((item: any) => item.id as string);
    const [payments, usedLots] = await Promise.all([
      findPurchasePayments(
        prisma as any,
        purchase.id,
        purchase.firmaId,
        purchase.firmaIslemId,
      ),
      // Partisinden çıkış yapılmış satır düzeltilemez/iptal edilemez
      // (assertPurchaseItemLotEditable ile aynı kural); ekran bunu önceden göstersin.
      itemIds.length
        ? prisma.stockLot.findMany({
            where: {
              purchaseItemId: { in: itemIds },
              status: { not: "IPTAL" },
              branchId: branch.branchId,
              ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
            },
            select: { purchaseItemId: true, quantityReceived: true, quantityRemaining: true },
          })
        : Promise.resolve([]),
    ]);
    const consumedItemIds = new Set(
      usedLots
        .filter((lot) => Number(lot.quantityRemaining) < Number(lot.quantityReceived))
        .map((lot) => lot.purchaseItemId),
    );
    const paidTotal = sumPurchasePayments(payments);
    const total = Math.round(
      Number(
        purchase.firmaIslem?.tutar
        || purchase.items.reduce((sum: number, item: any) => sum + Number(item.lineTotal || 0), 0),
      ) * 100,
    ) / 100;
    const remaining = Math.round((total - paidTotal) * 100) / 100;

    const publicPurchase = toPublicPurchase(purchase);
    return NextResponse.json({
      ...publicPurchase,
      items: (publicPurchase.items || []).map((item: any) => ({ ...item, consumed: consumedItemIds.has(item.id) })),
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
    const auth = await requireAllAuth(["finance:write", "stock:write"]);
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const purchase = await loadPurchase(params.id, auth.user.institutionId, branch.branchId);
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
    const incomingIds = items.filter((item) => item.id).map((item) => item.id as string);
    if (new Set(incomingIds).size !== incomingIds.length) {
      return NextResponse.json({ error: "Satın alma satırlarından biri bu siparişe ait değil veya tekrar edilmiş" }, { status: 400 });
    }

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${params.id} FOR UPDATE`;
      const current = await tx.purchase.findFirst({
        where: { id: params.id, institutionId, branchId: branch.branchId },
        include: {
          items: { where: { archivedAt: null } },
          firma: { select: { id: true, name: true, institutionId: true, paymentTerms: true, customPaymentDays: true } },
        },
      });
      if (!current) throw new BusinessRuleError("Satın alma bulunamadı", 404);
      if (current.status !== "AKTIF") throw new BusinessRuleError("İptal edilmiş bir satın alma düzenlenemez", 409);

      const purchaseItemIds = new Set(current.items.map((item: any) => item.id));
      if (incomingIds.some((id) => !purchaseItemIds.has(id))) {
        throw new BusinessRuleError("Satın alma satırlarından biri bu siparişe ait değil", 409);
      }
      const firma = current.firma;
      const isReceived = current.receiptStatus === "TESLIM_ALINDI";
      const existingById = new Map<string, any>(current.items.map((i: any) => [i.id, i]));
      const incomingIdSet = new Set(incomingIds);

      // Silinen satırlar stoktan geri alınır ve geçmiş için arşivlenir.
      for (const existing of current.items) {
        if (incomingIdSet.has(existing.id)) continue;
        if (isReceived) {
          await withProductName(existing.productName, () => reversePurchaseItemStock({
            tx,
            purchaseItemId: existing.id,
            stockItemId: existing.stockItemId,
            institutionId,
            branchId: branch.branchId,
            userId: auth.user.id,
            note: `Satın alma düzeltmesi: satır silindi (${existing.productName})`,
          }));
        }
        await tx.purchaseItem.update({
          where: { id: existing.id },
          data: {
            archivedAt: new Date(),
            archivedById: auth.user.id,
            archiveReason: "Satın alma düzenlemesinde satır kaldırıldı",
          },
        });
      }

      let runningTotal = 0;
      // Lot no / son kullanma artık ekrandan gelmez: gönderilmediyse satırdaki
      // (eski) değer korunur; aksi halde her düzeltme stoğu geri alıp yeniden
      // girmeye, kullanılmış satırda da düzeltmeyi reddetmeye çalışırdı.
      const lineLotNo = (incoming: { lotNo?: string | null }, existing?: { lotNo?: string | null } | null) =>
        incoming.lotNo === undefined ? existing?.lotNo || null : incoming.lotNo || null;
      const lineExpiresAt = (incoming: { expiresAt?: string | null }, existing?: { expiresAt?: Date | null } | null) =>
        incoming.expiresAt === undefined ? existing?.expiresAt || null : incoming.expiresAt ? new Date(incoming.expiresAt) : null;

      for (const incoming of items) {
        const existing = incoming.id ? existingById.get(incoming.id) : null;

        if (!existing) {
          // Yeni satır eklendi.
          const resolved = await resolveOrCreateStockItem(tx, institutionId, branch.branchId, firma.name, incoming);
          const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
          const lotNo = lineLotNo(incoming);
          const expiresAt = lineExpiresAt(incoming);
          const createdItem = await tx.purchaseItem.create({
            data: {
              institutionId,
              branchId: branch.branchId,
              purchaseId: current.id,
              stockItemId: resolved.id,
              productName: resolved.name,
              quantity: incoming.quantity,
              unit: resolved.unit,
              unitPrice: incoming.unitPrice,
              lineTotal,
              lotNo,
              expiresAt,
            },
          });
          const movement = isReceived
            ? await applyStockMovement({
                tx,
                stockItemId: resolved.id,
                institutionId,
                branchId: branch.branchId,
                userId: auth.user.id,
                type: "GIRIS",
                quantity: incoming.quantity,
                note: `${firma.name} satın alma düzeltmesi: yeni satır`,
                supplier: firma.name,
                unitPrice: incoming.unitPrice,
                purchaseItemId: createdItem.id,
                lotNo,
                receivedAt: current.receivedAt || current.tarih,
                expiresAt,
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
          : await resolveOrCreateStockItem(tx, institutionId, branch.branchId, firma.name, incoming);
        const incomingStockItemId = incoming.stockItemId || resolvedIncoming?.id || null;
        const productChanged = Boolean(incomingStockItemId && incomingStockItemId !== existing.stockItemId);

        if (productChanged) {
          if (isReceived) {
            await withProductName(existing.productName, () => reversePurchaseItemStock({
              tx,
              purchaseItemId: existing.id,
              stockItemId: existing.stockItemId,
              institutionId,
              branchId: branch.branchId,
              userId: auth.user.id,
              note: `Satın alma düzeltmesi: ürün değiştirildi (${existing.productName} çıkarıldı)`,
            }));
          }
          const resolved = resolvedIncoming || (await resolveOrCreateStockItem(tx, institutionId, branch.branchId, firma.name, incoming));
          const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
          // Ürün değiştiyse eski ürünün lot bilgisi taşınmaz.
          const lotNo = lineLotNo(incoming);
          const expiresAt = lineExpiresAt(incoming);
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
              lotNo,
              expiresAt,
            },
          });
          const movement = isReceived
            ? await applyStockMovement({
                tx,
                stockItemId: resolved.id,
                institutionId,
                branchId: branch.branchId,
                userId: auth.user.id,
                type: "GIRIS",
                quantity: incoming.quantity,
                note: `${firma.name} satın alma düzeltmesi: ürün değişti`,
                supplier: firma.name,
                unitPrice: incoming.unitPrice,
                purchaseItemId: existing.id,
                lotNo,
                receivedAt: current.receivedAt || current.tarih,
                expiresAt,
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

        // Aynı üründe miktar ya da fiyat (eski istemcide lot bilgisi) değiştiyse
        // henüz kullanılmamış eski giriş geri alınır ve düzeltilmiş giriş yapılır.
        const lotNo = lineLotNo(incoming, existing);
        const expiresAt = lineExpiresAt(incoming, existing);
        const incomingExpiry = expiresAt ? new Date(expiresAt).getTime() : null;
        const existingExpiry = existing.expiresAt ? new Date(existing.expiresAt).getTime() : null;
        const stockDataChanged =
          incoming.quantity !== Number(existing.quantity)
          || incoming.unitPrice !== Number(existing.unitPrice)
          || lotNo !== (existing.lotNo || null)
          || incomingExpiry !== existingExpiry;
        if (isReceived && stockDataChanged) {
          await withProductName(existing.productName, () => reversePurchaseItemStock({
            tx,
            purchaseItemId: existing.id,
            stockItemId: existing.stockItemId,
            institutionId,
            branchId: branch.branchId,
            userId: auth.user.id,
            note: `Satın alma düzeltmesi: önceki giriş geri alındı (${existing.productName})`,
          }));
        }
        const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
        await tx.purchaseItem.update({
          where: { id: existing.id },
          data: {
            quantity: incoming.quantity,
            unitPrice: incoming.unitPrice,
            lineTotal,
            lotNo,
            expiresAt,
            stockMovementId: stockDataChanged && isReceived ? null : undefined,
          },
        });
        if (isReceived && stockDataChanged) {
          const movement = await applyStockMovement({
            tx,
            stockItemId: existing.stockItemId,
            institutionId,
            branchId: branch.branchId,
            userId: auth.user.id,
            type: "GIRIS",
            quantity: incoming.quantity,
            note: `${firma.name} satın alma düzeltmesi: düzeltilmiş giriş`,
            supplier: firma.name,
            unitPrice: incoming.unitPrice,
            purchaseItemId: existing.id,
            lotNo,
            receivedAt: current.receivedAt || current.tarih,
            expiresAt,
          });
          await tx.purchaseItem.update({
            where: { id: existing.id },
            data: { stockMovementId: movement.movement.id },
          });
        }
        runningTotal += lineTotal;
      }

      const total = Math.round(runningTotal * 100) / 100;
      const newTarih = tarih ? new Date(tarih) : current.tarih;
      const newFaturaNo = faturaNo !== undefined ? faturaNo : current.faturaNo;
      const newAciklama = aciklama !== undefined ? aciklama : current.aciklama;
      const newKdvOrani = kdvOrani !== undefined ? kdvOrani : current.kdvOrani;

      const allocatedPayments = await findPurchasePayments(
        tx,
        current.id,
        current.firmaId,
        current.firmaIslemId,
      );
      const systemLinkedPayments = await findPurchasePayments(tx, current.id, current.firmaId);
      const paidTotal = sumPurchasePayments(allocatedPayments);
      if (paidTotal > total) {
        throw new BusinessRuleError(
          `Bağlı ödeme toplamı (${paidTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL) satın alma toplamını aşamaz. Önce ödeme kaydını düzeltin veya iptal edin.`,
          409,
        );
      }

      await tx.purchase.update({
        where: { id: current.id },
        data: { tarih: newTarih, faturaNo: newFaturaNo, aciklama: newAciklama, kdvOrani: newKdvOrani },
      });

      if (current.firmaIslemId) {
        await tx.firmaIslem.update({
          where: { id: current.firmaIslemId },
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
            aciklama: `${newFaturaNo ? `Fatura ${newFaturaNo} ` : ""}satın alma ödemesi ${purchasePaymentToken(current.id)}`.trim(),
          },
        });
        await tx.expense.updateMany({
          where: {
            branchId: branch.branchId,
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
      await rebuildFirmaPaymentAllocations(tx, current.firmaId, branch.branchId);

      return tx.purchase.findUnique({
        where: { id: current.id },
        include: { items: { where: { archivedAt: null } } },
      });
    }, { isolationLevel: "Serializable", ...PURCHASE_TX_OPTIONS });

    await writeAudit(auth.user.id, "PURCHASE_UPDATE", `${purchase.firma.name} satın alması düzeltildi (${params.id})`);

    return NextResponse.json(toPublicPurchase(updated));
  } catch (e) {
    console.error("[purchases/:id PATCH]", e);
    // Serializable işlemde yazma çakışması (P2034) ya da süre dolması: değişiklik geri alındı, yeniden denenebilir.
    if (isTransientDbError(e)) return NextResponse.json({ error: BUSY_MESSAGE }, { status: 503 });
    const publicError = publicErrorResponse(e, "Satın alma düzeltilemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
