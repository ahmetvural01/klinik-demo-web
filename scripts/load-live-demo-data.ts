import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = process.env.LIVE_DEMO_PASSWORD || "";
if (!PASSWORD) {
  throw new Error("LIVE_DEMO_PASSWORD ortam değişkeni zorunludur.");
}

function dec(value: number | string) {
  return new Prisma.Decimal(value);
}

function at(days: number, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function cleanVisibleName(value: string) {
  return value
    .replace(/^Demo\s+/i, "")
    .replace(/\s*\[DEMO_PAKET[^\]]*\]/gi, "")
    .replace(/DEMO_PAKET_[\w-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function cleanupOldVisibleDemoPrefixes(institutionId: string) {
  const demoPatients = await prisma.patient.findMany({
    where: { institutionId, OR: [{ fullName: { startsWith: "Demo " } }, { fullName: { contains: "DEMO_PAKET" } }] },
    select: { id: true, fullName: true },
  });
  for (const p of demoPatients) {
    const fullName = cleanVisibleName(p.fullName);
    if (!fullName || fullName === p.fullName) continue;
    await prisma.patient.update({
      where: { id: p.id },
      data: { fullName },
    });
  }

  const demoUsers = await prisma.user.findMany({
    where: { institutionId, OR: [{ fullName: { startsWith: "Demo " } }, { fullName: { contains: "DEMO_PAKET" } }] },
    select: { id: true, fullName: true },
  });
  for (const u of demoUsers) {
    const fullName = cleanVisibleName(u.fullName);
    if (!fullName || fullName === u.fullName) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { fullName },
    });
  }

  const demoFirms = await prisma.firma.findMany({
    where: { institutionId, OR: [{ name: { startsWith: "Demo " } }, { name: { contains: "DEMO_PAKET" } }] },
    select: { id: true, name: true },
  });
  for (const f of demoFirms) {
    const cleanName = cleanVisibleName(f.name);
    const exists = await prisma.firma.findFirst({ where: { institutionId, name: cleanName, NOT: { id: f.id } } });
    if (!exists) await prisma.firma.update({ where: { id: f.id }, data: { name: cleanName } });
  }

  const demoStockItems = await prisma.stockItem.findMany({
    where: { institutionId, OR: [{ name: { startsWith: "Demo " } }, { name: { contains: "DEMO_PAKET" } }] },
    select: { id: true, name: true },
  });
  for (const item of demoStockItems) {
    const cleanName = cleanVisibleName(item.name);
    const exists = await prisma.stockItem.findFirst({ where: { institutionId, name: cleanName, NOT: { id: item.id } } });
    if (cleanName && !exists) await prisma.stockItem.update({ where: { id: item.id }, data: { name: cleanName } });
  }

  const demoPriceItems = await prisma.priceItem.findMany({
    where: { institutionId, OR: [{ treatment: { startsWith: "Demo " } }, { treatment: { contains: "DEMO_PAKET" } }] },
    select: { id: true, treatment: true },
  });
  for (const item of demoPriceItems) {
    const cleanName = cleanVisibleName(item.treatment);
    if (cleanName && cleanName !== item.treatment) await prisma.priceItem.update({ where: { id: item.id }, data: { treatment: cleanName } });
  }

  const demoExpenseCategories = await prisma.expenseCategory.findMany({
    where: { institutionId, OR: [{ name: { startsWith: "Demo " } }, { name: { contains: "DEMO_PAKET" } }] },
    select: { id: true, name: true },
  });
  for (const category of demoExpenseCategories) {
    const cleanName = cleanVisibleName(category.name);
    const exists = await prisma.expenseCategory.findFirst({ where: { institutionId, name: cleanName, NOT: { id: category.id } } });
    if (cleanName && !exists) await prisma.expenseCategory.update({ where: { id: category.id }, data: { name: cleanName } });
  }
}

async function upsertStaff(institutionId: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const rows = [
    { identityNo: "10000000011", fullName: "Dr. Elif Karaca", role: Role.DOKTOR, email: "elif.karaca@whitedental.local", genelYuzde: 40, kkYuzde: 35, maasYuzde: 30 },
    { identityNo: "10000000012", fullName: "Dr. Mert Aydın", role: Role.DOKTOR, email: "mert.aydin@whitedental.local", genelYuzde: 42, kkYuzde: 36, maasYuzde: 30 },
    { identityNo: "10000000013", fullName: "Derya Aslan", role: Role.ASISTAN, email: "derya.aslan@whitedental.local" },
    { identityNo: "10000000014", fullName: "Sibel Yalçın", role: Role.BANKO, email: "sibel.yalcin@whitedental.local" },
    { identityNo: "10000000015", fullName: "Hakan Demir", role: Role.MUHASEBE, email: "hakan.demir@whitedental.local" },
  ];

  const users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>> = {};
  for (const u of rows) {
    const user = await prisma.user.upsert({
      where: { institutionId_identityNo: { institutionId, identityNo: u.identityNo } },
      update: {
        fullName: u.fullName,
        role: u.role,
        email: u.email,
        isActive: true,
        passwordHash,
        genelYuzde: u.genelYuzde === undefined ? undefined : dec(u.genelYuzde),
        kkYuzde: u.kkYuzde === undefined ? undefined : dec(u.kkYuzde),
        maasYuzde: u.maasYuzde === undefined ? undefined : dec(u.maasYuzde),
      },
      create: {
        institutionId,
        identityNo: u.identityNo,
        fullName: u.fullName,
        role: u.role,
        email: u.email,
        isActive: true,
        passwordHash,
        genelYuzde: u.genelYuzde === undefined ? undefined : dec(u.genelYuzde),
        kkYuzde: u.kkYuzde === undefined ? undefined : dec(u.kkYuzde),
        maasYuzde: u.maasYuzde === undefined ? undefined : dec(u.maasYuzde),
      },
    });
    users[u.identityNo] = user;
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { workStart: "09:00", workEnd: "18:00", hideAsDoctor: false },
      create: { userId: user.id, workStart: "09:00", workEnd: "18:00", hideAsDoctor: false },
    });
  }

  const manager = await prisma.user.update({
    where: { institutionId_identityNo: { institutionId, identityNo: "10000000001" } },
    data: { passwordHash, isActive: true },
  });
  users.manager = manager;
  return users;
}

