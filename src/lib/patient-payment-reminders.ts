import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// Hastanın taksit/ödeme vadesi yaklaştığında veya geciktiğinde SMS hatırlatması
// — süperadmin'in kurumlara gönderdiği fatura hatırlatmasından (billing-reminders.ts)
// TAMAMEN AYRI bir özellik: bu, kliniğin KENDİ hastasına gönderdiği bir SMS'tir
// ve klinik Ayarlar > SMS ekranından açıp kapatabilir (Setting.paymentReminderSmsEnabled).
// Varsayılan KAPALI — SMS kurumun kendi bakiyesinden düşer, bilinçli açılmalı.

const APPROACHING_WINDOW_DAYS = 3;
const MIN_HOURS_BETWEEN_REMINDERS = 20;

function fmtDate(d: Date) {
  return d.toLocaleDateString("tr-TR");
}

export async function runPatientPaymentReminderSweep(): Promise<{
  institutionsChecked: number;
  checked: number;
  sent: number;
  failed: number;
  skippedRecent: number;
  skippedNoBalance: number;
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + APPROACHING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cutoff = new Date(now.getTime() - MIN_HOURS_BETWEEN_REMINDERS * 60 * 60 * 1000);

  const settings = await prisma.setting.findMany({
    where: { paymentReminderSmsEnabled: true, smsEnabled: true },
    select: { institutionId: true, institutionName: true },
  });

  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedRecent = 0;
  let skippedNoBalance = 0;

  for (const setting of settings) {
    const institution = await prisma.institution.findUnique({
      where: { id: setting.institutionId },
      select: { id: true, name: true, smsBalance: true },
    });
    if (!institution) continue;

    const taksitler = await prisma.taksit.findMany({
      where: {
        status: { in: ["BEKLIYOR", "GECIKTI"] },
        vadeDate: { lte: windowEnd },
        plan: { patient: { institutionId: institution.id } },
      },
      include: {
        plan: { include: { patient: { select: { id: true, fullName: true, phone: true } } } },
      },
      orderBy: { vadeDate: "asc" },
    });

    for (const taksit of taksitler) {
      checked += 1;
      const patient = taksit.plan.patient;
      if (!patient.phone) { failed += 1; continue; }

      const lastReminder = await prisma.taksitReminderLog.findFirst({
        where: { taksitId: taksit.id },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      if (lastReminder && lastReminder.sentAt > cutoff) {
        skippedRecent += 1;
        continue;
      }

      const reservation = await prisma.institution.updateMany({
        where: { id: institution.id, smsBalance: { gte: 1 } },
        data: { smsBalance: { decrement: 1 } },
      });
      if (reservation.count === 0) {
        skippedNoBalance += 1;
        continue;
      }

      const isOverdue = taksit.status === "GECIKTI" || taksit.vadeDate < now;
      const institutionName = setting.institutionName || institution.name;
      const message = isOverdue
        ? `${institutionName}: Sayın ${patient.fullName}, ${fmtDate(taksit.vadeDate)} vadeli ${Number(taksit.kalan)} TL taksit ödemeniz gecikmiştir. Bilgi için lütfen kliniğimizle iletişime geçin.`
        : `${institutionName}: Sayın ${patient.fullName}, ${fmtDate(taksit.vadeDate)} vadeli ${Number(taksit.kalan)} TL taksit ödemenizin süresi yaklaşıyor.`;

      const result = await sendSms(patient.phone, message);

      if (result.success) {
        sent += 1;
        await prisma.taksitReminderLog.create({ data: { taksitId: taksit.id, sentTo: patient.phone, status: "SENT" } });
      } else {
        failed += 1;
        await prisma.institution.update({ where: { id: institution.id }, data: { smsBalance: { increment: 1 } } });
        await prisma.taksitReminderLog.create({ data: { taksitId: taksit.id, sentTo: patient.phone, status: "FAILED", errorDetail: result.error } });
      }
    }
  }

  return { institutionsChecked: settings.length, checked, sent, failed, skippedRecent, skippedNoBalance };
}
