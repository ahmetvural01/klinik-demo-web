const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const M = "[DEMO_PAKET_20260506]";

(async () => {
  const out = {
    users: await prisma.user.count({ where: { fullName: { contains: M } } }),
    patients: await prisma.patient.count({ where: { fullName: { contains: M } } }),
    appointments: await prisma.appointment.count({ where: { note: { contains: M } } }),
    followUps: await prisma.patientFollowUp.count({ where: { note: { contains: M } } }),
    followUpEvents: await prisma.patientFollowUpEvent.count({ where: { detail: { contains: M } } }),
    examinations: await prisma.examination.count({ where: { note: { contains: M } } }),
    payments: await prisma.payment.count({ where: { description: { contains: M } } }),
    treatmentPlans: await prisma.treatmentPlan.count({ where: { title: { contains: M } } }),
    labOrders: await prisma.labOrder.count({ where: { notes: { contains: M } } }),
    stockItems: await prisma.stockItem.count({ where: { name: { contains: M } } }),
    reminders: await prisma.reminder.count({ where: { note: { contains: M } } }),
    expenses: await prisma.expense.count({ where: { description: { contains: M } } }),
    firmaIslem: await prisma.firmaIslem.count({ where: { aciklama: { contains: M } } }),
    supportTickets: await prisma.supportTicket.count({ where: { subject: { contains: M } } }),
    messages: await prisma.message.count({ where: { text: { contains: M } } }),
    announcements: await prisma.announcement.count({ where: { text: { contains: M } } }),
    advertisements: await prisma.advertisement.count({ where: { title: { contains: M } } }),
    smsTransactions: await prisma.smsTransaction.count({ where: { status: M + "-SMSTRX-1" } }),
    invoices: await prisma.invoice.count({ where: { description: { contains: M } } }),
  };
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
})();