async function upsertSettings(institutionId: string, institutionName: string) {
  await prisma.setting.upsert({
    where: { institutionId },
    update: {
      institutionName,
      institutionAddress: "Çukurova / Adana",
      institutionPhone: "0530 637 5370",
      institutionWebsite: "www.adanawhitedental.com",
      openingTime: "09:00",
      closingTime: "18:30",
      appointmentDuration: 30,
      smsEnabled: true,
      smsDefaultInfo: true,
      smsDefaultReminder: true,
      activePriceList: "ozel",
      followUpCustomTypes: JSON.stringify(["Prova Randevusu", "Tedavi Planı Onayı", "Eksik Evrak", "Kontrol Araması"]),
    },
    create: {
      institutionId,
      institutionName,
      institutionAddress: "Çukurova / Adana",
      institutionPhone: "0530 637 5370",
      institutionWebsite: "www.adanawhitedental.com",
      openingTime: "09:00",
      closingTime: "18:30",
      appointmentDuration: 30,
      smsEnabled: true,
      smsDefaultInfo: true,
      smsDefaultReminder: true,
      activePriceList: "ozel",
      followUpCustomTypes: JSON.stringify(["Prova Randevusu", "Tedavi Planı Onayı", "Eksik Evrak", "Kontrol Araması"]),
    },
  });
}

async function upsertPatients(institutionId: string) {
  const patients = [
    ["98100000001", "Akif Balcı", "05551000101", "E", "Özel Sigorta", 0, "Tavsiye"],
    ["98100000002", "Zeynep Arslan", "05551000102", "K", "SGK", 5, "Instagram"],
    ["98100000003", "Mehmet Kaya", "05551000103", "E", "SGK", 0, "Google"],
    ["98100000004", "Ayşe Yılmaz", "05551000104", "K", "Özel Sigorta", 10, "Hasta Yakını"],
    ["98100000005", "Can Erdem", "05551000105", "E", "SGK", 0, "Web Sitesi"],
    ["98100000006", "Deniz Acar", "05551000106", "K", "SGK", 0, "Tabela"],
    ["98100000007", "Elif Demir", "05551000107", "K", "Özel Sigorta", 15, "Instagram"],
    ["98100000008", "Burak Şahin", "05551000108", "E", "SGK", 0, "Tavsiye"],
    ["98100000009", "Selin Koç", "05551000109", "K", "SGK", 0, "Google"],
    ["98100000010", "Murat Özkan", "05551000110", "E", "Bağkur", 0, "Web Sitesi"],
    ["98100000011", "Kerem Aydın", "05551000111", "E", "SGK", 7, "Tavsiye"],
    ["98100000012", "Fatma Çelik", "05551000112", "K", "Özel Sigorta", 0, "Instagram"],
    ["98100000013", "Emre Yıldız", "05551000113", "E", "SGK", 0, "Google"],
    ["98100000014", "Dilan Öztürk", "05551000114", "K", "SGK", 0, "Hasta Yakını"],
    ["98100000015", "Hüseyin Sarı", "05551000115", "E", "Bağkur", 0, "Tabela"],
    ["98100000016", "Nazlı Güneş", "05551000116", "K", "Özel Sigorta", 5, "Web Sitesi"],
    ["98100000017", "Onur Kaplan", "05551000117", "E", "SGK", 0, "Tavsiye"],
    ["98100000018", "Yasemin Polat", "05551000118", "K", "SGK", 0, "Instagram"],
  ] as const;

  const map: Record<string, Awaited<ReturnType<typeof prisma.patient.upsert>>> = {};
  for (const [tcNo, fullName, phone, gender, insurance, discountRate, referrer] of patients) {
    const patientData = {
      fullName,
      phone,
      gender,
      insurance,
      discountRate,
      referrer,
      address: "Adana",
      hasAllergy: fullName === "Zeynep Arslan",
      hasDiabetes: fullName === "Hüseyin Sarı",
      bloodType: gender === "K" ? "A Rh+" : "0 Rh+",
    };
    const existingByTc = await prisma.patient.findUnique({ where: { institutionId_tcNo: { institutionId, tcNo } } });
    const existingByName = existingByTc ? null : await prisma.patient.findFirst({ where: { institutionId, fullName } });
    const patient = existingByTc
      ? await prisma.patient.update({ where: { id: existingByTc.id }, data: patientData })
      : existingByName
        ? await prisma.patient.update({ where: { id: existingByName.id }, data: { ...patientData, tcNo } })
        : await prisma.patient.create({ data: { institutionId, tcNo, ...patientData } });
    map[fullName] = patient;
  }
  return map;
}

async function upsertReferenceData(institutionId: string) {
  const priceItems = [
    ["T001", "Kompozit Dolgu (Tek Yüz)", 1750],
    ["T002", "Kompozit Dolgu (İki Yüz)", 2350],
    ["T003", "Kanal Tedavisi", 5200],
    ["T004", "Detertraj", 1800],
    ["T005", "Tek Silindirik İmplant", 22400],
    ["T006", "Zirkonyum Kaplama", 6500],
    ["T007", "Panoramik Film", 650],
    ["T008", "Gece Plağı", 2800],
  ] as const;
  for (const [code, treatment, amount] of priceItems) {
    await prisma.priceItem.upsert({
      where: { institutionId_code_treatment: { institutionId, code, treatment } },
      update: { amount: dec(amount), isFavorite: true, isCustom: true },
      create: { institutionId, code, treatment, amount: dec(amount), isFavorite: true, isCustom: true },
    });
  }

  const types = [
    ["kontrol", "Kontrol", "#2563eb"],
    ["implant", "İmplant", "#dc2626"],
    ["kanal", "Kanal Tedavisi", "#7c3aed"],
    ["dolgu", "Dolgu", "#059669"],
    ["prova", "Prova", "#d97706"],
  ] as const;
  for (let i = 0; i < types.length; i += 1) {
    const [value, label, color] = types[i];
    await prisma.treatmentType.upsert({
      where: { institutionId_value: { institutionId, value } },
      update: { label, color, order: i, isActive: true },
      create: { institutionId, value, label, color, order: i, isActive: true },
    });
  }

  const expenseCategories = [
    ["Kira", false],
    ["Personel Gideri", false],
    ["Sarf ve Malzeme", false],
    ["Laboratuvar Ödemesi", false],
    ["Doktor Hakedişi", true],
    ["Bakım ve Teknik Servis", false],
  ] as const;
  const categories: Record<string, string> = {};
  for (const [name, isDoctorPayout] of expenseCategories) {
    const c = await prisma.expenseCategory.upsert({
      where: { institutionId_name: { institutionId, name } },
      update: { isActive: true, isDoctorPayout },
      create: { institutionId, name, isActive: true, isDoctorPayout },
    });
    categories[name] = c.id;
  }
  return categories;
}

