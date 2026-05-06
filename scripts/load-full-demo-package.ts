import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MARKER = "[DEMO_PAKET_20260506]";
const DEMO_PASSWORD = "10711453";

async function cleanupVisibleMarkerText() {
  const targets: Array<{ table: string; column: string }> = [
    { table: "Institution", column: "address" },
    { table: "Setting", column: "institutionAddress" },
    { table: "User", column: "fullName" },
    { table: "Patient", column: "fullName" },
    { table: "Patient", column: "notes" },
    { table: "Appointment", column: "note" },
    { table: "PatientFollowUp", column: "note" },
    { table: "PatientFollowUpEvent", column: "summary" },
    { table: "PatientFollowUpEvent", column: "detail" },
    { table: "PatientFollowUpEvent", column: "patientResponse" },
    { table: "PatientFollowUpEvent", column: "nextStep" },
    { table: "Examination", column: "note" },
    { table: "Payment", column: "description" },
    { table: "TreatmentPlan", column: "title" },
    { table: "TreatmentPlan", column: "notes" },
    { table: "TreatmentStep", column: "treatmentName" },
    { table: "TreatmentStep", column: "note" },
    { table: "LabOrder", column: "notes" },
    { table: "LabTrip", column: "description" },
    { table: "LabTrip", column: "sentNote" },
    { table: "LabTrip", column: "receivedNote" },
    { table: "StockItem", column: "name" },
    { table: "StockItem", column: "supplier" },
    { table: "StockMovement", column: "note" },
    { table: "TaksitPlan", column: "baslik" },
    { table: "TaksitPlan", column: "notes" },
    { table: "Taksit", column: "note" },
    { table: "TaksitOdeme", column: "note" },
    { table: "Reminder", column: "note" },
    { table: "Expense", column: "description" },
    { table: "Firma", column: "name" },
    { table: "Firma", column: "notes" },
    { table: "FirmaIslem", column: "urunHizmet" },
    { table: "FirmaIslem", column: "aciklama" },
    { table: "SupportTicket", column: "subject" },
    { table: "SupportTicket", column: "message" },
    { table: "SupportTicket", column: "answer" },
    { table: "Message", column: "text" },
    { table: "Announcement", column: "text" },
    { table: "Advertisement", column: "title" },
    { table: "Advertisement", column: "content" },
    { table: "Advertisement", column: "sponsorName" },
    { table: "SmsPackage", column: "name" },
    { table: "SmsPackage", column: "description" },
    { table: "Invoice", column: "description" },
    { table: "InvoiceReminder", column: "message" },
    { table: "MockSmsLog", column: "message" },
    { table: "MockSmsLog", column: "responseData" },
    { table: "PriceItem", column: "treatment" },
    { table: "AuditLog", column: "detail" },
  ];

  for (const target of targets) {
    await prisma.$executeRawUnsafe(
      `UPDATE "${target.table}" SET "${target.column}" = NULLIF(BTRIM(REGEXP_REPLACE(REPLACE("${target.column}", $1, ''), '\\s{2,}', ' ', 'g')), '') WHERE "${target.column}" IS NOT NULL AND "${target.column}" LIKE '%' || $1 || '%'`,
      MARKER,
    );
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const existingInstitution = await prisma.institution.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const institution = existingInstitution
    ? existingInstitution
    : await prisma.institution.create({
        data: {
          name: "demo-klinik",
          email: "demo@klinik.local",
          phone: "05550000000",
          address: `${MARKER} Demo klinik adresi`,
          isActive: true,
        },
      });

  await prisma.setting.upsert({
    where: { institutionId: institution.id },
    update: {
      institutionName: institution.name,
      institutionAddress: institution.address || `${MARKER} Demo adres`,
      institutionPhone: institution.phone || "05550000000",
      institutionWebsite: "https://demo.klinik.local",
      smsEnabled: true,
      activePriceList: "standard",
    },
    create: {
      institutionId: institution.id,
      institutionName: institution.name,
      institutionAddress: institution.address || `${MARKER} Demo adres`,
      institutionPhone: institution.phone || "05550000000",
      institutionWebsite: "https://demo.klinik.local",
      smsEnabled: true,
      activePriceList: "standard",
    },
  });

  const demoUsers = [
    { identityNo: "90000000001", fullName: `Demo Yonetici ${MARKER}`, role: Role.YONETICI, email: "demo-yonetici@klinik.local" },
    { identityNo: "90000000002", fullName: `Demo Doktor ${MARKER}`, role: Role.DOKTOR, email: "demo-doktor@klinik.local" },
    { identityNo: "90000000003", fullName: `Demo Asistan ${MARKER}`, role: Role.ASISTAN, email: "demo-asistan@klinik.local" },
    { identityNo: "90000000004", fullName: `Demo Banko ${MARKER}`, role: Role.BANKO, email: "demo-banko@klinik.local" },
    { identityNo: "90000000005", fullName: `Demo Muhasebe ${MARKER}`, role: Role.MUHASEBE, email: "demo-muhasebe@klinik.local" },
  ] as const;

  const createdUsers: Record<string, { id: string; fullName: string; role: Role }> = {};

  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { identityNo: u.identityNo },
      update: {
        fullName: u.fullName,
        role: u.role,
        passwordHash,
        isActive: true,
        institutionId: institution.id,
        email: u.email,
      },
      create: {
        identityNo: u.identityNo,
        fullName: u.fullName,
        role: u.role,
        passwordHash,
        isActive: true,
        institutionId: institution.id,
        email: u.email,
      },
      select: { id: true, fullName: true, role: true },
    });

    createdUsers[u.role] = user;

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { workStart: "09:00", workEnd: "18:00", hideAsDoctor: false },
      create: { userId: user.id, workStart: "09:00", workEnd: "18:00", hideAsDoctor: false },
    });
  }

  await prisma.superadminPermission.upsert({
    where: { userId: createdUsers[Role.YONETICI].id },
    update: {
      modules: [
        "dashboard",
        "institutions",
        "users",
        "roles",
        "invoices",
        "sms",
        "ads",
        "smtp",
        "reports",
        "support",
        "audit",
        "announcements",
        "settings",
      ],
    },
    create: {
      userId: createdUsers[Role.YONETICI].id,
      modules: [
        "dashboard",
        "institutions",
        "users",
        "roles",
        "invoices",
        "sms",
        "ads",
        "smtp",
        "reports",
        "support",
        "audit",
        "announcements",
        "settings",
      ],
    },
  });

  const demoPatients = [
    { tcNo: "98000000001", fullName: `Demo Ayse Yilmaz ${MARKER}`, phone: "05550000101", gender: "K" },
    { tcNo: "98000000002", fullName: `Demo Mehmet Kaya ${MARKER}`, phone: "05550000102", gender: "E" },
    { tcNo: "98000000003", fullName: `Demo Elif Demir ${MARKER}`, phone: "05550000103", gender: "K" },
    { tcNo: "98000000004", fullName: `Demo Kerem Aydin ${MARKER}`, phone: "05550000104", gender: "E" },
  ] as const;

  const createdPatients: Array<{ id: string; fullName: string; phone: string }> = [];

  for (const p of demoPatients) {
    const patient = await prisma.patient.upsert({
      where: { tcNo: p.tcNo },
      update: {
        fullName: p.fullName,
        phone: p.phone,
        gender: p.gender,
        notes: `${MARKER} Hasta notu`,
        insurance: "SGK",
        referrer: "Sosyal Medya",
      },
      create: {
        tcNo: p.tcNo,
        fullName: p.fullName,
        phone: p.phone,
        gender: p.gender,
        notes: `${MARKER} Hasta notu`,
        insurance: "SGK",
        referrer: "Sosyal Medya",
      },
      select: { id: true, fullName: true, phone: true },
    });
    createdPatients.push(patient);
  }

  const doctorId = createdUsers[Role.DOKTOR].id;
  const managerId = createdUsers[Role.YONETICI].id;

  const base = new Date();
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const appointmentA = await upsertAppointmentByMarker({
    patientId: createdPatients[0].id,
    doctorId,
    marker: `${MARKER}-APPT-1`,
    startAt: tomorrow,
    endAt: new Date(tomorrow.getTime() + 30 * 60_000),
    status: "BEKLIYOR",
    type: "KONTROL",
  });

  const appointmentB = await upsertAppointmentByMarker({
    patientId: createdPatients[1].id,
    doctorId,
    marker: `${MARKER}-APPT-2`,
    startAt: new Date(tomorrow.getTime() + 2 * 60 * 60_000),
    endAt: new Date(tomorrow.getTime() + 2.5 * 60 * 60_000),
    status: "GELMEDI",
    type: "STANDART",
  });

  const followUp = await upsertFollowUpByMarker({
    patientId: createdPatients[1].id,
    appointmentId: appointmentB.id,
    doctorId,
    createdById: managerId,
    marker: `${MARKER}-FOLLOW-1`,
  });

  await upsertFollowUpEventByMarker({
    followUpId: followUp.id,
    patientId: createdPatients[1].id,
    createdById: managerId,
    marker: `${MARKER}-EVENT-1`,
    summary: "Arandi, acmadi",
    channel: "Telefon",
    patientResponse: "Ulasilamadi",
    nextStep: "Yarin tekrar aranacak",
  });

  await upsertFollowUpEventByMarker({
    followUpId: followUp.id,
    patientId: createdPatients[1].id,
    createdById: managerId,
    marker: `${MARKER}-EVENT-2`,
    summary: "Bilgi aldi, dusunecek",
    channel: "WhatsApp",
    patientResponse: "Aile ile gorusup donecegim",
    nextStep: "3 gun sonra geri arama",
  });

  await upsertExaminationByMarker({
    patientId: createdPatients[0].id,
    doctorId,
    marker: `${MARKER}-EXAM-1`,
  });

  const pos = await prisma.posDevice.upsert({
    where: { name: `Demo POS ${MARKER}` },
    update: { isActive: true },
    create: { name: `Demo POS ${MARKER}`, isActive: true },
  });

  await upsertPaymentByMarker({
    patientId: createdPatients[0].id,
    posId: pos.id,
    marker: `${MARKER}-PAY-1`,
  });

  const plan = await upsertTreatmentPlanByMarker({
    patientId: createdPatients[0].id,
    doctorId,
    marker: `${MARKER}-TPLAN-1`,
  });

  await upsertTreatmentSteps(plan.id, `${MARKER}-TSTEP`);

  const labOrder = await upsertLabOrderByMarker({
    patientId: createdPatients[2].id,
    doctorId,
    marker: `${MARKER}-LAB-1`,
  });

  await upsertLabTrips(labOrder.id, `${MARKER}-TRIP`);

  const stock = await upsertStockItemByMarker(`${MARKER}-STOCK-1`, managerId);

  await upsertStockMovement(stock.id, managerId, `${MARKER}-MOVE-1`);

  const taksitPlan = await upsertTaksitPlanByMarker({
    patientId: createdPatients[3].id,
    doctorId,
    marker: `${MARKER}-TAKSIT-1`,
  });

  await upsertTaksitRows(taksitPlan.id, `${MARKER}-TAKSITROW`, pos.id);

  await upsertReminderByMarker(createdPatients[3].id, taksitPlan.id, `${MARKER}-REM-1`);

  const expenseCategory = await prisma.expenseCategory.upsert({
    where: { name: `Demo Gider Kategorisi ${MARKER}` },
    update: { isActive: true },
    create: { name: `Demo Gider Kategorisi ${MARKER}`, isActive: true },
    select: { id: true },
  });

  await upsertExpenseByMarker(expenseCategory.id, `${MARKER}-EXP-1`);

  const firma = await prisma.firma.upsert({
    where: { name: `Demo Tedarikci ${MARKER}` },
    update: { isActive: true, phone: "02120000000" },
    create: {
      name: `Demo Tedarikci ${MARKER}`,
      phone: "02120000000",
      notes: `${MARKER} Demo firma`,
      isActive: true,
    },
    select: { id: true },
  });

  await upsertFirmaIslemByMarker(firma.id, `${MARKER}-FIRMA-1`);

  await upsertSupportTicketByMarker(managerId, `${MARKER}-SUP-1`);
  await upsertMessageByMarker(createdUsers[Role.ASISTAN].id, `${MARKER}-MSG-1`);
  await upsertAnnouncementByMarker(`${MARKER}-ANN-1`);

  const ad = await upsertAdvertisementByMarker(`${MARKER}-AD-1`);

  await prisma.institutionAdAssignment.upsert({
    where: {
      institutionId_advertisementId: {
        institutionId: institution.id,
        advertisementId: ad.id,
      },
    },
    update: { isActive: true, weight: 100 },
    create: {
      institutionId: institution.id,
      advertisementId: ad.id,
      isActive: true,
      weight: 100,
    },
  });

  const smsPackage = await prisma.smsPackage.upsert({
    where: { smsCount: 7777 },
    update: {
      name: `Demo SMS Paketi ${MARKER}`,
      price: new Prisma.Decimal(1499),
      isActive: true,
    },
    create: {
      name: `Demo SMS Paketi ${MARKER}`,
      smsCount: 7777,
      price: new Prisma.Decimal(1499),
      description: `${MARKER} Test paketi`,
      isActive: true,
    },
  });

  await upsertSmsTransactionByMarker(institution.id, smsPackage.id, `${MARKER}-SMSTRX-1`);

  const invoiceNo = `DEMO-${new Date().toISOString().slice(0, 10)}-001`;
  const invoice = await prisma.invoice.upsert({
    where: { invoiceNo },
    update: {
      institutionId: institution.id,
      amount: new Prisma.Decimal(3499),
      description: `${MARKER} Demo fatura`,
      status: "PENDING",
    },
    create: {
      institutionId: institution.id,
      invoiceNo,
      amount: new Prisma.Decimal(3499),
      description: `${MARKER} Demo fatura`,
      status: "PENDING",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  });

  await upsertInvoiceReminderByMarker(invoice.id, `${MARKER}-INVR-1`);

  await prisma.mockSmsLog.create({
    data: {
      phone: createdPatients[0].phone,
      message: `${MARKER} Randevu hatirlatma demo mesaji`,
      sender: "KlinikModern",
      status: "SENT",
      responseData: `${MARKER}-MOCK-SMS`,
    },
  });

  await prisma.priceItem.upsert({
    where: {
      code_treatment: {
        code: "D-001",
        treatment: `Demo Tedavi ${MARKER}`,
      },
    },
    update: {
      amount: new Prisma.Decimal(1250),
      isFavorite: true,
      isCustom: true,
    },
    create: {
      code: "D-001",
      treatment: `Demo Tedavi ${MARKER}`,
      amount: new Prisma.Decimal(1250),
      isFavorite: true,
      isCustom: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: managerId,
      action: "DEMO_PACKAGE_LOAD",
      detail: `${MARKER} Tum moduller icin demo veri yuklendi`,
    },
  });

  await cleanupVisibleMarkerText();

  console.log("Demo paket yukleme tamamlandi.");
  console.log(`Marker: ${MARKER}`);
  console.log(`Kurum: ${institution.name}`);
  console.log("Demo kullanici sifresi: 10711453");
}

