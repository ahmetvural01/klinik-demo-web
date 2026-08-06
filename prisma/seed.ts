import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required for seeding.`);
  }
  return value;
}

async function main() {
  const adminPass = await bcrypt.hash(requireEnv("DEMO_ADMIN_PASSWORD"), 10);
  const superadminPass = await bcrypt.hash(requireEnv("SUPERADMIN_PASSWORD"), 10);
  const demoInstitutionName = process.env.DEMO_INSTITUTION_NAME || "demo-klinik";
  const demoInstitutionEmail = process.env.DEMO_INSTITUTION_EMAIL || "demo@local.test";
  const demoInstitutionWebsite = process.env.DEMO_INSTITUTION_WEBSITE || "www.demo.local";
  const demoAdminIdentity = process.env.DEMO_ADMIN_IDENTITY || "00000000000";
  const demoAdminFullName = process.env.DEMO_ADMIN_FULL_NAME || "Demo Kullanici";
  const superadminIdentityNo = process.env.SUPERADMIN_IDENTITY || "00000000001";
  const superadminFullName = process.env.SUPERADMIN_FULL_NAME || "Demo Superadmin";
  const requestedSuperadminIdentityNo = process.env.SUPERADMIN_LOGIN_IDENTITY || superadminIdentityNo;
  const requestedSuperadminFullName = process.env.SUPERADMIN_LOGIN_FULL_NAME || superadminFullName;

  // Create or update Institution first. Name and email are both unique in the schema,
  // so seed must tolerate either one already existing in a fresh/demo database.
  const existingInstitution = await prisma.institution.findFirst({
    where: { OR: [{ email: demoInstitutionEmail }, { name: demoInstitutionName }] },
  });
  const institution = existingInstitution
    ? await prisma.institution.update({
        where: { id: existingInstitution.id },
        data: {
          name: demoInstitutionName,
          email: demoInstitutionEmail,
          phone: "05306375370",
          address: "Cukurova / Adana",
          subscriptionPlan: "PROFESYONEL",
          isActive: true,
        },
      })
    : await prisma.institution.create({
        data: {
          name: demoInstitutionName,
          email: demoInstitutionEmail,
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
        identityNo: demoAdminIdentity,
        institutionId: institution.id
      }
    },
    update: {},
    create: {
      identityNo: demoAdminIdentity,
      institutionId: institution.id,
      fullName: demoAdminFullName,
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
      institutionWebsite: demoInstitutionWebsite,
      openingTime: "08:30",
      closingTime: "23:59",
      appointmentDuration: 15
    }
  });

  // Create default SUPERADMIN user
  // Not: identityNo artık sadece kurum içinde benzersiz (bkz. schema notu), bu yüzden
  // institutionId=null olan superadmin hesapları için upsert yerine findFirst+create/update
  // kullanılıyor (compound unique key non-null institutionId gerektiriyor).
  //
  // GÜVENLİK: Superadmin zaten varsa seed onun passwordHash'ini asla değiştirmemeli —
  // aksi halde SUPERADMIN_PASSWORD env değeri sonraki bir deploy'da değişirse, mevcut
  // hesabın gerçek şifresi sessizce geçersiz kılınır (bkz. bu depoda daha önce yaşanan
  // "stale seed vs current env" giriş uyuşmazlığı). Şifre değişikliği yalnız açık bir
  // CLI aracıyla (scripts/fix-superadmin-user.cjs, scripts/create-superadmin.mts) yapılmalı.
  const existingSystemSuperadmin = await prisma.user.findFirst({
    where: { identityNo: superadminIdentityNo, role: Role.SUPERADMIN },
  });
  const systemSuperadmin = existingSystemSuperadmin
    ? await prisma.user.update({
        where: { id: existingSystemSuperadmin.id },
        data: { fullName: superadminFullName, role: Role.SUPERADMIN, institutionId: null, isActive: true },
      })
    : await prisma.user.create({
        data: {
          identityNo: superadminIdentityNo,
          fullName: superadminFullName,
          role: Role.SUPERADMIN,
          institutionId: null,
          passwordHash: superadminPass,
          isActive: true,
        },
      });

  // Requested superadmin account
  const existingAhmetSuperadmin = await prisma.user.findFirst({
    where: { identityNo: requestedSuperadminIdentityNo, role: Role.SUPERADMIN },
  });
  const ahmetSuperadmin = existingAhmetSuperadmin
    ? await prisma.user.update({
        where: { id: existingAhmetSuperadmin.id },
        data: { fullName: requestedSuperadminFullName, role: Role.SUPERADMIN, institutionId: null, isActive: true },
      })
    : await prisma.user.create({
        data: {
          identityNo: requestedSuperadminIdentityNo,
          fullName: requestedSuperadminFullName,
          role: Role.SUPERADMIN,
          institutionId: null,
          passwordHash: superadminPass,
          isActive: true,
        },
      });

  void systemSuperadmin;
  void ahmetSuperadmin;

  // Not: institutionId'siz (kurumsuz) bir PriceItem hiçbir klinik sorgusunda
  // eşleşmez — standart katalog zaten uygulama katmanında (bkz.
  // src/lib/dental-treatment-catalog.ts, /api/prices route'undaki
  // catalogAsPriceItems) her kuruma otomatik sunuluyor. Burada eskiden
  // oluşturulan institutionId'siz satırlar sahipsiz/erişilemez kalıyordu
  // (bkz. denetim raporu) — bu yüzden kaldırıldı.

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