async function upsertPos(institutionId: string) {
  const names = ["Akbank POS", "Garanti POS", "Mail Order Sanal POS"];
  const result: Record<string, string> = {};
  for (const name of names) {
    const pos = await prisma.posDevice.upsert({
      where: { institutionId_name: { institutionId, name } },
      update: { isActive: true },
      create: { institutionId, name, isActive: true },
    });
    result[name] = pos.id;
  }
  return result;
}

async function upsertFirms(institutionId: string) {
  const rows = [
    { name: "Marmara Dental Lab", kategori: "LAB" as const, phone: "0212 444 10 10", notes: "Zirkonyum, e-max ve implant üst yapı işleri" },
    { name: "Çukurova Protez Lab", kategori: "LAB" as const, phone: "0322 555 20 20", notes: "Protez, gece plağı ve hareketli aparey işleri" },
    { name: "Ege Dijital Lab", kategori: "LAB" as const, phone: "0232 777 30 30", notes: "Dijital ölçü ve cad/cam üretim" },
    { name: "Medikal Sarf Deposu", kategori: "TEDARICI" as const, phone: "0212 600 40 40", notes: "Eldiven, maske ve sarf malzemeler" },
    { name: "Aydın Dental Tedarik", kategori: "TEDARICI" as const, phone: "0256 700 50 50", notes: "Kompozit, anestezi ve kanal ekipmanları" },
    { name: "Teknik Bakım Servisi", kategori: "HIZMET_SAGLAYICI" as const, phone: "0322 800 60 60", notes: "Ünit bakım ve kompresör servis işleri" },
  ];
  const firms: Record<string, Awaited<ReturnType<typeof prisma.firma.upsert>>> = {};
  for (const f of rows) {
    const firma = await prisma.firma.upsert({
      where: { institutionId_name: { institutionId, name: f.name } },
      update: { kategori: f.kategori, phone: f.phone, notes: f.notes, isActive: true, paymentTerms: "COD", vendorScore: 0 },
      create: { institutionId, name: f.name, kategori: f.kategori, phone: f.phone, notes: f.notes, isActive: true, paymentTerms: "COD", vendorScore: 0 },
    });
    firms[f.name] = firma;

    await prisma.firmaKontakt.upsert({
      where: { id: `contact-${firma.id}` },
      update: {},
      create: {
        id: `contact-${firma.id}`,
        firmaId: firma.id,
        ad: f.kategori === "LAB" ? "Operasyon Yetkilisi" : "Satış Yetkilisi",
        unvan: f.kategori === "LAB" ? "Laboratuvar Koordinatörü" : "Cari Hesap Sorumlusu",
        telefon: f.phone,
        rol: f.kategori === "LAB" ? "İş teslim ve fatura" : "Sipariş ve ödeme",
        isPrimary: true,
      },
    });
  }
  return firms;
}

async function createAppointment(patientId: string, doctorId: string, startAt: Date, status: string, type = "STANDART", note?: string) {
  const existing = await prisma.appointment.findFirst({ where: { patientId, doctorId, startAt } });
  if (existing) {
    return prisma.appointment.update({
      where: { id: existing.id },
      data: { endAt: addMinutes(startAt, 30), status, type: type as any, note },
    });
  }
  return prisma.appointment.create({
    data: { patientId, doctorId, startAt, endAt: addMinutes(startAt, 30), status, type: type as any, note },
  });
}

async function createExamination(patientId: string, doctorId: string, treatmentName: string, toothNo: string | null, amount: number, status: string, dayOffset = 0) {
  const existing = await prisma.examination.findFirst({ where: { patientId, doctorId, treatmentName, toothNo: toothNo || undefined } });
  if (existing) {
    return prisma.examination.update({ where: { id: existing.id }, data: { amount: dec(amount), status, diagnosedAt: at(dayOffset, 11) } });
  }
  return prisma.examination.create({
    data: { patientId, doctorId, treatmentName, toothNo: toothNo || undefined, amount: dec(amount), status, diagnosedAt: at(dayOffset, 11) },
  });
}

async function createPayment(patientId: string, doctorId: string, amount: number, method: "NAKIT" | "KREDI_KARTI" | "HAVALE_EFT" | "MAIL_ORDER" | "DIGER", posId: string | null, description: string, daysAgo = 0) {
  const existing = await prisma.payment.findFirst({ where: { patientId, doctorId, description } });
  if (existing) {
    return prisma.payment.update({
      where: { id: existing.id },
      data: { amount: dec(amount), method, posId: posId || undefined, createdAt: at(-daysAgo, 12) },
    });
  }
  return prisma.payment.create({
    data: { patientId, doctorId, amount: dec(amount), method, posId: posId || undefined, description, createdAt: at(-daysAgo, 12) },
  });
}

