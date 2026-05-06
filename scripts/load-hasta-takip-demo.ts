import { PrismaClient, FollowUpType } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_MARKER = "[DEMO_HASTA_TAKIP_20260506]";

const demoPatients = [
  {
    tcNo: "99000000001",
    fullName: "Demo Ayse Yilmaz",
    phone: "05550000001",
    gender: "KADIN",
    referrer: DEMO_MARKER,
    notes: `${DEMO_MARKER} Estetik dis tedavisiyle ilgileniyor.`,
    followUp: {
      type: FollowUpType.ULASILAMADI,
      priority: 2,
      note: "Ilk arama yapildi, telefon acilmadi.",
      nextActionAtOffsetDays: 1,
      events: [
        {
          occurredAtOffsetDays: -2,
          channel: "Telefon",
          summary: "Hasta arandi, telefonu acmadi.",
          detail: "Saat 11:20 civari arama yapildi, geri donus olmadi.",
          patientResponse: "",
          nextStep: "Yarin tekrar aranacak.",
        },
      ],
    },
  },
  {
    tcNo: "99000000002",
    fullName: "Demo Mehmet Kaya",
    phone: "05550000002",
    gender: "ERKEK",
    referrer: DEMO_MARKER,
    notes: `${DEMO_MARKER} Implant tedavisi icin fiyat arastiriyor.`,
    followUp: {
      type: FollowUpType.DONUS_BEKLENIYOR,
      priority: 3,
      note: "Hasta fiyat bilgisi aldi, dusunup donecegini belirtti.",
      nextActionAtOffsetDays: 2,
      events: [
        {
          occurredAtOffsetDays: -3,
          channel: "Telefon",
          summary: "Hasta fiyat bilgisi istedi.",
          detail: "Tek cene implant icin ortalama surec ve fiyat araligi paylasildi.",
          patientResponse: "Bilgileri aldim, esimle konusup donecegim.",
          nextStep: "2 gun sonra karar durumu icin tekrar aranacak.",
        },
      ],
    },
  },
  {
    tcNo: "99000000003",
    fullName: "Demo Elif Demir",
    phone: "05550000003",
    gender: "KADIN",
    referrer: DEMO_MARKER,
    notes: `${DEMO_MARKER} Kontrol randevusu icin alternatif tarih bekliyor.`,
    followUp: {
      type: FollowUpType.GERI_ARA,
      priority: 1,
      note: "Hasta bu hafta gelemeyecegini, baska tarihe bakacagini soyledi.",
      nextActionAtOffsetDays: 4,
      events: [
        {
          occurredAtOffsetDays: -1,
          channel: "Telefon",
          summary: "Hasta baska zaman gelmek istedigini soyledi.",
          detail: "Mevcut hafta yogun oldugu icin sonraki hafta aranmamizi istedi.",
          patientResponse: "Bu hafta gelemem, haftaya goruselim.",
          nextStep: "Haftaya uygunluk icin tekrar aranacak.",
        },
      ],
    },
  },
  {
    tcNo: "99000000004",
    fullName: "Demo Kerem Aydin",
    phone: "05550000004",
    gender: "ERKEK",
    referrer: DEMO_MARKER,
    notes: `${DEMO_MARKER} Muayene sonrasi kararsiz hasta.`,
    followUp: {
      type: FollowUpType.DIGER,
      priority: 2,
      note: "Hasta tedavi planini dusunmek icin sure istedi.",
      nextActionAtOffsetDays: 3,
      events: [
        {
          occurredAtOffsetDays: -4,
          channel: "Yuz yuze",
          summary: "Hasta muayene oldu, karar icin sure istedi.",
          detail: "Tedavi plani anlatildi, kendisine yazili ozet verildi.",
          patientResponse: "Ailemle degerlendirip haber verecegim.",
          nextStep: "3 gun sonra karar durumu sorulacak.",
        },
        {
          occurredAtOffsetDays: -1,
          channel: "WhatsApp",
          summary: "Bilgi mesaji gonderildi.",
          detail: "Tedavi ozetinin dijital kopyasi paylasildi.",
          patientResponse: "Mesaj icin tesekkur etti.",
          nextStep: "Telefonla tekrar gorusulecek.",
        },
      ],
    },
  },
];

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

async function main() {
  const existingPatients = await prisma.patient.count({
    where: { referrer: DEMO_MARKER },
  });

  if (existingPatients > 0) {
    console.log(`Demo veriler zaten mevcut. Marker: ${DEMO_MARKER}`);
    return;
  }

  const creator = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true },
  });

  const doctor = await prisma.user.findFirst({
    where: { isActive: true, role: "DOKTOR" },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true },
  });

  if (!creator) {
    throw new Error("Demo veriler icin kullanici bulunamadi.");
  }

  for (const item of demoPatients) {
    const patient = await prisma.patient.create({
      data: {
        tcNo: item.tcNo,
        fullName: item.fullName,
        phone: item.phone,
        gender: item.gender,
        referrer: item.referrer,
        notes: item.notes,
      },
    });

    const followUp = await prisma.patientFollowUp.create({
      data: {
        patientId: patient.id,
        doctorId: doctor?.id || null,
        createdById: creator.id,
        type: item.followUp.type,
        priority: item.followUp.priority,
        note: item.followUp.note,
        nextActionAt: addDays(new Date(), item.followUp.nextActionAtOffsetDays),
        status: "ACIK",
      },
    });

    for (const event of item.followUp.events) {
      await prisma.patientFollowUpEvent.create({
        data: {
          followUpId: followUp.id,
          patientId: patient.id,
          occurredAt: addDays(new Date(), event.occurredAtOffsetDays),
          channel: event.channel,
          summary: event.summary,
          detail: event.detail,
          patientResponse: event.patientResponse || null,
          nextStep: event.nextStep || null,
          createdById: creator.id,
          updatedById: creator.id,
        },
      });
    }
  }

  console.log(`Demo hasta takip verileri yuklendi. Marker: ${DEMO_MARKER}`);
  console.log(`Olusturan kullanici: ${creator.fullName}${doctor ? ` | Atanan doktor: ${doctor.fullName}` : ""}`);
}

main()
  .catch((error) => {
    console.error("Demo yukleme hatasi:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
