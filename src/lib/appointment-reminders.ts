import { prisma } from "@/lib/prisma";
import { resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";

const APPOINTMENT_REMINDER_PREFIX = "[APPT_REMINDER]";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10 * 60 * 1000;

type SweepOptions = {
  institutionId?: string;
  take?: number;
};

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

function parseAppointmentId(note: string) {
  if (!note.startsWith(`${APPOINTMENT_REMINDER_PREFIX}:`)) return null;
  return note.slice(APPOINTMENT_REMINDER_PREFIX.length + 1).trim() || null;
}

function appointmentDateText(value: Date) {
  return value.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

export async function runAppointmentReminderSweep(options: SweepOptions = {}) {
  const now = new Date();
  const take = Math.max(1, Math.min(250, options.take || 100));
  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: "AKTIF",
      planId: null,
      reminderDate: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
      note: { startsWith: APPOINTMENT_REMINDER_PREFIX },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      patient: options.institutionId
        ? { institutionId: options.institutionId }
        : { institutionId: { not: "" } },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { reminderDate: "asc" }],
    take,
    select: {
      id: true,
      note: true,
      attemptCount: true,
      patient: { select: { institutionId: true } },
    },
  });

  const appointmentIds = [
    ...new Set(
      dueReminders
        .map((reminder) => parseAppointmentId(reminder.note))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const appointments = appointmentIds.length
    ? await prisma.appointment.findMany({
        where: { id: { in: appointmentIds } },
        select: {
          id: true,
          startAt: true,
          status: true,
          smsReminder: true,
          patient: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              phoneCountryCode: true,
            },
          },
          doctor: {
            select: {
              fullName: true,
              institutionId: true,
            },
          },
        },
      })
    : [];
  const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const institutionCache = new Map<string, Awaited<ReturnType<typeof loadInstitutionContext>>>();

  let sent = 0;
  let sentWhatsapp = 0;
  let sentSms = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of dueReminders) {
    const claim = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: "AKTIF" },
      data: {
        status: "GONDERILIYOR",
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });
    if (!claim.count) continue;

    const appointmentId = parseAppointmentId(reminder.note);
    const appointment = appointmentId ? appointmentsById.get(appointmentId) : null;
    const institutionId = reminder.patient?.institutionId;
    if (
      !appointment
      || !institutionId
      || appointment.doctor.institutionId !== institutionId
      || !appointment.smsReminder
      || appointment.startAt <= now
      || ["IPTAL", "GELMEDI"].includes(appointment.status)
    ) {
      skipped += 1;
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: "TAMAMLANDI",
          nextAttemptAt: null,
          lastError: null,
        },
      });
      continue;
    }

    let context = institutionCache.get(institutionId);
    if (!context) {
      context = await loadInstitutionContext(institutionId);
      institutionCache.set(institutionId, context);
    }
    if (!context.institution) {
      skipped += 1;
      await markFailure(reminder.id, reminder.attemptCount + 1, "Kurum bilgisi bulunamadı.");
      continue;
    }

    const dateText = appointmentDateText(appointment.startAt);
    const institutionName = context.settings?.institutionName || context.institution.name;
    const institutionPhone = context.settings?.institutionPhone || context.institution.phone || "";
    const fallbackMessage = `${institutionName}: Sayın ${appointment.patient.fullName}, ${dateText} tarihindeki randevunuzu hatırlatırız. Hekim: ${appointment.doctor.fullName}.`;
    const message = context.template
      ? renderTemplate(context.template.content, {
          institutionName,
          institutionPhone,
          patientName: appointment.patient.fullName,
          doctorName: appointment.doctor.fullName,
          dateTime: dateText,
        })
      : fallbackMessage;

    // Kanal seçimi, hasta SMS izni, bakiye rezervasyonu/iadesi ve idempotency
    // artık tek merkezden yönetiliyor (bkz. src/lib/notification-dispatch.ts).
    const result = await dispatchPatientMessage({
      institutionId,
      patientId: appointment.patient.id,
      eventType: "APPOINTMENT_REMINDER",
      purpose: "SERVICE",
      templateCode: "HATIRLATMA",
      message,
      idempotencyKey: `appt-reminder:${reminder.id}`,
      whatsappTemplate: {
        bodyParameters: [appointment.patient.fullName, dateText, appointment.doctor.fullName],
      },
    });

    if (result.success) {
      sent += 1;
      if (result.channel === "WHATSAPP") sentWhatsapp += 1;
      else sentSms += 1;
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: "TAMAMLANDI",
          nextAttemptAt: null,
          lastChannel: result.channel,
          lastError: result.providerMessageId ? `Sağlayıcı mesaj kimliği: ${result.providerMessageId}` : null,
        },
      });
    } else if (result.suppressed) {
      // İzin yok / kurum kapatmış / bakiye yetersiz — tekrar denemek sonucu
      // değiştirmeyeceği için doğrudan tamamlandı sayılır (dead-letter'a düşmez).
      skipped += 1;
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "TAMAMLANDI", nextAttemptAt: null, lastError: result.reason || null },
      });
    } else {
      failed += 1;
      await markFailure(
        reminder.id,
        reminder.attemptCount + 1,
        result.error || "Etkin bir bildirim kanalı bulunamadı.",
      );
    }
  }

  return {
    processed: dueReminders.length,
    sent,
    sentWhatsapp,
    sentSms,
    skipped,
    failed,
  };
}

async function loadInstitutionContext(institutionId: string) {
  const [institution, settings, template] = await Promise.all([
    prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, phone: true, smsBalance: true, whatsappEnabled: true },
    }),
    prisma.setting.findUnique({ where: { institutionId } }),
    resolveSmsTemplate(institutionId, "HATIRLATMA"),
  ]);
  return { institution, settings, template };
}

async function markFailure(reminderId: string, attemptCount: number, error: string) {
  const finalFailure = attemptCount >= MAX_ATTEMPTS;
  await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      status: finalFailure ? "BASARISIZ" : "AKTIF",
      nextAttemptAt: finalFailure ? null : new Date(Date.now() + RETRY_DELAY_MS),
      lastChannel: null,
      lastError: error.slice(0, 1000),
    },
  });
}
