/**
 * taksit-integration.ts
 * ─────────────────────
 * Hasta ödemesi alındığında, gecikmiş / bekleyen taksit taksitlerini
 * otomatik olarak en eski vade tarihinden itibaren kapatır.
 * Prisma transaction içinde kullanılmak üzere tasarlanmıştır.
 */

import { Prisma } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";

// Taksit kalan/ödenen tutarları DB'den Prisma.Decimal olarak gelir. Bunları
// JS number'a çevirip float aritmetiğiyle işlemek (önceki hâl: `Number(...)`
// + epsilon tolerans 0.001/0.009) CLAUDE.md'nin "Decimal/string-safe
// aritmetik kullan" kuralını ihlal ediyordu ve çok sayıda küçük kısmi ödeme
// sonrası kümülatif yuvarlama riski taşıyordu (bkz. denetim raporu). Tüm
// tutar hesapları burada Decimal ile yapılır.
const ZERO = new Prisma.Decimal(0);

export interface TaksitApplyResult {
  /** Taksitlere uygulanan toplam tutar */
  applied: number;
  /** Güncellenen taksit adedi */
  updatedCount: number;
  /** Hangi planlar TAMAMLANDI durumuna geçti */
  completedPlanIds: string[];
}

/**
 * Bir hasta için GECIKTI + BEKLIYOR taksitlerini,
 * vade tarihine göre sıralar ve ödeme tutarını sırayla uygular.
 *
 * @param tx   - Prisma transaction nesnesi
 * @param patientId - Hastanın ID'si
 * @param amount    - Ödeme tutarı
 * @param method    - Ödeme yöntemi (PaymentMethod enum string)
 * @param posId     - POS cihaz ID'si (opsiyonel)
 * @param tarih     - Ödeme tarihi (default: şimdi)
 * @param paymentId - Bağlanacak Payment kaydının ID'si
 * @param doctorId  - Ödemenin ait olduğu doktor. Verilirse, otomatik
 *   eşleştirme yalnızca BU doktorun taksit planlarını kapatır — aksi halde
 *   hastanın başka bir doktora ait eski/gecikmiş taksiti, o an ödeme alınan
 *   doktorla hiç ilgisi olmadan sessizce kapatılıp iki doktorun hakedişini
 *   de bozardı (bkz. denetim raporu).
 */
export async function applyTaksitIntegration(
  tx: Prisma.TransactionClient,
  patientId: string,
  amount: number,
  method: PaymentMethod,
  posId?: string | null,
  tarih?: Date,
  paymentId?: string | null,
  doctorId?: string | null,
): Promise<TaksitApplyResult> {
  const result: TaksitApplyResult = { applied: 0, updatedCount: 0, completedPlanIds: [] };
  if (!patientId || amount <= 0) return result;

  // En eski vadeli, gecikmiş / bekleyen taksitler — yalnızca ödemenin ait
  // olduğu doktorun planları (doctorId verilmemişse eski davranış korunur).
  const pendingTaksitler = await tx.taksit.findMany({
    where: {
      plan: { patientId, ...(doctorId ? { doctorId } : {}) },
      status: { in: ["GECIKTI", "BEKLIYOR"] },
    },
    orderBy: [{ vadeDate: "asc" }, { siraNo: "asc" }],
    select: {
      id: true, planId: true, siraNo: true,
      tutar: true, odenen: true, kalan: true, status: true,
    },
  });

  if (pendingTaksitler.length === 0) return result;

  let remaining = new Prisma.Decimal(amount);
  let applied = ZERO;
  const odeDate = tarih ?? new Date();

  for (const taksit of pendingTaksitler) {
    if (remaining.lessThanOrEqualTo(ZERO)) break;

    const kalan = taksit.kalan as unknown as Prisma.Decimal;
    const pay = Prisma.Decimal.min(remaining, kalan);
    const yeniOdenen = (taksit.odenen as unknown as Prisma.Decimal).plus(pay);
    const yeniKalan = Prisma.Decimal.max(ZERO, kalan.minus(pay));
    const fullyPaid = yeniKalan.isZero();

    await tx.taksit.update({
      where: { id: taksit.id },
      data: {
        odenen: yeniOdenen,
        kalan:  yeniKalan,
        status: fullyPaid ? "ODENDI" : taksit.status,
      },
    });

    await tx.taksitOdeme.create({
      data: {
        taksitId: taksit.id,
        paymentId: paymentId ?? null,
        tarih: odeDate,
        tutar: pay,
        yontem: method,
        posId: posId ?? null,
      },
    });

    // Plan tamamlandı mı kontrol et
    if (fullyPaid) {
      const planTaksitler: { status: string }[] = await tx.taksit.findMany({
        where: { planId: taksit.planId },
        select: { status: true },
      });
      const allDone = planTaksitler.every(
        (t) => t.status === "ODENDI" || t.status === "IPTAL",
      );
      if (allDone) {
        await tx.taksitPlan.update({
          where: { id: taksit.planId },
          data: { status: "TAMAMLANDI" },
        });
        result.completedPlanIds.push(taksit.planId);
      }
    }

    remaining = remaining.minus(pay);
    applied = applied.plus(pay);
    result.updatedCount++;
  }

  result.applied = applied.toNumber();
  return result;
}