async function upsertClinicalFlow(
  institutionId: string,
  users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>>,
  patients: Record<string, Awaited<ReturnType<typeof prisma.patient.upsert>>>,
  pos: Record<string, string>,
) {
  const drElif = users["10000000011"];
  const drMert = users["10000000012"];
  const assistant = users["10000000013"];
  const manager = users.manager;

  await createAppointment(patients["Akif Balcı"].id, drElif.id, at(0, 10, 0), "ONAYLANDI", "STANDART", "İmplant kontrol ve ödeme görüşmesi");
  await createAppointment(patients["Zeynep Arslan"].id, drElif.id, at(1, 11, 0), "BEKLIYOR", "KONTROL", "Zirkonyum prova randevusu");
  await createAppointment(patients["Mehmet Kaya"].id, drMert.id, at(0, 14, 30), "BEKLIYOR", "ACIL", "Ağrı şikayeti");
  await createAppointment(patients["Ayşe Yılmaz"].id, drMert.id, at(-1, 15, 0), "GELMEDI", "STANDART", "Gelmedi, hasta takip açıldı");
  await createAppointment(patients["Can Erdem"].id, drElif.id, at(3, 9, 30), "BEKLIYOR", "KONTROL", "İmplant üst yapı prova");
  await createAppointment(patients["Deniz Acar"].id, drMert.id, at(5, 13, 0), "BEKLIYOR", "STANDART", "İlk muayene");
  await createAppointment(patients["Fatma Çelik"].id, drElif.id, at(2, 16, 0), "ONAYLANDI", "KONTROL", "Gece plağı teslim");

  await createExamination(patients["Akif Balcı"].id, drElif.id, "Tek Silindirik İmplant", "36", 22400, "TAMAMLANDI", -7);
  await createExamination(patients["Akif Balcı"].id, drElif.id, "Zirkonyum Kaplama", "36", 6500, "TEDAVI_BEKLIYOR", 0);
  await createExamination(patients["Zeynep Arslan"].id, drElif.id, "Zirkonyum Kaplama", "11,12,21,22", 26000, "TEDAVI_BEKLIYOR", -3);
  await createExamination(patients["Mehmet Kaya"].id, drMert.id, "Kanal Tedavisi", "46", 5200, "TEDAVI_BEKLIYOR", 0);
  await createExamination(patients["Ayşe Yılmaz"].id, drMert.id, "Detertraj", "Üst Çene", 1800, "TAMAMLANDI", -2);
  await createExamination(patients["Can Erdem"].id, drElif.id, "İmplant Üst Yapı", "24", 12000, "TEDAVI_BEKLIYOR", -5);
  await createExamination(patients["Deniz Acar"].id, drMert.id, "Panoramik Film", null, 650, "TEDAVI_BEKLIYOR", 0);
  await createExamination(patients["Elif Demir"].id, drMert.id, "Kompozit Dolgu (İki Yüz)", "16", 2350, "TAMAMLANDI", -10);
  await createExamination(patients["Burak Şahin"].id, drElif.id, "Gece Plağı", null, 2800, "TEDAVI_BEKLIYOR", 2);
  await createExamination(patients["Selin Koç"].id, drMert.id, "Kompozit Dolgu (Tek Yüz)", "25", 1750, "TEDAVI_BEKLIYOR", 1);

  await createPayment(patients["Akif Balcı"].id, drElif.id, 10000, "KREDI_KARTI", pos["Akbank POS"], "İmplant tedavisi peşinatı", 1);
  await createPayment(patients["Zeynep Arslan"].id, drElif.id, 5000, "HAVALE_EFT", null, "Zirkonyum tedavisi ön ödeme", 2);
  await createPayment(patients["Ayşe Yılmaz"].id, drMert.id, 1800, "NAKIT", null, "Detertraj tahsilatı", 2);
  await createPayment(patients["Elif Demir"].id, drMert.id, 2350, "MAIL_ORDER", pos["Mail Order Sanal POS"], "Dolgu tedavisi mail order tahsilatı", 8);
  await createPayment(patients["Mehmet Kaya"].id, drMert.id, 1500, "KREDI_KARTI", pos["Garanti POS"], "Kanal tedavisi kapora", 0);

  const plan = await prisma.treatmentPlan.upsert({
    where: { id: `plan-${patients["Akif Balcı"].id}` },
    update: { status: "DEVAM_EDIYOR", totalCost: dec(28900), notes: "İmplant sonrası zirkonyum üst yapı planı" },
    create: {
      id: `plan-${patients["Akif Balcı"].id}`,
      patientId: patients["Akif Balcı"].id,
      doctorId: drElif.id,
      title: "İmplant ve zirkonyum üst yapı planı",
      status: "DEVAM_EDIYOR",
      totalCost: dec(28900),
      notes: "İmplant sonrası zirkonyum üst yapı planı",
    },
  });
  await prisma.treatmentStep.deleteMany({ where: { planId: plan.id } });
  await prisma.treatmentStep.createMany({
    data: [
      { planId: plan.id, order: 1, treatmentName: "İmplant cerrahisi", toothNo: "36", amount: dec(22400), status: "TAMAMLANDI", doneAt: at(-7, 13) },
      { planId: plan.id, order: 2, treatmentName: "Ölçü ve prova", toothNo: "36", amount: dec(0), status: "BEKLIYOR" },
      { planId: plan.id, order: 3, treatmentName: "Zirkonyum kaplama", toothNo: "36", amount: dec(6500), status: "BEKLIYOR" },
    ],
  });

  const taksitPlan = await prisma.taksitPlan.upsert({
    where: { id: `taksit-${patients["Zeynep Arslan"].id}` },
    update: { toplamBorc: dec(26000), pesnat: dec(5000), taksitSayisi: 4, status: "AKTIF" },
    create: {
      id: `taksit-${patients["Zeynep Arslan"].id}`,
      patientId: patients["Zeynep Arslan"].id,
      doctorId: drElif.id,
      baslik: "Zirkonyum tedavisi ödeme planı",
      toplamBorc: dec(26000),
      pesnat: dec(5000),
      taksitSayisi: 4,
      period: "AYLIK",
      startDate: at(15, 9),
      status: "AKTIF",
      notes: "Kalan ödeme dört taksit olarak planlandı.",
    },
  });
  await prisma.taksit.deleteMany({ where: { planId: taksitPlan.id } });
  for (let i = 1; i <= 4; i += 1) {
    const paid = i === 1;
    await prisma.taksit.create({
      data: {
        planId: taksitPlan.id,
        siraNo: i,
        vadeDate: at(i * 30, 9),
        tutar: dec(5250),
        odenen: paid ? dec(5250) : dec(0),
        kalan: paid ? dec(0) : dec(5250),
        status: paid ? "ODENDI" : "BEKLIYOR",
        note: paid ? "İlk taksit ödendi" : "Bekleyen taksit",
      },
    });
  }

  const follow = await prisma.patientFollowUp.upsert({
    where: { id: `follow-${patients["Ayşe Yılmaz"].id}` },
    update: {
      appointmentId: null,
      doctorId: drMert.id,
      type: "GERI_ARA",
      priority: 1,
      status: "ACIK",
      note: "Randevuya gelmedi. Yeni kontrol randevusu için aranacak.",
      nextActionAt: at(1, 10),
    },
    create: {
      id: `follow-${patients["Ayşe Yılmaz"].id}`,
      patientId: patients["Ayşe Yılmaz"].id,
      doctorId: drMert.id,
      createdById: manager.id,
      type: "GERI_ARA",
      priority: 1,
      status: "ACIK",
      note: "Randevuya gelmedi. Yeni kontrol randevusu için aranacak.",
      nextActionAt: at(1, 10),
    },
  });
  await prisma.patientFollowUpEvent.create({
    data: {
      followUpId: follow.id,
      patientId: patients["Ayşe Yılmaz"].id,
      createdById: manager.id,
      updatedById: manager.id,
      occurredAt: at(0, 16),
      channel: "Telefon",
      summary: "Hasta aranacaklar listesine alındı",
      detail: "Randevuya gelmediği için yeniden planlama yapılacak.",
      nextStep: "Yarın tekrar aranacak",
    },
  });

  await prisma.clinicTask.upsert({
    where: { id: "task-live-lab-prova-1" },
    update: { status: "ACIK", assignedToId: assistant.id, dueAt: at(1, 12) },
    create: {
      id: "task-live-lab-prova-1",
      institutionId,
      patientId: patients["Zeynep Arslan"].id,
      title: "Zeynep Arslan için prova randevusu planla",
      details: "Laboratuvardan gelen zirkonyum prova için hasta aranacak.",
      vendorName: "Marmara Dental Lab",
      type: "LAB",
      priority: 1,
      status: "ACIK",
      dueAt: at(1, 12),
      assignedToId: assistant.id,
      createdById: manager.id,
      assignees: { create: [{ userId: assistant.id }] },
    },
  }).catch(async () => {
    await prisma.clinicTask.update({ where: { id: "task-live-lab-prova-1" }, data: { status: "ACIK", assignedToId: assistant.id, dueAt: at(1, 12) } });
  });

  await prisma.prescription.upsert({
    where: { id: `rx-${patients["Mehmet Kaya"].id}` },
    update: { drugs: "Amoksisilin 1000 mg 2x1, İbuprofen 400 mg gerektiğinde", note: "Kanal tedavisi öncesi ağrı kontrolü" },
    create: {
      id: `rx-${patients["Mehmet Kaya"].id}`,
      patientId: patients["Mehmet Kaya"].id,
      doctorId: drMert.id,
      drugs: "Amoksisilin 1000 mg 2x1, İbuprofen 400 mg gerektiğinde",
      note: "Kanal tedavisi öncesi ağrı kontrolü",
    },
  });

  await prisma.patientConsent.upsert({
    where: { id: `consent-${patients["Akif Balcı"].id}` },
    update: { status: "AKTIF", signedAt: at(-7, 9) },
    create: {
      id: `consent-${patients["Akif Balcı"].id}`,
      institutionId,
      patientId: patients["Akif Balcı"].id,
      title: "Kapsamlı Klinik Onam ve KVKK Paketi",
      category: "TEDAVI_ONAM",
      body: "Hasta, planlanan implant ve protetik tedavi süreci hakkında bilgilendirildiğini; tedavi risklerini, alternatifleri ve ödeme süreçlerini anladığını beyan eder.",
      signerName: "Akif Balcı",
      signerIdentityNo: "98100000001",
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8AARQAFAAH/AX6gAAAAAElFTkSuQmCC",
      status: "AKTIF",
      signedAt: at(-7, 9),
      createdById: manager.id,
    },
  });
}

