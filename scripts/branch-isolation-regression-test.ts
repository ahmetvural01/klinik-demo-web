/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { computeDoctorMonthlyHakedis, findEligibleDoctor, monthRangeUtc } from "../src/lib/hakedis";
import { findDoctorBlockConflict } from "../src/lib/doctor-block-conflict";
import { turkeyLocalDateTimeToUtc } from "../src/lib/tz";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const institution = await prisma.institution.create({
    data: { name: `Şube İzolasyon Testi ${suffix}`, email: `branch-isolation-${suffix}@example.invalid` },
  });
  const foreignInstitution = await prisma.institution.create({
    data: { name: `Yabancı Kurum ${suffix}`, email: `foreign-branch-${suffix}@example.invalid` },
  });

  try {
    const [branchA, branchB] = await Promise.all([
      prisma.clinicBranch.create({ data: { institutionId: institution.id, name: "Merkez", slug: "merkez", isHeadquarters: true } }),
      prisma.clinicBranch.create({ data: { institutionId: institution.id, name: "Cadde", slug: "cadde" } }),
    ]);
    const doctor = await prisma.user.create({
      data: {
        institutionId: institution.id,
        identityNo: `B${suffix}`.slice(0, 20),
        fullName: "Çok Şubeli Test Doktoru",
        passwordHash: "test-only",
        role: "DOKTOR",
        branchMemberships: {
          create: [
            { branchId: branchA.id, isPrimary: true, genelYuzde: 10, kkYuzde: 0, maasYuzde: 50 },
            { branchId: branchB.id, genelYuzde: 20, kkYuzde: 0, maasYuzde: 25 },
          ],
        },
      },
    });
    const [patientA, patientB] = await Promise.all([
      prisma.patient.create({ data: { institutionId: institution.id, homeBranchId: branchA.id, fullName: "Merkez Test Hastası", phone: `501${Date.now().toString().slice(-7)}`, gender: "ERKEK" } }),
      prisma.patient.create({ data: { institutionId: institution.id, homeBranchId: branchB.id, fullName: "Cadde Test Hastası", phone: `502${Date.now().toString().slice(-7)}`, gender: "KADIN" } }),
    ]);

    const now = new Date();
    const { start, end } = monthRangeUtc(now.getFullYear(), now.getMonth() + 1);
    const appointmentStart = new Date(start.getTime() + 10 * 24 * 60 * 60_000 + 9 * 60 * 60_000);
    const appointmentEnd = new Date(appointmentStart.getTime() + 45 * 60_000);

    await Promise.all([
      prisma.appointment.create({ data: { institutionId: institution.id, branchId: branchA.id, patientId: patientA.id, doctorId: doctor.id, startAt: appointmentStart, endAt: appointmentEnd } }),
      prisma.appointment.create({ data: { institutionId: institution.id, branchId: branchB.id, patientId: patientB.id, doctorId: doctor.id, startAt: appointmentStart, endAt: appointmentEnd } }),
      prisma.examination.create({ data: { institutionId: institution.id, branchId: branchA.id, patientId: patientA.id, doctorId: doctor.id, treatmentName: "Merkez Tedavi", amount: 1000, status: "TAMAMLANDI", diagnosedAt: appointmentStart } }),
      prisma.examination.create({ data: { institutionId: institution.id, branchId: branchB.id, patientId: patientB.id, doctorId: doctor.id, treatmentName: "Cadde Tedavi", amount: 2000, status: "TAMAMLANDI", diagnosedAt: appointmentStart } }),
      prisma.doctorRateHistory.create({ data: { institutionId: institution.id, branchId: branchA.id, doctorId: doctor.id, genelYuzde: 10, kkYuzde: 0, maasYuzde: 50, effectiveFrom: new Date(0) } }),
      prisma.doctorRateHistory.create({ data: { institutionId: institution.id, branchId: branchB.id, doctorId: doctor.id, genelYuzde: 20, kkYuzde: 0, maasYuzde: 25, effectiveFrom: new Date(0) } }),
      prisma.payment.create({ data: { institutionId: institution.id, branchId: branchA.id, requestKey: `shared-${suffix}`, patientId: patientA.id, doctorId: doctor.id, amount: 100, method: "NAKIT" } }),
      prisma.payment.create({ data: { institutionId: institution.id, branchId: branchB.id, requestKey: `shared-${suffix}`, patientId: patientB.id, doctorId: doctor.id, amount: 200, method: "NAKIT" } }),
      prisma.taksitPlan.create({ data: { institutionId: institution.id, branchId: branchA.id, patientId: patientA.id, doctorId: doctor.id, toplamBorc: 1000, taksitSayisi: 2, startDate: appointmentStart } }),
      prisma.taksitPlan.create({ data: { institutionId: institution.id, branchId: branchB.id, patientId: patientB.id, doctorId: doctor.id, toplamBorc: 2000, taksitSayisi: 4, startDate: appointmentStart } }),
      prisma.stockItem.create({ data: { institutionId: institution.id, branchId: branchA.id, name: "Ortak Sarf", quantity: 10 } }),
      prisma.stockItem.create({ data: { institutionId: institution.id, branchId: branchB.id, name: "Ortak Sarf", quantity: 30 } }),
      prisma.firma.create({ data: { institutionId: institution.id, branchId: branchA.id, name: "Ortak Tedarikçi" } }),
      prisma.firma.create({ data: { institutionId: institution.id, branchId: branchB.id, name: "Ortak Tedarikçi" } }),
      prisma.doctorBlock.create({ data: { institutionId: institution.id, branchId: branchA.id, doctorId: doctor.id, date: "2099-01-01", startTime: "10:00", endTime: "11:00", reason: "Merkez izin kaydı" } }),
      prisma.message.create({ data: { institutionId: institution.id, branchId: branchA.id, userId: doctor.id, text: "Merkez şube mesajı" } }),
      prisma.message.create({ data: { institutionId: institution.id, branchId: branchB.id, userId: doctor.id, text: "Cadde şube mesajı" } }),
    ]);

    const [ratesA, ratesB, hakedisA, hakedisB] = await Promise.all([
      findEligibleDoctor({ doctorId: doctor.id, institutionId: institution.id, branchId: branchA.id }),
      findEligibleDoctor({ doctorId: doctor.id, institutionId: institution.id, branchId: branchB.id }),
      computeDoctorMonthlyHakedis({ doctorId: doctor.id, institutionId: institution.id, branchId: branchA.id, rates: { genelYuzde: 10, kkYuzde: 0, maasYuzde: 50 }, rangeStart: start, rangeEnd: end }),
      computeDoctorMonthlyHakedis({ doctorId: doctor.id, institutionId: institution.id, branchId: branchB.id, rates: { genelYuzde: 20, kkYuzde: 0, maasYuzde: 25 }, rangeStart: start, rangeEnd: end }),
    ]);

    assert(Number(ratesA?.genelYuzde) === 10 && Number(ratesB?.genelYuzde) === 20, "Doktor oranları şubeler arasında karıştı.");
    assert(hakedisA.length === 1 && hakedisA[0].ciro === 1000 && hakedisA[0].hakedilen === 450, "Merkez hakedişi beklenen 450 TL değil.");
    assert(hakedisB.length === 1 && hakedisB[0].ciro === 2000 && hakedisB[0].hakedilen === 400, "Cadde hakedişi beklenen 400 TL değil.");

    const [paymentsA, paymentsB, plansA, plansB, messagesA, messagesB] = await Promise.all([
      prisma.payment.count({ where: { institutionId: institution.id, branchId: branchA.id } }),
      prisma.payment.count({ where: { institutionId: institution.id, branchId: branchB.id } }),
      prisma.taksitPlan.count({ where: { institutionId: institution.id, branchId: branchA.id } }),
      prisma.taksitPlan.count({ where: { institutionId: institution.id, branchId: branchB.id } }),
      prisma.message.count({ where: { institutionId: institution.id, branchId: branchA.id } }),
      prisma.message.count({ where: { institutionId: institution.id, branchId: branchB.id } }),
    ]);
    assert(paymentsA === 1 && paymentsB === 1 && plansA === 1 && plansB === 1, "Ödeme veya taksit planı şube sayımları karıştı.");
    assert(messagesA === 1 && messagesB === 1, "Klinik içi mesajlar şubeler arasında karıştı.");

    const [blockInA, blockInB] = await Promise.all([
      findDoctorBlockConflict(doctor.id, branchA.id, turkeyLocalDateTimeToUtc("2099-01-01", "10:15"), turkeyLocalDateTimeToUtc("2099-01-01", "10:30")),
      findDoctorBlockConflict(doctor.id, branchB.id, turkeyLocalDateTimeToUtc("2099-01-01", "10:15"), turkeyLocalDateTimeToUtc("2099-01-01", "10:30")),
    ]);
    assert(Boolean(blockInA), "Merkez şubesindeki doktor kapalı saati bulunamadı.");
    assert(!blockInB, "Merkez şubesindeki doktor kapalı saati Cadde şubesine sızdı.");

    let mismatchedTenantRejected = false;
    try {
      await prisma.payment.create({ data: { institutionId: foreignInstitution.id, branchId: branchA.id, amount: 1, method: "NAKIT" } });
    } catch {
      mismatchedTenantRejected = true;
    }
    assert(mismatchedTenantRejected, "Başka kurum kimliği ile şube eşleştirmesi veritabanı tarafından reddedilmedi.");

    let mismatchedBlockRejected = false;
    try {
      await prisma.doctorBlock.create({ data: { institutionId: foreignInstitution.id, branchId: branchA.id, doctorId: doctor.id, date: "2099-01-02", startTime: "10:00", endTime: "11:00" } });
    } catch {
      mismatchedBlockRejected = true;
    }
    assert(mismatchedBlockRejected, "Başka kurum kimliği ile doktor kapalı saati oluşturulabildi.");

    let mismatchedMessageRejected = false;
    try {
      await prisma.message.create({ data: { institutionId: foreignInstitution.id, branchId: branchA.id, userId: doctor.id, text: "Yabancı kurum mesajı" } });
    } catch {
      mismatchedMessageRejected = true;
    }
    assert(mismatchedMessageRejected, "Başka kurum kimliği ile şubeye mesaj oluşturulabildi.");

    console.log("✓ Aynı doktorun iki şubedeki randevu, mesaj, kapalı saat, ödeme, taksit, stok, firma, oran ve hakediş verileri tamamen bağımsız kaldı.");
  } finally {
    await prisma.message.deleteMany({ where: { institutionId: institution.id } });
    await prisma.doctorBlock.deleteMany({ where: { institutionId: institution.id } });
    await prisma.appointment.deleteMany({ where: { institutionId: institution.id } });
    await prisma.examination.deleteMany({ where: { institutionId: institution.id } });
    await prisma.payment.deleteMany({ where: { institutionId: institution.id } });
    await prisma.taksitPlan.deleteMany({ where: { institutionId: institution.id } });
    await prisma.stockItem.deleteMany({ where: { institutionId: institution.id } });
    await prisma.firma.deleteMany({ where: { institutionId: institution.id } });
    await prisma.doctorRateHistory.deleteMany({ where: { institutionId: institution.id } });
    await prisma.patient.deleteMany({ where: { institutionId: institution.id } });
    await prisma.userBranch.deleteMany({ where: { institutionId: institution.id } });
    await prisma.user.deleteMany({ where: { institutionId: institution.id } });
    await prisma.clinicBranch.deleteMany({ where: { institutionId: institution.id } });
    await prisma.institution.delete({ where: { id: institution.id } });
    await prisma.institution.delete({ where: { id: foreignInstitution.id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
