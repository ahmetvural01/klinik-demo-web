/**
 * taksit-integration.ts
 * ─────────────────────
 * Hasta ödemesi alındığında, gecikmiş / bekleyen taksit taksitlerini
 * otomatik olarak en eski vade tarihinden itibaren kapatır.
 * Prisma transaction içinde kullanılmak üzere tasarlanmıştır.
 */

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
 */
export async function applyTaksitIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  patientId: string,
  amount: number,
  method: string,
  posId?: string | null,
  tarih?: Date,
): Promise<TaksitApplyResult> {
  const result: TaksitApplyResult = { applied: 0, updatedCount: 0, completedPlanIds: [] };
  if (!patientId || amount <= 0) return result;

  // En eski vadeli, gecikmiş / bekleyen taksitler
  const pendingTaksitler = await tx.taksit.findMany({
    where: {
      plan: { patientId },
      status: { in: ["GECIKTI", "BEKLIYOR"] },
    },
    orderBy: [{ vadeDate: "asc" }, { siraNo: "asc" }],
    select: {
      id: true, planId: true, siraNo: true,
      tutar: true, odenen: true, kalan: true, status: true,
    },
  });

  if (pendingTaksitler.length === 0) return result;

  let remaining = amount;
  const odeDate = tarih ?? new Date();

  for (const taksit of pendingTaksitler) {
    if (remaining <= 0.009) break;

    const kalan  = Number(taksit.kalan);
    const pay    = Math.min(remaining, kalan);
    const yeniOdenen = Number(taksit.odenen) + pay;
    const yeniKalan  = Math.max(0, kalan - pay);
    const fullyPaid  = yeniKalan <= 0.009;

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

    remaining       -= pay;
    result.applied  += pay;
    result.updatedCount++;
  }

  return result;
}

/**
 * Belirli bir taksit kalemini tam veya kısmi olarak öder.
 * Plan tamamlandıysa plan durumunu da günceller.
 */
export async function payTaksit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  taksitId: string,
  amount: number,
  method: string,
  posId?: string | null,
  tarih?: Date,
): Promise<{ updated: boolean; planCompleted: boolean }> {
  const taksit = await tx.taksit.findUnique({
    where: { id: taksitId },
    select: { id: true, planId: true, kalan: true, odenen: true, status: true },
  });
  if (!taksit || taksit.status === "ODENDI" || taksit.status === "IPTAL") {
    return { updated: false, planCompleted: false };
  }

  const kalan = Number(taksit.kalan);
  const pay = Math.min(amount, kalan);
  const yeniOdenen = Number(taksit.odenen) + pay;
  const yeniKalan  = Math.max(0, kalan - pay);
  const fullyPaid  = yeniKalan <= 0.009;

  await tx.taksit.update({
    where: { id: taksitId },
    data: { odenen: yeniOdenen, kalan: yeniKalan, status: fullyPaid ? "ODENDI" : taksit.status },
  });

  await tx.taksitOdeme.create({
    data: {
      taksitId,
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