async function createFirmaIslem(firmaId: string, key: string, data: Omit<Prisma.FirmaIslemUncheckedCreateInput, "id" | "firmaId">) {
  const id = `fi-${key}`;
  return prisma.firmaIslem.upsert({
    where: { id },
    update: { ...data, firmaId },
    create: { id, firmaId, ...data },
  });
}

async function upsertStockAndPurchases(
  institutionId: string,
  managerId: string,
  firms: Record<string, Awaited<ReturnType<typeof prisma.firma.upsert>>>,
  expenseCategories: Record<string, string>,
) {
  const stockRows = [
    { name: "Nitril Eldiven Mavi M", category: "Sarf", unit: "kutu", quantity: 42, minQuantity: 12, unitPrice: 185, supplier: "Medikal Sarf Deposu", barcode: "8690001000011", storageLocation: "Depo A-01" },
    { name: "Artikain Anestezi Ampul", category: "Medikal", unit: "adet", quantity: 18, minQuantity: 20, unitPrice: 42, supplier: "Aydın Dental Tedarik", barcode: "8690001000012", storageLocation: "Soğuk Dolap" },
    { name: "Kompozit Refil A2", category: "Sarf", unit: "adet", quantity: 34, minQuantity: 8, unitPrice: 320, supplier: "Aydın Dental Tedarik", barcode: "8690001000013", storageLocation: "Dolap B-02" },
    { name: "İmplant Cerrahi Set", category: "Cerrahi", unit: "set", quantity: 6, minQuantity: 3, unitPrice: 1450, supplier: "Aydın Dental Tedarik", barcode: "8690001000014", storageLocation: "Steril Alan" },
    { name: "Ölçü Silikonu Putty", category: "Sarf", unit: "takım", quantity: 11, minQuantity: 5, unitPrice: 680, supplier: "Medikal Sarf Deposu", barcode: "8690001000015", storageLocation: "Depo A-03" },
  ];
  const stocks: Record<string, Awaited<ReturnType<typeof prisma.stockItem.upsert>>> = {};
  for (const s of stockRows) {
    const item = await prisma.stockItem.upsert({
      where: { institutionId_name: { institutionId, name: s.name } },
      update: {
        category: s.category,
        unit: s.unit,
        quantity: s.quantity,
        minQuantity: s.minQuantity,
        unitPrice: dec(s.unitPrice),
        supplier: s.supplier,
        barcode: s.barcode,
        storageLocation: s.storageLocation,
        isActive: true,
      },
      create: { institutionId, ...s, unitPrice: dec(s.unitPrice), isActive: true },
    });
    stocks[s.name] = item;
  }

  const purchase1 = await createFirmaIslem(firms["Medikal Sarf Deposu"].id, "medikal-sarf-alim-1", {
    tarih: at(-5, 10),
    islemTipi: "ALIM",
    urunHizmet: "Sarf malzeme alımı",
    aciklama: "Nitril eldiven ve ölçü silikonu alımı",
    tutar: dec(7800),
    faturaNo: "MSD-2026-001",
    kdvOrani: 20,
    status: "AKTIF",
  });
  const p1 = await prisma.purchase.upsert({
    where: { firmaIslemId: purchase1.id },
    update: { tarih: at(-5, 10), faturaNo: "MSD-2026-001", aciklama: "Nitril eldiven ve ölçü silikonu alımı", kdvOrani: 20, status: "AKTIF" },
    create: { institutionId, firmaId: firms["Medikal Sarf Deposu"].id, firmaIslemId: purchase1.id, tarih: at(-5, 10), faturaNo: "MSD-2026-001", aciklama: "Nitril eldiven ve ölçü silikonu alımı", kdvOrani: 20, createdById: managerId },
  });
  await prisma.purchaseItem.deleteMany({ where: { purchaseId: p1.id } });
  for (const row of [
    { stock: stocks["Nitril Eldiven Mavi M"], productName: "Nitril Eldiven Mavi M", quantity: 20, unit: "kutu", unitPrice: 190 },
    { stock: stocks["Ölçü Silikonu Putty"], productName: "Ölçü Silikonu Putty", quantity: 6, unit: "takım", unitPrice: 650 },
  ]) {
    const movement = await prisma.stockMovement.create({
      data: { stockItemId: row.stock.id, type: "GIRIS", quantity: row.quantity, unitPrice: dec(row.unitPrice), supplier: "Medikal Sarf Deposu", note: `Satın alma faturası ${purchase1.faturaNo}`, userId: managerId },
    });
    await prisma.purchaseItem.create({
      data: { purchaseId: p1.id, stockItemId: row.stock.id, productName: row.productName, quantity: row.quantity, unit: row.unit, unitPrice: dec(row.unitPrice), lineTotal: dec(row.quantity * row.unitPrice), stockMovementId: movement.id },
    });
  }

  await createFirmaIslem(firms["Medikal Sarf Deposu"].id, "medikal-sarf-odeme-1", {
    tarih: at(-4, 12),
    islemTipi: "ODEME",
    urunHizmet: "Firma ödemesi",
    aciklama: "MSD-2026-001 faturası kısmi ödemesi",
    tutar: dec(3000),
    faturaNo: "MSD-2026-001",
    yontem: "HAVALE_EFT",
    kdvOrani: 0,
    status: "AKTIF",
  });

  await prisma.expense.upsert({
    where: { id: "expense-medikal-sarf-odeme-1" },
    update: { tutar: dec(3000), status: "AKTIF" },
    create: {
      id: "expense-medikal-sarf-odeme-1",
      institutionId,
      tarih: at(-4, 12),
      categoryId: expenseCategories["Sarf ve Malzeme"],
      category: "Sarf ve Malzeme",
      description: "Medikal Sarf Deposu kısmi firma ödemesi",
      tutar: dec(3000),
      yontem: "HAVALE_EFT",
      faturaNo: "MSD-2026-001",
      kdvOrani: 0,
      status: "AKTIF",
    },
  });

  const purchase2 = await createFirmaIslem(firms["Aydın Dental Tedarik"].id, "aydin-dental-alim-1", {
    tarih: at(-2, 11),
    islemTipi: "ALIM",
    urunHizmet: "Anestezi ve kompozit alımı",
    aciklama: "Artikain anestezi ve kompozit refil alımı",
    tutar: dec(10940),
    faturaNo: "ADT-2026-014",
    kdvOrani: 20,
    status: "AKTIF",
  });
  const p2 = await prisma.purchase.upsert({
    where: { firmaIslemId: purchase2.id },
    update: { tarih: at(-2, 11), faturaNo: "ADT-2026-014", aciklama: "Artikain anestezi ve kompozit refil alımı", kdvOrani: 20, status: "AKTIF" },
    create: { institutionId, firmaId: firms["Aydın Dental Tedarik"].id, firmaIslemId: purchase2.id, tarih: at(-2, 11), faturaNo: "ADT-2026-014", aciklama: "Artikain anestezi ve kompozit refil alımı", kdvOrani: 20, createdById: managerId },
  });
  await prisma.purchaseItem.deleteMany({ where: { purchaseId: p2.id } });
  for (const row of [
    { stock: stocks["Artikain Anestezi Ampul"], productName: "Artikain Anestezi Ampul", quantity: 40, unit: "adet", unitPrice: 38 },
    { stock: stocks["Kompozit Refil A2"], productName: "Kompozit Refil A2", quantity: 12, unit: "adet", unitPrice: 305 },
    { stock: stocks["İmplant Cerrahi Set"], productName: "İmplant Cerrahi Set", quantity: 4, unit: "set", unitPrice: 1440 },
  ]) {
    const movement = await prisma.stockMovement.create({
      data: { stockItemId: row.stock.id, type: "GIRIS", quantity: row.quantity, unitPrice: dec(row.unitPrice), supplier: "Aydın Dental Tedarik", note: `Satın alma faturası ${purchase2.faturaNo}`, userId: managerId },
    });
    await prisma.purchaseItem.create({
      data: { purchaseId: p2.id, stockItemId: row.stock.id, productName: row.productName, quantity: row.quantity, unit: row.unit, unitPrice: dec(row.unitPrice), lineTotal: dec(row.quantity * row.unitPrice), stockMovementId: movement.id },
    });
  }

  await prisma.stockMovement.create({
    data: { stockItemId: stocks["Nitril Eldiven Mavi M"].id, type: "CIKIS", quantity: 3, note: "Cerrahi işlem tüketimi", userId: managerId },
  });
  await prisma.stockMovement.create({
    data: { stockItemId: stocks["Artikain Anestezi Ampul"].id, type: "CIKIS", quantity: 5, note: "Kanal ve implant randevuları", userId: managerId },
  });
}

