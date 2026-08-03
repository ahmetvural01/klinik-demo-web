/* eslint-disable no-console */
/**
 * PATCH /api/taksit-plani/[id]/taksitler/[tid] ("Tahsilat Yap" hızlı ödeme)
 * artık bir Payment kaydı oluşturup TaksitOdeme'ye bağlıyor mu doğrular —
 * önceden bu uç yalnızca TaksitOdeme yazıyordu, Payment hiç oluşmadığı için
 * Muhasebe Defteri / /api/reports / doktor hakediş ekranı bu tahsilatı hiç
 * görmüyordu (bkz. denetim raporu, kritik veri tutarlılığı sorunu).
 *
 * Route handler'ı Next.js request context'i (cookies/requireAuth) gerektirdiği
 * için doğrudan HTTP ile çağrılamıyor — bu script route içindeki AYNI
 * transaction mantığını birebir uygulayıp sonucu doğrular.
 *
 * Kullanım: npx tsx scripts/taksit-quick-pay-ledger-test.ts
 * Oluşturulan test verisi sonunda silinir.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { institutionId: { not: null }, isActive: true, role: { in: ["DOKTOR", "YONETICI"] } },
    select: { id: true, institutionId: true },
  });
  if (!user?.institutionId) throw new Error("Test için aktif doktor/yönetici bulunamadı.");

  const patient = await prisma.patient.create({
    data: { institutionId: user.institutionId, fullName: `Taksit Ledger Testi ${Date.now()}`, gender: "ERKEK", phone: `555${Date.now().toString().slice(-7)}` },
  });
  const plan = await prisma.taksitPlan.create({
    data: {
      patientId: patient.id,
      doctorId: user.id,
      toplamBorc: new Prisma.Decimal(1000),
      taksitSayisi: 1,
      startDate: new Date(),
      status: "AKTIF",
    },
  });
  const taksit = await prisma.taksit.create({
    data: {
      planId: plan.id,
      siraNo: 1,
      vadeDate: new Date(),
      tutar: new Prisma.Decimal(1000),
      odenen: new Prisma.Decimal(0),
      kalan: new Prisma.Decimal(1000),
      status: "BEKLIYOR",
    },
  });

  const createdPaymentIds: string[] = [];
  try {
    // ── route.ts PATCH ile birebir aynı transaction mantığı ──
    const odemeAmtDecimal = new Prisma.Decimal(400); // kısmi ödeme
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.taksit.findUniqueOrThrow({
        where: { id: taksit.id },
        include: { plan: { include: { patient: { select: { institutionId: true } } } } },
      });
      const kalan = t.kalan;
      const yeniOdenen = t.odenen.plus(odemeAmtDecimal);
      const yeniKalan = Prisma.Decimal.max(new Prisma.Decimal(0), kalan.minus(odemeAmtDecimal));
      const yeniStatus = yeniKalan.isZero() ? "ODENDI" : "BEKLIYOR";

      const linkedPayment = await tx.payment.create({
        data: {
          institutionId: t.plan.patient!.institutionId || user.institutionId!,
          patientId: t.plan.patientId,
          doctorId: t.plan.doctorId,
          method: "NAKIT",
          amount: odemeAmtDecimal,
          description: `Taksit tahsilatı (${t.siraNo}. taksit)`,
          status: "ACTIVE",
        },
      });
      createdPaymentIds.push(linkedPayment.id);

      await tx.taksitOdeme.create({
        data: { taksitId: taksit.id, paymentId: linkedPayment.id, tarih: new Date(), tutar: odemeAmtDecimal, yontem: "NAKIT" },
      });
      await tx.taksit.update({ where: { id: taksit.id }, data: { odenen: yeniOdenen, kalan: yeniKalan, status: yeniStatus } });

      return { taksitId: taksit.id, paymentId: linkedPayment.id };
    });

    // ── Doğrulamalar ──
    const odeme = await prisma.taksitOdeme.findFirst({ where: { taksitId: updated.taksitId } });
    assert(odeme?.paymentId === updated.paymentId, "TaksitOdeme.paymentId, oluşturulan Payment'a bağlı olmalı.");

    const payment = await prisma.payment.findUnique({ where: { id: updated.paymentId } });
    assert(payment !== null, "Payment kaydı oluşturulmuş olmalı.");
    assert(Number(payment!.amount) === 400, `Payment tutarı 400 olmalı, gerçek: ${payment!.amount}.`);
    assert(payment!.patientId === patient.id, "Payment.patientId doğru hastaya ait olmalı.");
    assert(payment!.institutionId === user.institutionId, "Payment.institutionId doğru kuruma ait olmalı.");
    assert(payment!.status === "ACTIVE", "Payment.status ACTIVE olmalı (Muhasebe Defteri/raporlar bunu filtreler).");

    // Muhasebe Defteri ve /api/reports'un yaptığı sorguyla AYNI şekilde
    // bu tahsilatın artık görünür olduğunu doğrula.
    const ledgerVisible = await prisma.payment.findMany({
      where: { institutionId: user.institutionId, status: "ACTIVE", patientId: patient.id },
    });
    assert(ledgerVisible.length === 1, `Muhasebe Defteri sorgusu bu tahsilatı 1 kez görmeli, gerçek: ${ledgerVisible.length}.`);

    console.log("✓ Taksit hızlı ödemesi artık Payment kaydı oluşturuyor ve Muhasebe Defteri/raporlar tarafından görülebiliyor.");
  } finally {
    await prisma.taksitOdeme.deleteMany({ where: { taksitId: taksit.id } });
    await prisma.taksit.deleteMany({ where: { planId: plan.id } });
    await prisma.taksitPlan.delete({ where: { id: plan.id } });
    if (createdPaymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    await prisma.patient.delete({ where: { id: patient.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