async function refreshTaksitAndPlanStatus(tx: Prisma.TransactionClient, taksitId: string) {
  const taksit = await tx.taksit.findUnique({
    where: { id: taksitId },
    select: { id: true, planId: true, tutar: true, odenen: true, kalan: true, status: true },
  });
  if (!taksit) return;

  const kalan = taksit.kalan as unknown as Prisma.Decimal;
  const nextStatus = kalan.lessThanOrEqualTo(ZERO) ? "ODENDI" : "BEKLIYOR";
  await tx.taksit.update({
    where: { id: taksit.id },
    data: { status: nextStatus },
  });

  const planTaksitler: { status: string }[] = await tx.taksit.findMany({
    where: { planId: taksit.planId },
    select: { status: true },
  });
  const allDone = planTaksitler.every((t) => t.status === "ODENDI" || t.status === "IPTAL");
  const anyPaidOrWaiting = planTaksitler.some((t) => t.status === "ODENDI" || t.status === "BEKLIYOR" || t.status === "GECIKTI");
  await tx.taksitPlan.update({
    where: { id: taksit.planId },
    data: { status: allDone ? "TAMAMLANDI" : anyPaidOrWaiting ? "DEVAM_EDIYOR" : "AKTIF" },
  });
}

export async function reverseTaksitIntegrationForPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
): Promise<{ reversed: number; updatedCount: number }> {
  const odemeler = await tx.taksitOdeme.findMany({
    where: { paymentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, taksitId: true, tutar: true, taksit: { select: { odenen: true, kalan: true } } },
  });

  let reversed = ZERO;
  const touched = new Set<string>();

  for (const odeme of odemeler) {
    const amount = odeme.tutar as unknown as Prisma.Decimal;
    const nextOdenen = Prisma.Decimal.max(ZERO, (odeme.taksit.odenen as unknown as Prisma.Decimal).minus(amount));
    const nextKalan = (odeme.taksit.kalan as unknown as Prisma.Decimal).plus(amount);
    await tx.taksit.update({
      where: { id: odeme.taksitId },
      data: {
        odenen: nextOdenen,
        kalan: nextKalan,
        status: "BEKLIYOR",
      },
    });
    await tx.taksitOdeme.delete({ where: { id: odeme.id } });
    reversed = reversed.plus(amount);
    touched.add(odeme.taksitId);
  }

  for (const taksitId of touched) {
    await refreshTaksitAndPlanStatus(tx, taksitId);
  }

  return { reversed: reversed.toNumber(), updatedCount: touched.size };
}

/**
 * Belirli bir taksit kalemini tam veya kısmi olarak öder.
 * Plan tamamlandıysa plan durumunu da günceller.
 */
export async function payTaksit(
  tx: Prisma.TransactionClient,
  taksitId: string,
  amount: number,
  method: PaymentMethod,
  posId?: string | null,
  tarih?: Date,
): Promise<{ updated: boolean; planCompleted: boolean }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { updated: false, planCompleted: false };
  }
  const taksit = await tx.taksit.findUnique({
    where: { id: taksitId },
    select: { id: true, planId: true, kalan: true, odenen: true, status: true },
  });
  if (!taksit || taksit.status === "ODENDI" || taksit.status === "IPTAL") {
    return { updated: false, planCompleted: false };
  }

  const kalan = taksit.kalan as unknown as Prisma.Decimal;
  const pay = Prisma.Decimal.min(new Prisma.Decimal(amount), kalan);
  const yeniOdenen = (taksit.odenen as unknown as Prisma.Decimal).plus(pay);
  const yeniKalan  = Prisma.Decimal.max(ZERO, kalan.minus(pay));
  const fullyPaid  = yeniKalan.isZero();

  await tx.taksit.update({
    where: { id: taksitId },
    data: { odenen: yeniOdenen, kalan: yeniKalan, status: fullyPaid ? "ODENDI" : taksit.status },
  });

  await tx.taksitOdeme.create({
    data: {
      taksitId,
      paymentId: null,
      tarih: tarih ?? new Date(),
      tutar: pay,
      yontem: method,
      posId: posId ?? null,
    },
  });

  let planCompleted = false;
  if (fullyPaid) {
    const planTaksitler: { status: string }[] = await tx.taksit.findMany({
      where: { planId: taksit.planId },
      select: { status: true },
    });
    const allDone = planTaksitler.every(
      (t) => t.status === "ODENDI" || t.status === "IPTAL",
    );
    if (allDone) {
      await tx.taksitPlan.update({
        where: { id: taksit.planId },
        data: { status: "TAMAMLANDI" },
      });
      planCompleted = true;
    }
  }

  return { updated: true, planCompleted };
}
