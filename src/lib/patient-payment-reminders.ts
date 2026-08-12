import { prisma } from "@/lib/prisma";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { isoLocalDate } from "@/lib/celebration-days";
import { operationalInstitutionWhere } from "@/lib/operational-state";

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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
    where: { paymentReminderSmsEnabled: true, institution: operationalInstitutionWhere(now) },
    select: {
      institutionId: true,
      institutionName: true,
      institutionPhone: true,
      paymentReminderWindowDays: true,
      paymentReminderDaysBefore: true,
      paymentReminderOnDueDate: true,
      paymentReminderOverdueEnabled: true,
      paymentReminderOverdueEveryDays: true,
    },
  });

  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedRecent = 0;
  let skippedNoBalance = 0;
  // Bir hastanın aynı sweep çalıştırmasında birden fazla geciken/yaklaşan
  // taksiti varsa, her biri için ayrı ayrı SMS gitmesin — spam algısı ve
  // gereksiz SMS kredisi tüketimi (bkz. denetim raporu).
  const remindedPatientIdsThisRun = new Set<string>();

  for (const setting of settings) {
    const institution = await prisma.institution.findUnique({
      where: { id: setting.institutionId },
      select: { id: true, name: true, phone: true, smsBalance: true },
    });
    if (!institution) continue;

    const daysBefore = setting.paymentReminderDaysBefore.length > 0
      ? setting.paymentReminderDaysBefore
      : [setting.paymentReminderWindowDays ?? DEFAULT_APPROACHING_WINDOW_DAYS];
    const windowDays = Math.max(...daysBefore, 0);
    const windowEnd = new Date(now.getTime() + windowDays * DAY_MS);

    const taksitler = await prisma.taksit.findMany({
      where: {
        status: { in: ["BEKLIYOR", "GECIKTI"] },
        vadeDate: { lte: windowEnd },
        branch: { isActive: true },
        plan: {
          status: "AKTIF",
          patient: { institutionId: institution.id, archivedAt: null, homeBranch: { isActive: true } },
        },
      },
      include: {
        plan: { include: { patient: { select: { id: true, fullName: true, phone: true } } } },
      },
      orderBy: { vadeDate: "asc" },
    });

    for (const taksit of taksitler) {
      const patient = taksit.plan.patient;
      if (!patient.phone) { failed += 1; continue; }

      const daysUntilDue = Math.round(
        (startOfLocalDay(taksit.vadeDate).getTime() - startOfLocalDay(now).getTime()) / DAY_MS,
      );
      const overdueInterval = Math.max(1, setting.paymentReminderOverdueEveryDays || 1);
      const scheduled = daysUntilDue > 0
        ? daysBefore.includes(daysUntilDue)
        : daysUntilDue === 0
          ? setting.paymentReminderOnDueDate
          : setting.paymentReminderOverdueEnabled && Math.abs(daysUntilDue) % overdueInterval === 0;
      if (!scheduled) continue;
      checked += 1;

      if (remindedPatientIdsThisRun.has(patient.id)) {
        skippedRecent += 1;
        continue;
      }

      const lastReminder = await prisma.taksitReminderLog.findFirst({
        where: { taksitId: taksit.id },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      if (lastReminder && lastReminder.sentAt > cutoff) {
        skippedRecent += 1;
        continue;
      }

      const isOverdue = daysUntilDue < 0;
      const isDueToday = daysUntilDue === 0;
      const institutionName = setting.institutionName || institution.name;
      const institutionPhone = setting.institutionPhone || institution.phone || "";
      const dueDateText = fmtDate(taksit.vadeDate);
      const amountText = Number(taksit.kalan).toLocaleString("tr-TR");
      const daysLeftText = String(Math.max(0, daysUntilDue));
      const daysLateText = String(Math.max(0, Math.abs(daysUntilDue)));

      const templateCode = isOverdue ? "ODEME_GECIKTI" : isDueToday ? "ODEME_VADE_GUNU" : "ODEME_YAKLASIYOR";
      const smsTemplate = await resolveSmsTemplate(institution.id, templateCode);
      const fallbackMessage = isOverdue
        ? `Sayın ${patient.fullName}, ${institutionName} nezdindeki ${amountText} TL tutarındaki ödemenizin vadesi ${daysLateText} gün geçmiştir. En kısa sürede tamamlamanızı rica ederiz.`
        : isDueToday
          ? `Sayın ${patient.fullName}, ${institutionName} nezdindeki ${amountText} TL tutarındaki ödemenizin vadesi bugündür. Bilginize sunarız.`
          : `Sayın ${patient.fullName}, ${institutionName} nezdindeki ${amountText} TL tutarındaki ödemenizin son ${daysLeftText} gün içinde tamamlanmasını rica ederiz.`;
      const rendered = renderCommunicationTemplate(smsTemplate, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
        dueDate: dueDateText,
        amount: amountText,
        daysLeft: daysLeftText,
        daysLate: daysLateText,
      }, fallbackMessage);

      const result = await dispatchPatientMessage({
        institutionId: institution.id,
        patientId: patient.id,
        eventType: "PAYMENT_REMINDER",
        purpose: "SERVICE",
        templateCode,
        message: rendered.smsMessage,
        whatsappMessage: rendered.whatsappMessage,
        whatsappTemplate: rendered.whatsappTemplate,
        idempotencyKey: `payment-reminder:${taksit.id}:${isoLocalDate(now)}`,
      });

      if (result.success) {
        sent += 1;
        remindedPatientIdsThisRun.add(patient.id);
        await prisma.taksitReminderLog.create({ data: { institutionId: taksit.institutionId, branchId: taksit.branchId, taksitId: taksit.id, sentTo: patient.phone, status: "SENT" } });
      } else if (result.suppressed) {
        skippedNoBalance += 1;
        await prisma.taksitReminderLog.create({ data: { institutionId: taksit.institutionId, branchId: taksit.branchId, taksitId: taksit.id, sentTo: patient.phone, status: "FAILED", errorDetail: result.reason } });
      } else {
        failed += 1;
        await prisma.taksitReminderLog.create({ data: { institutionId: taksit.institutionId, branchId: taksit.branchId, taksitId: taksit.id, sentTo: patient.phone, status: "FAILED", errorDetail: result.error } });
      }
    }
  }

  return { institutionsChecked: settings.length, checked, sent, failed, skippedRecent, skippedNoBalance };
}