async function upsertLabFlows(
  institutionId: string,
  users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>>,
  patients: Record<string, Awaited<ReturnType<typeof prisma.patient.upsert>>>,
  firms: Record<string, Awaited<ReturnType<typeof prisma.firma.upsert>>>,
  expenseCategories: Record<string, string>,
) {
  const manager = users.manager;
  const drElif = users["10000000011"];
  const drMert = users["10000000012"];

  const orders = [
    { id: "lab-zeynep-zirkonyum", patient: "Zeynep Arslan", doctor: drElif, firma: "Marmara Dental Lab", labType: "Zirkonyum", teeth: "11,12,21,22", price: 7200, invoiceNo: "MDL-2026-101", trips: [["Ölçü", -4, -3], ["Dentin prova", -2, -1], ["Glazeli bitim", 0, null]] },
    { id: "lab-can-implant", patient: "Can Erdem", doctor: drElif, firma: "Ege Dijital Lab", labType: "İmplant Üst Yapı", teeth: "24", price: 4800, invoiceNo: "EDL-2026-077", trips: [["Ölçü", -3, -2], ["Altyapı prova", -1, null]] },
    { id: "lab-fatma-gece-plagi", patient: "Fatma Çelik", doctor: drMert, firma: "Çukurova Protez Lab", labType: "Gece Plağı", teeth: "", price: 1350, invoiceNo: "CPL-2026-044", trips: [["Ölçü", -2, -1], ["Teslim", 0, null]] },
  ] as const;

  for (const o of orders) {
    const firma = firms[o.firma];
    const order = await prisma.labOrder.upsert({
      where: { id: o.id },
      update: { labName: firma.name, firmaId: firma.id, labType: o.labType, teeth: o.teeth || null, price: dec(o.price), invoiceNo: o.invoiceNo, status: "DEVAM_EDIYOR", notes: `${o.labType} iş akışı` },
      create: {
        id: o.id,
        patientId: patients[o.patient].id,
        doctorId: o.doctor.id,
        labName: firma.name,
        firmaId: firma.id,
        labType: o.labType,
        teeth: o.teeth || undefined,
        price: dec(o.price),
        invoiceNo: o.invoiceNo,
        status: "DEVAM_EDIYOR",
        notes: `${o.labType} iş akışı`,
      },
    });
    await prisma.labTrip.deleteMany({ where: { labOrderId: order.id } });
    let idx = 1;
    for (const [description, sentOffset, receivedOffset] of o.trips) {
      await prisma.labTrip.create({
        data: {
          labOrderId: order.id,
          order: idx,
          description,
          sentAt: at(sentOffset, 10),
          expectedAt: at(sentOffset + 2, 17),
          receivedAt: receivedOffset === null ? null : at(receivedOffset, 16),
          sentNote: `${description} laboratuvara gönderildi`,
          receivedNote: receivedOffset === null ? null : `${description} klinikte teslim alındı`,
        },
      });
      idx += 1;
    }

    await prisma.labOrderInvoice.upsert({
      where: { labOrderId_invoiceNo: { labOrderId: order.id, invoiceNo: o.invoiceNo } },
      update: { item: `${o.labType} laboratuvar hizmet bedeli`, amount: dec(o.price), issuedAt: at(0, 12), note: "Laboratuvar faturası" },
      create: { labOrderId: order.id, item: `${o.labType} laboratuvar hizmet bedeli`, amount: dec(o.price), invoiceNo: o.invoiceNo, issuedAt: at(0, 12), note: "Laboratuvar faturası" },
    });

    await createFirmaIslem(firma.id, `lab-${o.id}-hizmet`, {
      tarih: at(0, 12),
      islemTipi: "HIZMET",
      urunHizmet: `${o.labType} laboratuvar işi`,
      aciklama: `${patients[o.patient].fullName} için ${o.labType} hizmet bedeli`,
      tutar: dec(o.price),
      faturaNo: o.invoiceNo,
      kdvOrani: 20,
      status: "AKTIF",
    });

    if (o.id === "lab-zeynep-zirkonyum") {
      const follow = await prisma.patientFollowUp.upsert({
        where: { id: `follow-${order.id}` },
        update: { status: "ACIK", labOrderId: order.id, note: "Dentin prova geldi. Hasta prova randevusu için aranacak.", nextActionAt: at(0, 14) },
        create: {
          id: `follow-${order.id}`,
          patientId: patients[o.patient].id,
          doctorId: o.doctor.id,
          createdById: manager.id,
          type: "DIGER",
          priority: 1,
          status: "ACIK",
          note: "Dentin prova geldi. Hasta prova randevusu için aranacak.",
          nextActionAt: at(0, 14),
          labOrderId: order.id,
        },
      });
      await prisma.patientFollowUpEvent.create({
        data: {
          followUpId: follow.id,
          patientId: patients[o.patient].id,
          createdById: manager.id,
          updatedById: manager.id,
          occurredAt: at(0, 12),
          channel: "Laboratuvar",
          summary: "Dentin prova klinikte",
          detail: "Laboratuvardan gelen iş için hasta randevusu planlanmalı.",
          nextStep: "Hasta aranıp prova randevusu verilecek",
        },
      });
    }
  }

  await createFirmaIslem(firms["Marmara Dental Lab"].id, "marmara-lab-odeme-1", {
    tarih: at(0, 15),
    islemTipi: "ODEME",
    urunHizmet: "Laboratuvar ödemesi",
    aciklama: "MDL-2026-101 faturası kısmi ödemesi",
    tutar: dec(3000),
    faturaNo: "MDL-2026-101",
    yontem: "HAVALE_EFT",
    kdvOrani: 0,
    status: "AKTIF",
  });
  await prisma.expense.upsert({
    where: { id: "expense-marmara-lab-odeme-1" },
    update: { tutar: dec(3000), status: "AKTIF" },
    create: {
      id: "expense-marmara-lab-odeme-1",
      institutionId,
      tarih: at(0, 15),
      categoryId: expenseCategories["Laboratuvar Ödemesi"],
      category: "Laboratuvar Ödemesi",
      description: "Marmara Dental Lab kısmi ödeme",
      tutar: dec(3000),
      yontem: "HAVALE_EFT",
      faturaNo: "MDL-2026-101",
      kdvOrani: 0,
      status: "AKTIF",
    },
  });
}