async function upsertAppointmentByMarker(args: {
  patientId: string;
  doctorId: string;
  marker: string;
  startAt: Date;
  endAt: Date;
  status: string;
  type: "STANDART" | "KONTROL" | "ACIL";
}) {
  const existing = await prisma.appointment.findFirst({
    where: { patientId: args.patientId, doctorId: args.doctorId, note: { contains: args.marker } },
  });

  if (existing) {
    return prisma.appointment.update({
      where: { id: existing.id },
      data: {
        startAt: args.startAt,
        endAt: args.endAt,
        status: args.status,
        type: args.type,
        note: `${args.marker} Demo randevu notu`,
      },
    });
  }

  return prisma.appointment.create({
    data: {
      patientId: args.patientId,
      doctorId: args.doctorId,
      startAt: args.startAt,
      endAt: args.endAt,
      status: args.status,
      type: args.type,
      note: `${args.marker} Demo randevu notu`,
    },
  });
}

async function upsertFollowUpByMarker(args: {
  patientId: string;
  appointmentId: string;
  doctorId: string;
  createdById: string;
  marker: string;
}) {
  const existing = await prisma.patientFollowUp.findFirst({
    where: { patientId: args.patientId, note: { contains: args.marker } },
  });

  if (existing) {
    return prisma.patientFollowUp.update({
      where: { id: existing.id },
      data: {
        appointmentId: args.appointmentId,
        doctorId: args.doctorId,
        type: "GERI_ARA",
        priority: 2,
        status: "ACIK",
        note: `${args.marker} Gelmedi, tekrar aranacak`,
        nextActionAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
  }

  return prisma.patientFollowUp.create({
    data: {
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      doctorId: args.doctorId,
      createdById: args.createdById,
      type: "GERI_ARA",
      priority: 2,
      status: "ACIK",
      note: `${args.marker} Gelmedi, tekrar aranacak`,
      nextActionAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
}

async function upsertFollowUpEventByMarker(args: {
  followUpId: string;
  patientId: string;
  createdById: string;
  marker: string;
  summary: string;
  channel: string;
  patientResponse: string;
  nextStep: string;
}) {
  const detailText = "Demo surec notu";

  const existing = await prisma.patientFollowUpEvent.findFirst({
    where: {
      followUpId: args.followUpId,
      OR: [
        { detail: { contains: args.marker } },
        { summary: args.summary },
      ],
    },
  });

  if (existing) {
    await prisma.patientFollowUpEvent.update({
      where: { id: existing.id },
      data: {
        occurredAt: new Date(),
        channel: args.channel,
        summary: args.summary,
        detail: detailText,
        patientResponse: args.patientResponse,
        nextStep: args.nextStep,
        updatedById: args.createdById,
      },
    });
    return;
  }

  await prisma.patientFollowUpEvent.create({
    data: {
      followUpId: args.followUpId,
      patientId: args.patientId,
      occurredAt: new Date(),
      channel: args.channel,
      summary: args.summary,
      detail: detailText,
      patientResponse: args.patientResponse,
      nextStep: args.nextStep,
      createdById: args.createdById,
      updatedById: args.createdById,
    },
  });
}

async function upsertExaminationByMarker(args: { patientId: string; doctorId: string; marker: string }) {
  const existing = await prisma.examination.findFirst({
    where: { patientId: args.patientId, note: { contains: args.marker } },
  });

  if (existing) {
    await prisma.examination.update({
      where: { id: existing.id },
      data: {
        treatmentName: "Kompozit Dolgu",
        amount: new Prisma.Decimal(2250),
        status: "PLANLANDI",
        diagnosedAt: new Date(),
        note: `${args.marker} Demo muayene`,
      },
    });
    return;
  }

  await prisma.examination.create({
    data: {
      patientId: args.patientId,
      doctorId: args.doctorId,
      treatmentName: "Kompozit Dolgu",
      amount: new Prisma.Decimal(2250),
      status: "PLANLANDI",
      diagnosedAt: new Date(),
      note: `${args.marker} Demo muayene`,
    },
  });
}

async function upsertPaymentByMarker(args: { patientId: string; posId: string; marker: string }) {
  const existing = await prisma.payment.findFirst({
    where: { patientId: args.patientId, description: { contains: args.marker } },
  });

  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount: new Prisma.Decimal(1500),
        method: "KREDI_KARTI",
        posId: args.posId,
        description: `${args.marker} Demo odeme`,
      },
    });
    return;
  }

  await prisma.payment.create({
    data: {
      patientId: args.patientId,
      amount: new Prisma.Decimal(1500),
      method: "KREDI_KARTI",
      posId: args.posId,
      description: `${args.marker} Demo odeme`,
    },
  });
}

async function upsertTreatmentPlanByMarker(args: { patientId: string; doctorId: string; marker: string }) {
  const existing = await prisma.treatmentPlan.findFirst({
    where: { patientId: args.patientId, title: { contains: args.marker } },
  });

  if (existing) {
    return prisma.treatmentPlan.update({
      where: { id: existing.id },
      data: {
        title: `Implant Plani ${args.marker}`,
        status: "DEVAM_EDIYOR",
        totalCost: new Prisma.Decimal(18500),
        notes: `${args.marker} Demo tedavi plani`,
      },
    });
  }

  return prisma.treatmentPlan.create({
    data: {
      patientId: args.patientId,
      doctorId: args.doctorId,
      title: `Implant Plani ${args.marker}`,
      status: "DEVAM_EDIYOR",
      totalCost: new Prisma.Decimal(18500),
      notes: `${args.marker} Demo tedavi plani`,
    },
  });
}

async function upsertTreatmentSteps(planId: string, marker: string) {
  const hasSteps = await prisma.treatmentStep.count({ where: { planId } });
  if (hasSteps > 0) return;

  await prisma.treatmentStep.createMany({
    data: [
      { planId, order: 1, treatmentName: `Muayene ${marker}`, amount: new Prisma.Decimal(500), status: "TAMAMLANDI" },
      { planId, order: 2, treatmentName: `Cerrahi ${marker}`, amount: new Prisma.Decimal(9000), status: "BEKLIYOR" },
      { planId, order: 3, treatmentName: `Protez ${marker}`, amount: new Prisma.Decimal(9000), status: "BEKLIYOR" },
    ],
  });
}

async function upsertLabOrderByMarker(args: { patientId: string; doctorId: string; marker: string }) {
  const existing = await prisma.labOrder.findFirst({
    where: { patientId: args.patientId, notes: { contains: args.marker } },
  });

  if (existing) {
    return prisma.labOrder.update({
      where: { id: existing.id },
      data: {
        labName: "Demo Teknik Lab",
        labType: "Zirkonyum",
        notes: `${args.marker} Demo laboratuvar`,
        status: "DEVAM_EDIYOR",
        price: new Prisma.Decimal(4200),
      },
    });
  }

  return prisma.labOrder.create({
    data: {
      patientId: args.patientId,
      doctorId: args.doctorId,
      labName: "Demo Teknik Lab",
      labType: "Zirkonyum",
      notes: `${args.marker} Demo laboratuvar`,
      status: "DEVAM_EDIYOR",
      price: new Prisma.Decimal(4200),
    },
  });
}

async function upsertLabTrips(labOrderId: string, marker: string) {
  const count = await prisma.labTrip.count({ where: { labOrderId } });
  if (count > 0) return;

  await prisma.labTrip.createMany({
    data: [
      { labOrderId, order: 1, description: `Olcu gonderimi ${marker}` },
      { labOrderId, order: 2, description: `Provaya hazir ${marker}` },
    ],
  });
}

async function upsertStockItemByMarker(marker: string, userId: string) {
  const existing = await prisma.stockItem.findFirst({ where: { name: { contains: marker } } });
  if (existing) return existing;

  const item = await prisma.stockItem.create({
    data: {
      name: `Kompozit Refil ${marker}`,
      category: "SARF",
      unit: "adet",
      quantity: 120,
      minQuantity: 20,
      unitPrice: new Prisma.Decimal(85),
      supplier: `Demo Tedarik ${marker}`,
      isActive: true,
    },
  });

  await prisma.stockMovement.create({
    data: {
      stockItemId: item.id,
      type: "GIRIS",
      quantity: 120,
      note: `${marker} Ilk stok girisi`,
      userId,
    },
  });

  return item;
}

async function upsertStockMovement(stockItemId: string, userId: string, marker: string) {
  const existing = await prisma.stockMovement.findFirst({
    where: { stockItemId, note: { contains: marker } },
  });
  if (existing) return;

  await prisma.stockMovement.create({
    data: {
      stockItemId,
      type: "CIKIS",
      quantity: 8,
      note: `${marker} Demo kullanim`,
      userId,
    },
  });
}

async function upsertTaksitPlanByMarker(args: { patientId: string; doctorId: string; marker: string }) {
  const existing = await prisma.taksitPlan.findFirst({
    where: { patientId: args.patientId, notes: { contains: args.marker } },
  });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 5);

  if (existing) {
    return prisma.taksitPlan.update({
      where: { id: existing.id },
      data: {
        baslik: `Demo Taksit Plani ${args.marker}`,
        toplamBorc: new Prisma.Decimal(12000),
        pesnat: new Prisma.Decimal(2000),
        taksitSayisi: 3,
        period: "AYLIK",
        startDate,
        notes: `${args.marker} Demo taksit plani`,
        status: "AKTIF",
      },
    });
  }

  return prisma.taksitPlan.create({
    data: {
      patientId: args.patientId,
      doctorId: args.doctorId,
      baslik: `Demo Taksit Plani ${args.marker}`,
      toplamBorc: new Prisma.Decimal(12000),
      pesnat: new Prisma.Decimal(2000),
      taksitSayisi: 3,
      period: "AYLIK",
      startDate,
      notes: `${args.marker} Demo taksit plani`,
      status: "AKTIF",
    },
  });
}

async function upsertTaksitRows(planId: string, marker: string, posId: string) {
  const existing = await prisma.taksit.count({ where: { planId } });
  if (existing === 0) {
    const now = new Date();
    const taksitData: Prisma.TaksitCreateManyInput[] = [1, 2, 3].map((n) => {
      const vade = new Date(now);
      vade.setMonth(vade.getMonth() + n);
      return {
        planId,
        siraNo: n,
        vadeDate: vade,
        tutar: new Prisma.Decimal(3333.33),
        odenen: n === 1 ? new Prisma.Decimal(3333.33) : new Prisma.Decimal(0),
        kalan: n === 1 ? new Prisma.Decimal(0) : new Prisma.Decimal(3333.33),
        status: n === 1 ? "ODENDI" as const : "BEKLIYOR" as const,
        note: `${marker}-${n}`,
      };
    });
    await prisma.taksit.createMany({ data: taksitData });
  }

  const firstTaksit = await prisma.taksit.findFirst({ where: { planId, siraNo: 1 } });
  if (!firstTaksit) return;

  const existingPayment = await prisma.taksitOdeme.findFirst({
    where: { taksitId: firstTaksit.id, note: { contains: marker } },
  });
  if (existingPayment) return;

  await prisma.taksitOdeme.create({
    data: {
      taksitId: firstTaksit.id,
      tutar: new Prisma.Decimal(3333.33),
      yontem: "KREDI_KARTI",
      posId,
      note: `${marker} Ilk taksit odemesi`,
    },
  });
}

async function upsertReminderByMarker(patientId: string, planId: string, marker: string) {
  const existing = await prisma.reminder.findFirst({ where: { note: { contains: marker } } });
  const reminderDate = new Date(Date.now() + 3 * 24 * 60 * 60_000);

  if (existing) {
    await prisma.reminder.update({
      where: { id: existing.id },
      data: { patientId, planId, reminderDate, status: "AKTIF", note: `${marker} Taksit hatirlatmasi` },
    });
    return;
  }

  await prisma.reminder.create({
    data: {
      patientId,
      planId,
      reminderDate,
      status: "AKTIF",
      note: `${marker} Taksit hatirlatmasi`,
    },
  });
}

async function upsertExpenseByMarker(categoryId: string, marker: string) {
  const existing = await prisma.expense.findFirst({ where: { description: { contains: marker } } });
  const tarih = new Date();

  if (existing) {
    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        tarih,
        categoryId,
        category: "Sarf",
        description: `${marker} Eldiven ve sarf alimi`,
        tutar: new Prisma.Decimal(980),
        yontem: "HAVALE_EFT",
      },
    });
    return;
  }

  await prisma.expense.create({
    data: {
      tarih,
      categoryId,
      category: "Sarf",
      description: `${marker} Eldiven ve sarf alimi`,
      tutar: new Prisma.Decimal(980),
      yontem: "HAVALE_EFT",
    },
  });
}

