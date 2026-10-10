/**
 * taksit-integration.ts
 * ─────────────────────
 * Hasta ödemesi alındığında, gecikmiş / bekleyen taksit taksitlerini
 * otomatik olarak en eski vade tarihinden itibaren kapatır.
 * Prisma transaction içinde kullanılmak üzere tasarlanmıştır.
 */

import { Prisma } from "@prisma/client";
import type { PaymentMethod, TaksitStatus } from "@prisma/client";

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
  branchId?: string | null,
): Promise<TaksitApplyResult> {
  const result: TaksitApplyResult = { applied: 0, updatedCount: 0, completedPlanIds: [] };
  if (!patientId || amount <= 0) return result;

  // En eski vadeli, gecikmiş / bekleyen taksitler — yalnızca ödemenin ait
  // olduğu doktorun planları (doctorId verilmemişse eski davranış korunur).
  // İptal edilmiş ya da tamamlanmış planın taksitine tahsilat işlenmez.
  const pendingTaksitler = await tx.taksit.findMany({
    where: {
      plan: {
        patientId,
        status: { in: ["AKTIF", "DEVAM_EDIYOR"] },
        ...(doctorId ? { doctorId } : {}),
        ...(branchId ? { branchId } : {}),
      },
      status: { in: ["GECIKTI", "BEKLIYOR"] },
    },
    orderBy: [{ vadeDate: "asc" }, { siraNo: "asc" }],
    select: {
      id: true, institutionId: true, branchId: true, planId: true, siraNo: true,
      tutar: true, odenen: true, kalan: true, status: true,
    },
  });

  if (pendingTaksitler.length === 0) return result;

  let remaining = new Prisma.Decimal(amount);
  let applied = ZERO;
  const odeDate = tarih ?? new Date();
  const touchedPlanIds = new Set<string>();

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
        institutionId: taksit.institutionId,
        branchId: taksit.branchId,
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
    touchedPlanIds.add(taksit.planId);
  }

  // Ödeme alan ama bitmeyen plan "Devam ediyor" olur (taksit tahsilatı ucu ve
  // refreshTaksitAndPlanStatus ile aynı kural). Tahsilat düzeltmesi önce
  // bağları geri alıp planı "Aktif"e döndürdüğü için burada da yazılmalı.
  const ongoing = [...touchedPlanIds].filter((planId) => !result.completedPlanIds.includes(planId));
  if (ongoing.length > 0) {
    await tx.taksitPlan.updateMany({
      where: { id: { in: ongoing }, status: "AKTIF" },
      data: { status: "DEVAM_EDIYOR" },
    });
  }

  result.applied = applied.toNumber();
  return result;
}

/**
 * Tahsilat geri alındıktan (iptal/düzeltme) sonra taksidin ve planın durumu.
 * İptal edilmiş plan ya da iptal edilmiş taksit geri AÇILMAZ: önceden iptal
 * edilmiş plana bağlı bir tahsilat iptal edilince plan yeniden "Süren", taksit
 * "Bekliyor" oluyor; plan "Tahsil et" ile listeye dönüyor ve gecikme /
 * hatırlatma sırasına girebiliyordu. Bu durumda ödenen ve kalan tutarlar
 * düzeltilir (çağıran zaten yazdı), plan "İptal" kalır; ödenmemiş hale gelen
 * taksit "Ödendi" yerine "İptal" olur (plan iptalinin kuralı), asla "Bekliyor" olmaz.
 */
async function refreshTaksitAndPlanStatus(tx: Prisma.TransactionClient, taksitId: string) {
  const taksit = await tx.taksit.findUnique({
    where: { id: taksitId },
    select: { id: true, planId: true, kalan: true, status: true, plan: { select: { status: true } } },
  });
  if (!taksit) return;

  const planCancelled = taksit.plan.status === "IPTAL";
  const paidOff = (taksit.kalan as unknown as Prisma.Decimal).lessThanOrEqualTo(ZERO);
  // İptal edilmiş planda ödenmemiş kalan taksit iptal sayılır (plan iptalinin
  // kuralıyla aynı: ödenmemiş taksitler iptal edilir, ödenmişler kalır).
  let nextStatus: TaksitStatus;
  if (planCancelled) nextStatus = paidOff ? "ODENDI" : "IPTAL";
  else if (taksit.status === "IPTAL") nextStatus = "IPTAL";
  else nextStatus = paidOff ? "ODENDI" : "BEKLIYOR";
  if (nextStatus !== taksit.status) {
    await tx.taksit.update({
      where: { id: taksit.id },
      data: { status: nextStatus },
    });
  }
  if (planCancelled) return;

  const planTaksitler: { status: string; odenen: Prisma.Decimal }[] = await tx.taksit.findMany({
    where: { planId: taksit.planId },
    select: { status: true, odenen: true },
  });
  // İptal edilmiş taksitler planın süren/tamamlanan hesabına girmez.
  const active = planTaksitler.filter((t) => t.status !== "IPTAL");
  const allDone = active.every((t) => t.status === "ODENDI");
  const anyPaid = active.some((t) => t.status === "ODENDI" || new Prisma.Decimal(t.odenen).gt(ZERO));
  await tx.taksitPlan.update({
    where: { id: taksit.planId },
    data: { status: allDone ? "TAMAMLANDI" : anyPaid ? "DEVAM_EDIYOR" : "AKTIF" },
  });
}

