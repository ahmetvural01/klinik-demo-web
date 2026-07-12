import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { purchaseUpdateSchema, formatZodError } from "@/lib/validators";
import { applyStockMovement } from "@/lib/stock-ledger";
import { resolveOrCreateStockItem } from "@/lib/purchase-helpers";
import { findPurchasePayments, firmaIslemToken, purchasePaymentToken, sumPurchasePayments } from "@/lib/purchase-payment-links";

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
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const purchase = await loadPurchase(params.id, auth.user.institutionId);
    if (!purchase) return NextResponse.json({ error: "Satın alma bulunamadı" }, { status: 404 });

    const payments = await findPurchasePayments(prisma as any, purchase.id, purchase.firmaId);
    const paidTotal = sumPurchasePayments(payments);
    const total = Math.round(Number(purchase.firmaIslem?.tutar || 0) * 100) / 100;
    const remaining = Math.round((total - paidTotal) * 100) / 100;

    return NextResponse.json({
      ...purchase,
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
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const existingById = new Map<string, any>(purchase.items.map((i: any) => [i.id, i]));
      const incomingIds = new Set(items.filter((i) => i.id).map((i) => i.id));

      // Silinen satırlar: stoğu geri al, kaydı sil.
      for (const existing of purchase.items) {
        if (incomingIds.has(existing.id)) continue;
        await applyStockMovement({
          tx,
          stockItemId: existing.stockItemId,
          institutionId,
          userId: auth.user.id,
          type: "CIKIS",
          quantity: Number(existing.quantity),
          note: `Satın alma düzeltmesi: satır silindi (${existing.productName})`,
        });
        await tx.purchaseItem.delete({ where: { id: existing.id } });
      }

      let runningTotal = 0;

      for (const incoming of items) {
        const existing = incoming.id ? existingById.get(incoming.id) : null;

        if (!existing) {
          // Yeni satır eklendi.
          const resolved = await resolveOrCreateStockItem(tx, institutionId, firma.name, incoming);
          const movement = await applyStockMovement({
            tx,
            stockItemId: resolved.id,
            institutionId,
            userId: auth.user.id,
            type: "GIRIS",
            quantity: incoming.quantity,
            note: `${firma.name} satın alma düzeltmesi: yeni satır`,
            supplier: firma.name,
            unitPrice: incoming.unitPrice,
          });
          const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
          await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              stockItemId: resolved.id,
              productName: resolved.name,
              quantity: incoming.quantity,
              unit: resolved.unit,
              unitPrice: incoming.unitPrice,
              lineTotal,
              stockMovementId: movement.movement.id,
            },
          });
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
          await applyStockMovement({
            tx,
            stockItemId: existing.stockItemId,
            institutionId,
            userId: auth.user.id,
            type: "CIKIS",
            quantity: Number(existing.quantity),
            note: `Satın alma düzeltmesi: ürün değiştirildi (${existing.productName} çıkarıldı)`,
          });
          const resolved = resolvedIncoming || await resolveOrCreateStockItem(tx, institutionId, firma.name, incoming);
          const movement = await applyStockMovement({
            tx,
            stockItemId: resolved.id,
            institutionId,
            userId: auth.user.id,
            type: "GIRIS",
            quantity: incoming.quantity,
            note: `${firma.name} satın alma düzeltmesi: ürün değişti`,
            supplier: firma.name,
            unitPrice: incoming.unitPrice,
          });
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
              stockMovementId: movement.movement.id,
            },
          });
          runningTotal += lineTotal;
          continue;
        }

        // Aynı ürün: miktar/fiyat farkını uygula.
        const delta = incoming.quantity - Number(existing.quantity);
        if (delta > 0) {
          await applyStockMovement({
            tx, stockItemId: existing.stockItemId, institutionId, userId: auth.user.id,
            type: "GIRIS", quantity: delta, note: "Satın alma düzeltmesi: miktar arttırıldı",
            supplier: firma.name,
            unitPrice: incoming.unitPrice,
          });
        } else if (delta < 0) {
          await applyStockMovement({
            tx, stockItemId: existing.stockItemId, institutionId, userId: auth.user.id,
            type: "CIKIS", quantity: -delta, note: "Satın alma düzeltmesi: miktar azaltıldı",
          });
        }
        const lineTotal = Math.round(incoming.quantity * incoming.unitPrice * 100) / 100;
        await tx.purchaseItem.update({
          where: { id: existing.id },
          data: { quantity: incoming.quantity, unitPrice: incoming.unitPrice, lineTotal },
        });
        runningTotal += lineTotal;
      }

      const total = Math.round(runningTotal * 100) / 100;
      const newTarih = tarih ? new Date(tarih) : purchase.tarih;
      const newFaturaNo = faturaNo !== undefined ? faturaNo : purchase.faturaNo;
      const newAciklama = aciklama !== undefined ? aciklama : purchase.aciklama;
      const newKdvOrani = kdvOrani !== undefined ? kdvOrani : purchase.kdvOrani;

      const linkedPayments = await findPurchasePayments(tx, purchase.id, purchase.firmaId);
      const paidTotal = sumPurchasePayments(linkedPayments);
      if (paidTotal > total) {
        throw new Error(
          `Bağlı ödeme toplamı (${paidTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL) satın alma toplamını aşamaz. Önce ödeme kaydını düzeltin veya iptal edin.`,
        );
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { tarih: newTarih, faturaNo: newFaturaNo, aciklama: newAciklama, kdvOrani: newKdvOrani },
      });

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

      for (const payment of linkedPayments) {
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
            description: { contains: firmaIslemToken(payment.id) },
          },
          data: {
            faturaNo: newFaturaNo,
            kdvOrani: newKdvOrani,
          },
        });
      }

      return tx.purchase.findUnique({ where: { id: purchase.id }, include: { items: true } });
    });

    await writeAudit(auth.user.id, "PURCHASE_UPDATE", `${firma.name} satın alması düzeltildi (${params.id})`);

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[purchases/:id PATCH]", e);
    const message = e instanceof Error ? e.message : "Satın alma düzeltilemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