async function upsertAccountingExtras(institutionId: string, users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>>, expenseCategories: Record<string, string>) {
  const drElif = users["10000000011"];
  await prisma.expense.upsert({
    where: { id: "expense-kira-temmuz-2026" },
    update: { tutar: dec(18500), status: "AKTIF" },
    create: {
      id: "expense-kira-temmuz-2026",
      institutionId,
      tarih: at(-6, 10),
      categoryId: expenseCategories["Kira"],
      category: "Kira",
      description: "Temmuz ayı klinik kirası",
      tutar: dec(18500),
      yontem: "HAVALE_EFT",
      faturaNo: "KIRA-2026-07",
      status: "AKTIF",
    },
  });
  await prisma.expense.upsert({
    where: { id: "expense-hakedis-elif-2026-07" },
    update: { tutar: dec(7500), doctorId: drElif.id, periodYear: 2026, periodMonth: 7, status: "AKTIF" },
    create: {
      id: "expense-hakedis-elif-2026-07",
      institutionId,
      tarih: at(0, 17),
      categoryId: expenseCategories["Doktor Hakedişi"],
      category: "Doktor Hakedişi",
      description: "Dr. Elif Karaca Temmuz ara hakediş ödemesi",
      tutar: dec(7500),
      yontem: "HAVALE_EFT",
      doctorId: drElif.id,
      periodYear: 2026,
      periodMonth: 7,
      status: "AKTIF",
    },
  });
}