/**
 * `keepCancelledPlans`: iptal edilmiş plana bağlı ödeme kayıtlarına dokunulmaz
 * (tahsilat düzeltmesi; önce refitCancelledPlanLinks çağrılır). Verilmezse
 * (tahsilat iptali) bütün bağlar geri alınır.
 */
export async function reverseTaksitIntegrationForPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  options: { keepCancelledPlans?: boolean } = {},
): Promise<{ reversed: number; updatedCount: number }> {
  const odemeler = await tx.taksitOdeme.findMany({
    where: {
      paymentId,
      status: "ACTIVE",
      ...(options.keepCancelledPlans ? { taksit: { plan: { status: { not: "IPTAL" } } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, taksitId: true, tutar: true, taksit: { select: { odenen: true, kalan: true } } },
  });

  let reversed = ZERO;
  const touched = new Set<string>();

  for (const odeme of odemeler) {
    const amount = odeme.tutar as unknown as Prisma.Decimal;
    const nextOdenen = Prisma.Decimal.max(ZERO, (odeme.taksit.odenen as unknown as Prisma.Decimal).minus(amount));
    const nextKalan = (odeme.taksit.kalan as unknown as Prisma.Decimal).plus(amount);
    // Yalnız tutarlar burada; durum aşağıda refreshTaksitAndPlanStatus'ta
    // hesaplanır (iptal edilmiş plan/taksit geri açılmaz).
    await tx.taksit.update({
      where: { id: odeme.taksitId },
      data: {
        odenen: nextOdenen,
        kalan: nextKalan,
      },
    });
    await tx.taksitOdeme.update({
      where: { id: odeme.id },
      data: { status: "VOID", voidedAt: new Date() },
    });
    reversed = reversed.plus(amount);
    touched.add(odeme.taksitId);
  }

  for (const taksitId of touched) {
    await refreshTaksitAndPlanStatus(tx, taksitId);
  }

  return { reversed: reversed.toNumber(), updatedCount: touched.size };
}

/**
 * Tahsilat düzeltilirken (tutar, yöntem, POS, tarih; doktor aynı kalırken)
 * iptal edilmiş plana bağlı ödeme kayıtları yerinde kalır. Önceden düzeltme
 * bu bağları da geri alıp tutarı açık planlara yeniden dağıtıyordu: plan
 * iptal edilip borç yeni planla yeniden taksitlendiyse ("önce o planı iptal
 * edin" akışı) eski tahsilat yeni planın taksidini ödenmiş sayıyor, iptal
 * edilen planın ödeme geçmişi siliniyordu.
 * Bağlar en eskiden başlayarak yeni tutara sığdırılır (tutar düştüyse sondaki
 * bağ küçülür ya da kapanır); yöntem, POS ve tarih tahsilatla aynı olur.
 * Döner: iptal edilmiş planlarda kalan tutar ve açık planlara yeniden
 * dağıtılacak kalan (Decimal ile hesaplanır, kuruşa yuvarlıdır).
 */
export async function refitCancelledPlanLinks(
  tx: Prisma.TransactionClient,
  paymentId: string,
  next: { amount: number; method: PaymentMethod; posId: string | null; tarih: Date },
): Promise<{ kept: number; rest: number }> {
  const links = await tx.taksitOdeme.findMany({
    where: { paymentId, status: "ACTIVE", taksit: { plan: { status: "IPTAL" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, taksitId: true, tutar: true, taksit: { select: { odenen: true, kalan: true } } },
  });
  const total = new Prisma.Decimal(next.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  let budget = total;
  for (const link of links) {
    const current = link.tutar as unknown as Prisma.Decimal;
    const keep = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(current, budget));
    const released = current.minus(keep);
    if (released.gt(ZERO)) {
      await tx.taksit.update({
        where: { id: link.taksitId },
        data: {
          odenen: Prisma.Decimal.max(ZERO, (link.taksit.odenen as unknown as Prisma.Decimal).minus(released)),
          kalan: (link.taksit.kalan as unknown as Prisma.Decimal).plus(released),
        },
      });
    }
    await tx.taksitOdeme.update({
      where: { id: link.id },
      data: keep.isZero()
        ? { status: "VOID", voidedAt: new Date() }
        : { tutar: keep, yontem: next.method, posId: next.posId, tarih: next.tarih },
    });
    // Plan iptal: ödenmemiş hale gelen taksit "İptal" kalır (refreshTaksitAndPlanStatus).
    if (released.gt(ZERO)) await refreshTaksitAndPlanStatus(tx, link.taksitId);
    budget = budget.minus(keep);
  }
  return { kept: total.minus(budget).toNumber(), rest: budget.toNumber() };
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
    select: { id: true, institutionId: true, branchId: true, planId: true, kalan: true, odenen: true, status: true },
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
      institutionId: taksit.institutionId,
      branchId: taksit.branchId,
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