async function upsertFirmaIslemByMarker(firmaId: string, marker: string) {
  const existing = await prisma.firmaIslem.findFirst({ where: { aciklama: { contains: marker } } });
  const tarih = new Date();

  if (existing) {
    await prisma.firmaIslem.update({
      where: { id: existing.id },
      data: {
        firmaId,
        tarih,
        islemTipi: "ALIM",
        urunHizmet: "Lab hizmeti",
        aciklama: `${marker} Demo firma islemi`,
        tutar: new Prisma.Decimal(3200),
        yontem: "HAVALE_EFT",
      },
    });
    return;
  }

  await prisma.firmaIslem.create({
    data: {
      firmaId,
      tarih,
      islemTipi: "ALIM",
      urunHizmet: "Lab hizmeti",
      aciklama: `${marker} Demo firma islemi`,
      tutar: new Prisma.Decimal(3200),
      yontem: "HAVALE_EFT",
    },
  });
}

async function upsertSupportTicketByMarker(userId: string, marker: string) {
  const existing = await prisma.supportTicket.findFirst({ where: { subject: { contains: marker } } });
  if (existing) {
    await prisma.supportTicket.update({
      where: { id: existing.id },
      data: {
        userId,
        subject: `${marker} Demo destek talebi`,
        message: "SMS bakiye raporu nasil alinabilir?",
        answer: "Raporlar ekranindan tarih secerek alabilirsiniz.",
      },
    });
    return;
  }

  await prisma.supportTicket.create({
    data: {
      userId,
      subject: `${marker} Demo destek talebi`,
      message: "SMS bakiye raporu nasil alinabilir?",
      answer: "Raporlar ekranindan tarih secerek alabilirsiniz.",
    },
  });
}