async function upsertOtherModules(institutionId: string, users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>>, patients: Record<string, Awaited<ReturnType<typeof prisma.patient.upsert>>>) {
  const manager = users.manager;
  const drElif = users["10000000011"];

  await prisma.waitlist.upsert({
    where: { id: "waitlist-nazli-gunes-kontrol" },
    update: { status: "BEKLIYOR", preferredFrom: at(2, 9), preferredTo: at(10, 18), note: "Erken kontrol boşluğu olursa aranacak." },
    create: {
      id: "waitlist-nazli-gunes-kontrol",
      institutionId,
      patientId: patients["Nazlı Güneş"].id,
      doctorId: drElif.id,
      createdById: manager.id,
      preferredFrom: at(2, 9),
      preferredTo: at(10, 18),
      note: "Erken kontrol boşluğu olursa aranacak.",
      status: "BEKLIYOR",
    },
  });

  await prisma.bookingRequest.upsert({
    where: { id: "booking-onur-kaplan-web" },
    update: { status: "BEKLIYOR", preferredFrom: at(3, 10), note: "Web üzerinden implant muayenesi talebi" },
    create: {
      id: "booking-onur-kaplan-web",
      institutionId,
      doctorId: drElif.id,
      fullName: "Onur Kaplan",
      phone: "05551000117",
      tcNo: "98100000017",
      preferredFrom: at(3, 10),
      preferredTo: at(7, 18),
      note: "Web üzerinden implant muayenesi talebi",
      status: "BEKLIYOR",
    },
  });

  await prisma.reminder.upsert({
    where: { id: "reminder-zeynep-taksit" },
    update: { reminderDate: at(25, 10), status: "AKTIF", note: "Zeynep Arslan taksit ödeme hatırlatması" },
    create: {
      id: "reminder-zeynep-taksit",
      patientId: patients["Zeynep Arslan"].id,
      reminderDate: at(25, 10),
      status: "AKTIF",
      note: "Zeynep Arslan taksit ödeme hatırlatması",
    },
  });

  await prisma.message.create({
    data: { userId: users["10000000013"].id, text: "Bugün laboratuvardan gelen prova işleri için hasta takip listesini kontrol edin." },
  });
  await prisma.announcement.create({
    data: {
      institutionId,
      text: "Bugünün önceliği: bekleyen prova randevuları, tahsilat takibi ve kritik stok kontrolü.",
      isActive: true,
      endsAt: at(14, 18),
      createdById: manager.id,
    },
  });
}

async function main() {
  const institution = await prisma.institution.findFirst({
    where: { name: { contains: "whitedental", mode: "insensitive" } },
  });
  if (!institution) throw new Error("whitedental kurumu bulunamadı.");

  await cleanupOldVisibleDemoPrefixes(institution.id);
  await upsertSettings(institution.id, institution.name);
  const users = await upsertStaff(institution.id);
  const patients = await upsertPatients(institution.id);
  const categories = await upsertReferenceData(institution.id);
  const pos = await upsertPos(institution.id);
  const firms = await upsertFirms(institution.id);

  await upsertClinicalFlow(institution.id, users, patients, pos);
  await upsertStockAndPurchases(institution.id, users.manager.id, firms, categories);
  await upsertLabFlows(institution.id, users, patients, firms, categories);
  await upsertAccountingExtras(institution.id, users, categories);
  await upsertOtherModules(institution.id, users, patients);

  await prisma.auditLog.create({
    data: {
      userId: users.manager.id,
      action: "LIVE_DEMO_DATA_LOAD",
      detail: "Canlı test için gerçekçi demo veri paketi yüklendi: hasta, randevu, tedavi, ödeme, lab, stok, firma, takip ve muhasebe akışları.",
    },
  });

  const counts = {
    patients: await prisma.patient.count({ where: { institutionId: institution.id } }),
    appointments: await prisma.appointment.count({ where: { patient: { institutionId: institution.id } } }),
    examinations: await prisma.examination.count({ where: { patient: { institutionId: institution.id } } }),
    payments: await prisma.payment.count({ where: { patient: { institutionId: institution.id } } }),
    labOrders: await prisma.labOrder.count({ where: { patient: { institutionId: institution.id } } }),
    stockItems: await prisma.stockItem.count({ where: { institutionId: institution.id } }),
    firms: await prisma.firma.count({ where: { institutionId: institution.id } }),
    expenses: await prisma.expense.count({ where: { institutionId: institution.id } }),
    followUps: await prisma.patientFollowUp.count({ where: { patient: { institutionId: institution.id } } }),
  };

  console.log(JSON.stringify({ ok: true, institution: institution.name, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
