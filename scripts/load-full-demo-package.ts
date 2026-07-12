import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MARKER = "[DEMO_PAKET_20260506]";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo-password-change-me";

async function cleanupVisibleMarkerText() {
  const targets: Array<{ table: string; column: string }> = [
    { table: "Institution", column: "address" },
    { table: "Setting", column: "institutionAddress" },
    { table: "User", column: "fullName" },
    { table: "Patient", column: "fullName" },
  ];

  for (const target of targets) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "${target.table}" SET "${target.column}" = NULLIF(BTRIM(REGEXP_REPLACE(REPLACE("${target.column}", $1, ''), '\\s{2,}', ' ', 'g')), '') WHERE "${target.column}" IS NOT NULL AND "${target.column}" LIKE '%' || $1 || '%'`,
        MARKER,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[demo-cleanup-skip] ${target.table}.${target.column}: ${detail}`);
    }
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
      where: { institutionId_identityNo: { institutionId: institution.id, identityNo: u.identityNo } },
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
    { tcNo: "98000000005", fullName: `Demo Zeynep Arslan ${MARKER}`, phone: "05550000105", gender: "K" },
    { tcNo: "98000000006", fullName: `Demo Burak Sahin ${MARKER}`, phone: "05550000106", gender: "E" },
    { tcNo: "98000000007", fullName: `Demo Selin Koc ${MARKER}`, phone: "05550000107", gender: "K" },
    { tcNo: "98000000008", fullName: `Demo Murat Ozkan ${MARKER}`, phone: "05550000108", gender: "E" },
    { tcNo: "98000000009", fullName: `Demo Deniz Acar ${MARKER}`, phone: "05550000109", gender: "K" },
    { tcNo: "98000000010", fullName: `Demo Can Erdem ${MARKER}`, phone: "05550000110", gender: "E" },
  ] as const;

  const createdPatients: Array<{ id: string; fullName: string; phone: string }> = [];

  for (const p of demoPatients) {
    const patient = await prisma.patient.upsert({
      where: { institutionId_tcNo: { institutionId: institution.id, tcNo: p.tcNo } },
      update: {
        fullName: p.fullName,
        phone: p.phone,
        gender: p.gender,
        notes: `${MARKER} Hasta notu`,
        insurance: "SGK",
        referrer: "Sosyal Medya",
      },
      create: {
        institutionId: institution.id,
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

  for (let i = 4; i < createdPatients.length; i += 1) {
    const startAt = new Date(tomorrow);
    startAt.setHours(9 + (i % 6), (i % 2) * 30, 0, 0);
    await upsertAppointmentByMarker({
      patientId: createdPatients[i].id,
      doctorId,
      marker: `${MARKER}-APPT-${i + 1}`,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: i % 3 === 0 ? "ONAYLANDI" : "BEKLIYOR",
      type: i % 2 === 0 ? "KONTROL" : "STANDART",
    });
  }

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

  await upsertClinicTaskByMarker({
    institutionId: institution.id,
    patientId: createdPatients[3].id,
    createdById: managerId,
    assignedToId: createdUsers[Role.ASISTAN].id,
    marker: `${MARKER}-TASK-1`,
  });

  await upsertExaminationByMarker({
    patientId: createdPatients[0].id,
    doctorId,
    marker: `${MARKER}-EXAM-1`,
  });

  const pos = await prisma.posDevice.upsert({
    where: { institutionId_name: { institutionId: institution.id, name: `Demo POS ${MARKER}` } },
    update: { isActive: true },
    create: { institutionId: institution.id, name: `Demo POS ${MARKER}`, isActive: true },
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

  const stock = await upsertStockItemByMarker(`${MARKER}-STOCK-1`, managerId, institution.id);

  await upsertStockMovement(stock.id, managerId, `${MARKER}-MOVE-1`);

  const taksitPlan = await upsertTaksitPlanByMarker({
    patientId: createdPatients[3].id,
    doctorId,
    marker: `${MARKER}-TAKSIT-1`,
  });

  await upsertTaksitRows(taksitPlan.id, `${MARKER}-TAKSITROW`, pos.id);

  await upsertReminderByMarker(createdPatients[3].id, taksitPlan.id, `${MARKER}-REM-1`);

  const expenseCategory = await prisma.expenseCategory.upsert({
    where: { institutionId_name: { institutionId: institution.id, name: `Demo Gider Kategorisi ${MARKER}` } },
    update: { isActive: true },
    create: { institutionId: institution.id, name: `Demo Gider Kategorisi ${MARKER}`, isActive: true },
    select: { id: true },
  });

  await upsertExpenseByMarker(expenseCategory.id, `${MARKER}-EXP-1`, institution.id);

  const firma = await prisma.firma.upsert({
    where: { institutionId_name: { institutionId: institution.id, name: "Demo Tedarikci" } },
    update: { isActive: true, phone: "02120000000" },
    create: {
      institutionId: institution.id,
      name: "Demo Tedarikci",
      phone: "02120000000",
      notes: `${MARKER} Demo firma`,
      isActive: true,
    },
    select: { id: true },
  });

  await upsertFirmaIslemByMarker(firma.id, `${MARKER}-FIRMA-1`);

  await upsertSupportTicketByMarker(managerId, `${MARKER}-SUP-1`);
  await upsertMessageByMarker(createdUsers[Role.ASISTAN].id, `${MARKER}-MSG-1`);
  await upsertAnnouncementByMarker({
    institutionId: institution.id,
    createdById: managerId,
    marker: `${MARKER}-ANN-1`,
  });

  await upsertWorkflowScenarioPack({
    institutionId: institution.id,
    doctorId,
    managerId,
    assistantId: createdUsers[Role.ASISTAN].id,
    bankoId: createdUsers[Role.BANKO].id,
    posId: pos.id,
    patients: createdPatients,
  });

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
      institutionId_code_treatment: {
        institutionId: institution.id,
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
      institutionId: institution.id,
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

async function upsertClinicTaskByMarker(args: {
  institutionId: string;
  patientId: string;
  createdById: string;
  assignedToId: string;
  marker: string;
}) {
  const existing = await prisma.clinicTask.findFirst({
    where: { institutionId: args.institutionId, title: { contains: args.marker } },
    include: { assignees: true },
  });

  const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60_000);
  if (existing) {
    await prisma.clinicTask.update({
      where: { id: existing.id },
      data: {
        patientId: args.patientId,
        title: `${args.marker} Hasta geri arama`,
        details: "Tedavi planı onayı için hasta aranacak.",
        type: "ARAMA",
        priority: 1,
        status: "ACIK",
        dueAt,
        assignedToId: args.assignedToId,
        createdById: args.createdById,
      },
    });

    const hasAssignee = existing.assignees.some((assignee) => assignee.userId === args.assignedToId);
    if (!hasAssignee) {
      await prisma.clinicTaskAssignee.create({
        data: { taskId: existing.id, userId: args.assignedToId },
      });
    }
    return;
  }

  await prisma.clinicTask.create({
    data: {
      institutionId: args.institutionId,
      patientId: args.patientId,
      title: `${args.marker} Hasta geri arama`,
      details: "Tedavi planı onayı için hasta aranacak.",
      type: "ARAMA",
      priority: 1,
      status: "ACIK",
      dueAt,
      assignedToId: args.assignedToId,
      createdById: args.createdById,
      assignees: { create: [{ userId: args.assignedToId }] },
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

async function upsertStockItemByMarker(marker: string, userId: string, institutionId: string) {
  const existing = await prisma.stockItem.findFirst({ where: { institutionId, name: { contains: marker } } });
  if (existing) return existing;

  const item = await prisma.stockItem.create({
    data: {
      institutionId,
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

async function upsertExpenseByMarker(categoryId: string, marker: string, institutionId: string) {
  const existing = await prisma.expense.findFirst({ where: { institutionId, description: { contains: marker } } });
  const tarih = new Date();

  if (existing) {
    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        tarih,
        institutionId,
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
      institutionId,
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

async function upsertAnnouncementByMarker(args: { institutionId: string; createdById: string; marker: string }) {
  const existing = await prisma.announcement.findFirst({
    where: { institutionId: args.institutionId, text: { contains: args.marker } },
  });
  if (existing) {
    await prisma.announcement.update({
      where: { id: existing.id },
      data: {
        text: `${args.marker} Demo kurum duyurusu: Bugunun onceligi randevu ve tahsilat takibi.`,
        isActive: true,
        createdById: args.createdById,
        startsAt: null,
        endsAt: new Date(Date.now() + 14 * 24 * 60 * 60_000),
      },
    });
    return;
  }

  await prisma.announcement.create({
    data: {
      institutionId: args.institutionId,
      text: `${args.marker} Demo kurum duyurusu: Bugunun onceligi randevu ve tahsilat takibi.`,
      createdById: args.createdById,
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60_000),
    },
  });
}

async function upsertWorkflowScenarioPack(args: {
  institutionId: string;
  doctorId: string;
  managerId: string;
  assistantId: string;
  bankoId: string;
  posId: string;
  patients: Array<{ id: string; fullName: string; phone: string }>;
}) {
  const [p0, p1, p2, p3, p4, p5, p6, p7, p8] = args.patients;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  await upsertAppointmentByMarker({
    patientId: p0.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-ACIL-RANDEVU`,
    startAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0),
    endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30),
    status: "BEKLIYOR",
    type: "ACIL",
  });

  const missed = await upsertAppointmentByMarker({
    patientId: p1.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-GELMEDI`,
    startAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 11, 0),
    endAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 11, 30),
    status: "GELMEDI",
    type: "KONTROL",
  });

  await upsertFollowUpByMarker({
    patientId: p1.id,
    appointmentId: missed.id,
    doctorId: args.doctorId,
    createdById: args.managerId,
    marker: `${MARKER}-SCN-GELMEDI-TAKIP`,
  });

  await upsertClinicTaskByMarker({
    institutionId: args.institutionId,
    patientId: p1.id,
    createdById: args.managerId,
    assignedToId: args.assistantId,
    marker: `${MARKER}-SCN-ASISTAN-ARAMA`,
  });

  const completedPlan = await upsertTreatmentPlanByMarker({
    patientId: p2.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-TAMAMLANAN-TEDAVI`,
  });
  await prisma.treatmentPlan.update({
    where: { id: completedPlan.id },
    data: { status: "TAMAMLANDI", totalCost: new Prisma.Decimal(6200), notes: `${MARKER}-SCN-TAMAMLANAN-TEDAVI Onayli ve tamamlanmis tedavi` },
  });

  await upsertPaymentByMarker({
    patientId: p2.id,
    posId: args.posId,
    marker: `${MARKER}-SCN-ODEME-KART`,
  });

  const installmentPlan = await upsertTaksitPlanByMarker({
    patientId: p3.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-TAKSITLI-HASTA`,
  });
  await upsertTaksitRows(installmentPlan.id, `${MARKER}-SCN-TAKSIT-ODEME`, args.posId);

  const delayedLab = await upsertLabOrderByMarker({
    patientId: p4.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-GECIKEN-LAB`,
  });
  await prisma.labOrder.update({
    where: { id: delayedLab.id },
    data: { labName: "Demo Geciken Lab", labType: "E-max", price: new Prisma.Decimal(5200), notes: `${MARKER}-SCN-GECIKEN-LAB 4 gundur laboratuvarda bekliyor` },
  });
  await upsertLabTripScenario(delayedLab.id, `${MARKER}-SCN-GECIKEN-LAB-TRIP`, -5, null);

  const returnedLab = await upsertLabOrderByMarker({
    patientId: p5.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-KLINIGE-DONEN-LAB`,
  });
  await prisma.labOrder.update({
    where: { id: returnedLab.id },
    data: { labName: "Demo Hizli Lab", labType: "Gece Plagi", price: new Prisma.Decimal(1800), notes: `${MARKER}-SCN-KLINIGE-DONEN-LAB Klinikte prova bekliyor` },
  });
  await upsertLabTripScenario(returnedLab.id, `${MARKER}-SCN-KLINIGE-DONEN-LAB-TRIP`, -3, -1);

  await upsertStockScenario({
    institutionId: args.institutionId,
    userId: args.managerId,
    marker: `${MARKER}-SCN-KRITIK-STOK`,
    name: "Demo Kritik Anestezi",
    category: "MEDIKAL",
    quantity: 2,
    minQuantity: 8,
    unitPrice: 145,
  });

  await upsertStockScenario({
    institutionId: args.institutionId,
    userId: args.managerId,
    marker: `${MARKER}-SCN-YETERLI-STOK`,
    name: "Demo Eldiven Stogu",
    category: "SARF",
    quantity: 40,
    minQuantity: 10,
    unitPrice: 320,
  });

  await upsertSupplierScenario(args.institutionId, `${MARKER}-SCN-TEDARIK-SIPARIS`, args.managerId);

  await upsertClinicTaskByMarker({
    institutionId: args.institutionId,
    patientId: p6.id,
    createdById: args.managerId,
    assignedToId: args.bankoId,
    marker: `${MARKER}-SCN-BANKO-TAHSILAT`,
  });

  await upsertAppointmentByMarker({
    patientId: p7.id,
    doctorId: args.doctorId,
    marker: `${MARKER}-SCN-KONTROL-RANDEVU`,
    startAt: new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate(), 10, 0),
    endAt: new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate(), 10, 30),
    status: "BEKLIYOR",
    type: "KONTROL",
  });

  if (p8) {
    await upsertPaymentByMarker({
      patientId: p8.id,
      posId: args.posId,
      marker: `${MARKER}-SCN-NAKIT-TAHSILAT`,
    });
  }
}

async function upsertLabTripScenario(labOrderId: string, marker: string, sentOffsetDays: number, receivedOffsetDays: number | null) {
  const existing = await prisma.labTrip.findFirst({ where: { labOrderId, description: { contains: marker } } });
  const sentAt = new Date();
  sentAt.setDate(sentAt.getDate() + sentOffsetDays);
  const receivedAt = receivedOffsetDays === null ? null : new Date();
  if (receivedAt && receivedOffsetDays !== null) receivedAt.setDate(receivedAt.getDate() + receivedOffsetDays);

  if (existing) {
    await prisma.labTrip.update({
      where: { id: existing.id },
      data: { sentAt, receivedAt, description: `${marker} Olcu gonderildi`, sentNote: `${marker} Demo lab senaryosu`, receivedNote: receivedAt ? "Klinige teslim alindi" : null },
    });
    return;
  }

  await prisma.labTrip.create({
    data: {
      labOrderId,
      order: 9,
      sentAt,
      receivedAt,
      description: `${marker} Olcu gonderildi`,
      sentNote: `${marker} Demo lab senaryosu`,
      receivedNote: receivedAt ? "Klinige teslim alindi" : null,
    },
  });
}

async function upsertStockScenario(args: {
  institutionId: string;
  userId: string;
  marker: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number;
}) {
  const existing = await prisma.stockItem.findFirst({
    where: { institutionId: args.institutionId, name: `${args.name} ${args.marker}` },
  });

  const item = existing
    ? await prisma.stockItem.update({
        where: { id: existing.id },
        data: {
          quantity: args.quantity,
          minQuantity: args.minQuantity,
          unitPrice: new Prisma.Decimal(args.unitPrice),
          isActive: true,
        },
      })
    : await prisma.stockItem.create({
        data: {
      institutionId: args.institutionId,
      name: `${args.name} ${args.marker}`,
      category: args.category,
      unit: "adet",
      quantity: args.quantity,
      minQuantity: args.minQuantity,
      unitPrice: new Prisma.Decimal(args.unitPrice),
      supplier: "Demo Tedarikci",
      isActive: true,
    },
      });

  const existingMove = await prisma.stockMovement.findFirst({ where: { stockItemId: item.id, note: { contains: args.marker } } });
  if (!existingMove) {
    await prisma.stockMovement.create({
      data: { stockItemId: item.id, type: "GIRIS", quantity: args.quantity, note: `${args.marker} Senaryo stok hareketi`, userId: args.userId },
    });
  }
}

async function upsertSupplierScenario(institutionId: string, marker: string, userId: string) {
  const firma = await prisma.firma.upsert({
    where: { institutionId_name: { institutionId, name: `Demo Sarf Deposu ${marker}` } },
    update: { isActive: true, phone: "02120000002", vendorScore: 72 },
    create: {
      institutionId,
      name: `Demo Sarf Deposu ${marker}`,
      phone: "02120000002",
      kategori: "TEDARICI",
      notes: `${marker} Siparis ve stok senaryosu`,
      vendorScore: 72,
      isActive: true,
    },
  });

  const existing = await prisma.firmaIslem.findFirst({ where: { firmaId: firma.id, aciklama: { contains: marker } } });
  if (!existing) {
    await prisma.firmaIslem.create({
      data: {
        firmaId: firma.id,
        tarih: new Date(),
        islemTipi: "ALIM",
        urunHizmet: "Anestezi ve sarf siparisi",
        aciklama: `${marker} Firma siparisi stokla eslesmeli`,
        tutar: new Prisma.Decimal(6850),
        faturaNo: "DEMO-SIP-001",
        yontem: "HAVALE_EFT",
        kdvOrani: 20,
      },
    });
  }

  await upsertStockScenario({
    institutionId,
    userId,
    marker: `${marker}-STOK`,
    name: "Demo Siparisle Gelen Sarf",
    category: "SARF",
    quantity: 24,
    minQuantity: 6,
    unitPrice: 210,
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