async function upsertMessageByMarker(userId: string, marker: string) {
  const existing = await prisma.message.findFirst({ where: { text: { contains: marker } } });
  if (existing) return;

  await prisma.message.create({
    data: { userId, text: `${marker} Klinik ici duyuru mesaji` },
  });
}

async function upsertAnnouncementByMarker(marker: string) {
  const existing = await prisma.announcement.findFirst({ where: { text: { contains: marker } } });
  if (existing) return;

  await prisma.announcement.create({
    data: { text: `${marker} Haftalik sistem bakimi cumartesi 23:00` },
  });
}

async function upsertAdvertisementByMarker(marker: string) {
  const existing = await prisma.advertisement.findFirst({ where: { title: { contains: marker } } });
  if (existing) {
    return prisma.advertisement.update({
      where: { id: existing.id },
      data: {
        title: `Demo Kampanya ${marker}`,
        content: "Implant paketi kampanyasi detaylari",
        ctaText: "Detaylari Gor",
        ctaUrl: "https://demo.klinik.local/kampanya",
        sponsorName: "KlinikModern Demo",
        isActive: true,
      },
    });
  }

  return prisma.advertisement.create({
    data: {
      title: `Demo Kampanya ${marker}`,
      content: "Implant paketi kampanyasi detaylari",
      ctaText: "Detaylari Gor",
      ctaUrl: "https://demo.klinik.local/kampanya",
      sponsorName: "KlinikModern Demo",
      isActive: true,
      priority: 50,
    },
  });
}

async function upsertSmsTransactionByMarker(institutionId: string, smsPackageId: string, marker: string) {
  const existing = await prisma.smsTransaction.findFirst({
    where: {
      institutionId,
      smsPackageId,
      status: marker,
    },
  });
  if (existing) return;

  await prisma.smsTransaction.create({
    data: {
      institutionId,
      smsPackageId,
      quantity: 1,
      totalPrice: new Prisma.Decimal(1499),
      balanceBefore: 0,
      balanceAfter: 7777,
      status: marker,
    },
  });
}

async function upsertInvoiceReminderByMarker(invoiceId: string, marker: string) {
  const existing = await prisma.invoiceReminder.findFirst({ where: { invoiceId, message: { contains: marker } } });
  if (existing) return;

  await prisma.invoiceReminder.create({
    data: {
      invoiceId,
      channel: "EMAIL",
      sentTo: "demo@klinik.local",
      status: "SENT",
      message: `${marker} Demo fatura hatirlatmasi`,
    },
  });
}

main()
  .catch((err) => {
    console.error("Demo paket yukleme hatasi:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
