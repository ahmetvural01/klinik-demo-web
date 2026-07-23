import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("10711453", 10);

  // Create or update Institution first. Name and email are both unique in the schema,
  // so seed must tolerate either one already existing in a fresh/demo database.
  const existingInstitution = await prisma.institution.findFirst({
    where: { OR: [{ email: "info@whitedental.com" }, { name: "whitedental" }] },
  });
  const institution = existingInstitution
    ? await prisma.institution.update({
        where: { id: existingInstitution.id },
        data: {
          name: "whitedental",
          email: "info@whitedental.com",
          phone: "05306375370",
          address: "Cukurova / Adana",
          subscriptionPlan: "PROFESYONEL",
          isActive: true,
        },
      })
    : await prisma.institution.create({
        data: {
          name: "whitedental",
          email: "info@whitedental.com",
          phone: "05306375370",
          address: "Cukurova / Adana",
          subscriptionPlan: "PROFESYONEL",
          smsBalance: 0,
          isActive: true,
        },
      });

  const admin = await prisma.user.upsert({
    where: {
      institutionId_identityNo: {
        identityNo: "10000000001",
        institutionId: institution.id
      }
    },
    update: {},
    create: {
      identityNo: "10000000001",
      institutionId: institution.id,
      fullName: "Klinik Yoneticisi",
      role: Role.YONETICI,
      passwordHash: adminPass,
      isActive: true,
      profile: {
        create: {
          workStart: "08:30",
          workEnd: "23:59"
        }
      }
    }
  });

  await prisma.setting.upsert({
    where: { institutionId: institution.id },
    update: {},
    create: {
      institutionId: institution.id,
      institutionName: "Adana White Dental Clinic",
      institutionAddress: "Cukurova / Adana",
      institutionPhone: "05306375370",
      institutionWebsite: "www.adanawhitedental.com",
      openingTime: "08:30",
      closingTime: "23:59",
      appointmentDuration: 15
    }
  });

  // Create default SUPERADMIN user
  // Not: identityNo artık sadece kurum içinde benzersiz (bkz. schema notu), bu yüzden
  // institutionId=null olan superadmin hesapları için upsert yerine findFirst+create/update
  // kullanılıyor (compound unique key non-null institutionId gerektiriyor).
  const systemSuperadminPass = await bcrypt.hash("superadmin123", 10);
  const existingSystemSuperadmin = await prisma.user.findFirst({
    where: { identityNo: "99999999999", role: Role.SUPERADMIN },
  });
  const systemSuperadmin = existingSystemSuperadmin
    ? await prisma.user.update({
        where: { id: existingSystemSuperadmin.id },
        data: { fullName: "Sistem Yonetici", role: Role.SUPERADMIN, institutionId: null, isActive: true },
      })
    : await prisma.user.create({
        data: {
          identityNo: "99999999999",
          fullName: "Sistem Yonetici",
          role: Role.SUPERADMIN,
          institutionId: null,
          passwordHash: systemSuperadminPass,
          isActive: true,
        },
      });

  // Requested superadmin account
  const ahmetSuperadminPass = await bcrypt.hash("10711453", 10);
  const existingAhmetSuperadmin = await prisma.user.findFirst({
    where: { identityNo: "11509380760", role: Role.SUPERADMIN },
  });
  const ahmetSuperadmin = existingAhmetSuperadmin
    ? await prisma.user.update({
        where: { id: existingAhmetSuperadmin.id },
        data: { fullName: "Ahmet Gulden", role: Role.SUPERADMIN, institutionId: null, passwordHash: ahmetSuperadminPass, isActive: true },
      })
    : await prisma.user.create({
        data: {
          identityNo: "11509380760",
          fullName: "Ahmet Gulden",
          role: Role.SUPERADMIN,
          institutionId: null,
          passwordHash: ahmetSuperadminPass,
          isActive: true,
        },
      });

  void systemSuperadmin;
  void ahmetSuperadmin;

  await prisma.priceItem.createMany({
    data: [
      { code: "11", treatment: "Dis Hekimi Muayenesi", amount: 660, isCustom: false },
      { code: "21", treatment: "Kompozit Dolgu", amount: 2500, isCustom: true },
      { code: "31", treatment: "Implant", amount: 7000, isCustom: true }
    ],
    skipDuplicates: true
  });

  await prisma.platformSmsWallet.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      availableBalance: 0,
    },
  });

  // institutionId=null (sistem varsayılanı) satırlarda Postgres NULL'ları
  // @@unique([institutionId, code]) karşılaştırmasında eşit saymaz — native
  // upsert/ON CONFLICT bu durumda güvenilmez, bu yüzden elle findFirst+create/update.
  const defaultTemplates = [
    {
      code: "BILGI",
      title: "Bilgi SMS",
      content: "{{institutionName}}: Sayin {{patientName}}, randevunuz olusturuldu. Tarih: {{dateTime}}.",
    },
    {
      code: "HATIRLATMA",
      title: "Hatirlatma SMS",
      content: "{{institutionName}}: Sayin {{patientName}}, randevu hatirlatmasi. Tarih: {{dateTime}}, Doktor: {{doctorName}}.",
    },
    {
      code: "ANKET",
      title: "Anket SMS",
      content: "{{institutionName}}: Sayin {{patientName}}, randevunuz tamamlandi. Geri bildiriminiz bizim icin degerli.",
    },
  ];
  for (const t of defaultTemplates) {
    const existing = await prisma.smsTemplate.findFirst({ where: { institutionId: null, code: t.code } });
    if (!existing) {
      await prisma.smsTemplate.create({ data: { ...t, isActive: true } });
    }
  }

  await prisma.smsProviderConfig.upsert({
    where: { code: "MOCK" },
    update: {},
    create: {
      code: "MOCK",
      name: "Ucretsiz Test (Mock)",
      isActive: true,
      priority: 1,
      httpMethod: "POST",
      sender: "KlinikPanel",
      bodyTemplate: "phone={{phone}}&message={{message}}",
      successPattern: "MOCK",
    },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "NETGSM" },
    update: {},
    create: {
      code: "NETGSM",
      name: "Netgsm",
      isActive: false,
      priority: 10,
      sendUrl: "https://api.netgsm.com.tr/sms/send/get/",
      balanceUrl: "https://api.netgsm.com.tr/balance/list/xml",
      httpMethod: "POST",
    },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "TWILIO" },
    update: {},
    create: {
      code: "TWILIO",
      name: "Twilio",
      isActive: false,
      priority: 20,
      sendUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Messages.json",
      balanceUrl: "https://api.twilio.com/2010-04-01/Accounts/{{username}}/Balance.json",
      httpMethod: "POST",
      sender: "+15005550006",
    },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "ILETIMERKEZI" },
    update: {},
    create: {
      code: "ILETIMERKEZI",
      name: "Ileti Merkezi",
      isActive: false,
      priority: 2,
      httpMethod: "POST",
    },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "MUTLUCELL" },
    update: {},
    create: {
      code: "MUTLUCELL",
      name: "Mutlucell",
      isActive: false,
      priority: 3,
      httpMethod: "POST",
    },
  });

  await prisma.smsProviderConfig.upsert({
    where: { code: "CUSTOM" },
    update: {},
    create: {
      code: "CUSTOM",
      name: "Ozel HTTP SMS",
      isActive: false,
      priority: 50,
      httpMethod: "POST",
      bodyTemplate: "phone={{phone}}&message={{message}}",
    },
  });

  // Create Invoice test data
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  await prisma.invoice.createMany({
    data: [
      {
        invoiceNo: "INV-2025-001",
        institutionId: institution.id,
        amount: 5900.00,
        description: "Aylık hizmet ücreti",
        status: "PAID",
        dueDate: today,
        paidAt: today,
      },
      {
        invoiceNo: "INV-2025-002",
        institutionId: institution.id,
        amount: 7080.00,
        description: "Aylık hizmet ücreti + SMS paket",
        status: "PENDING",
        dueDate: nextWeek,
      },
      {
        invoiceNo: "INV-2025-003",
        institutionId: institution.id,
        amount: 3540.00,
        description: "SMS paket ek sipariş",
        status: "OVERDUE",
        dueDate: lastWeek,
      },
      {
        invoiceNo: "INV-2025-004",
        institutionId: institution.id,
        amount: 10620.00,
        description: "Yıllık premium plan",
        status: "PENDING",
        dueDate: tomorrow,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "SEED",
      detail: "Baslangic verileri yuklendi"
    }
  });

  console.log("Seed tamamlandi");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
