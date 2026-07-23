import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// Hastanın taksit/ödeme vadesi yaklaştığında veya geciktiğinde SMS hatırlatması
// — süperadmin'in kurumlara gönderdiği fatura hatırlatmasından (billing-reminders.ts)
// TAMAMEN AYRI bir özellik: bu, kliniğin KENDİ hastasına gönderdiği bir SMS'tir
// ve klinik Ayarlar > SMS ekranından açıp kapatabilir (Setting.paymentReminderSmsEnabled).
// Varsayılan KAPALI — SMS kurumun kendi bakiyesinden düşer, bilinçli açılmalı.

const DEFAULT_APPROACHING_WINDOW_DAYS = 3;
const MIN_HOURS_BETWEEN_REMINDERS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d: Date) {
  return d.toLocaleDateString("tr-TR");
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
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
  const cutoff = new Date(now.getTime() - MIN_HOURS_BETWEEN_REMINDERS * 60 * 60 * 1000);

  const settings = await prisma.setting.findMany({
    where: { paymentReminderSmsEnabled: true, smsEnabled: true },
    select: { institutionId: true, institutionName: true, institutionPhone: true, paymentReminderWindowDays: true },
  });

  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedRecent = 0;
  let skippedNoBalance = 0;

  for (const setting of settings) {
    const institution = await prisma.institution.findUnique({
      where: { id: setting.institutionId },
      select: { id: true, name: true, phone: true, smsBalance: true },
    });
    if (!institution) continue;

    // Pencere kurum bazlı: klinik Ayarlar'dan vadeye kaç gün kala hatırlatılacağını seçer.
    const windowDays = setting.paymentReminderWindowDays ?? DEFAULT_APPROACHING_WINDOW_DAYS;
    const windowEnd = new Date(now.getTime() + windowDays * DAY_MS);

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
      const institutionPhone = setting.institutionPhone || institution.phone || "";
      const dueDateText = fmtDate(taksit.vadeDate);
      const amountText = Number(taksit.kalan).toLocaleString("tr-TR");
      const daysLeftText = String(Math.max(0, Math.ceil((taksit.vadeDate.getTime() - now.getTime()) / DAY_MS)));
      const daysLateText = String(Math.max(0, Math.ceil((now.getTime() - taksit.vadeDate.getTime()) / DAY_MS)));

      const smsTemplate = await prisma.smsTemplate.findFirst({
        where: { code: isOverdue ? "ODEME_GECIKTI" : "ODEME_YAKLASIYOR", isActive: true },
      });
      const fallbackMessage = isOverdue
        ? `Sayın ${patient.fullName}, ${institutionName} nezdindeki ${amountText} TL tutarındaki ödemenizin vadesi ${daysLateText} gün geçmiştir. En kısa sürede tamamlamanızı rica ederiz.`
        : `Sayın ${patient.fullName}, ${institutionName} nezdindeki ${amountText} TL tutarındaki ödemenizin son ${daysLeftText} gün içinde tamamlanmasını rica ederiz.`;
      const message = smsTemplate
        ? renderTemplate(smsTemplate.content, {
            institutionName,
            institutionPhone,
            patientName: patient.fullName,
            dueDate: dueDateText,
            amount: amountText,
            daysLeft: daysLeftText,
            daysLate: daysLateText,
          })
        : fallbackMessage;

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
