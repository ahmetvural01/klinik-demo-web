import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_MARKER = "[DEMO_HASTA_TAKIP_20260506]";

async function main() {
  const patients = await prisma.patient.findMany({
    where: { referrer: DEMO_MARKER },
    select: { id: true, fullName: true },
  });

  if (patients.length === 0) {
    console.log(`Silinecek demo verisi bulunamadi. Marker: ${DEMO_MARKER}`);
    return;
  }

  const patientIds = patients.map((patient) => patient.id);
  const followUps = await prisma.patientFollowUp.findMany({
    where: { patientId: { in: patientIds } },
    select: { id: true },
  });
  const followUpIds = followUps.map((followUp) => followUp.id);

  await prisma.$transaction(async (tx) => {
    if (followUpIds.length > 0) {
      await tx.patientFollowUpEvent.deleteMany({
        where: { followUpId: { in: followUpIds } },
      });

      await tx.patientFollowUp.deleteMany({
        where: { id: { in: followUpIds } },
      });
    }

    await tx.patient.deleteMany({
      where: { id: { in: patientIds } },
    });
  });

  console.log(`Demo hasta takip verileri silindi. Marker: ${DEMO_MARKER}`);
  console.log(`Silinen hasta sayisi: ${patients.length}`);
}

main()
  .catch((error) => {
    console.error("Demo temizleme hatasi:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
