import { prisma } from "@/lib/prisma";
import { appointmentConfirmUrl, ensureAppointmentConfirmToken } from "@/lib/appointment-confirm";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { operationalInstitutionWhere } from "@/lib/operational-state";
import { formatAppointmentDateTime } from "@/lib/appointment-change-notify";
import { turkeyTimeKey } from "@/lib/tz";

const APPOINTMENT_REMINDER_PREFIX = "[APPT_REMINDER]";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10 * 60 * 1000;

/**
 * Otomatik hasta mesajları (randevu hatırlatma, ödeme hatırlatma, doğum günü)
 * yalnız bu saatler arasında gönderilir — Türkiye saati, bitiş hariç.
 * Hatırlatma kaydının zamanı randevudan önceki gün 00:00'dır (bkz.
 * api/appointments → turkeyDayBeforeStartUtc); dakikalık tarama önceden onu
 * gece yarısı gönderiyordu. Pencere dışında tarama hiçbir kaydı almaz; kayıt
 * AKTIF kalır ve pencere açılınca (09:00) gider.
 */
export const PATIENT_MESSAGE_WINDOW = { start: "09:00", end: "20:00" } as const;

export function isWithinPatientMessageWindow(now: Date = new Date()) {
  const time = turkeyTimeKey(now);
  return time >= PATIENT_MESSAGE_WINDOW.start && time < PATIENT_MESSAGE_WINDOW.end;
}

type SweepOptions = {
  institutionId?: string;
  take?: number;
};

function parseAppointmentId(note: string) {
  if (!note.startsWith(`${APPOINTMENT_REMINDER_PREFIX}:`)) return null;
  return note.slice(APPOINTMENT_REMINDER_PREFIX.length + 1).trim() || null;
}

export async function runAppointmentReminderSweep(options: SweepOptions = {}) {
  const now = new Date();
  if (!isWithinPatientMessageWindow(now)) {
    return { processed: 0, sent: 0, sentWhatsapp: 0, sentSms: 0, skipped: 0, failed: 0, outsideSendWindow: true };
  }
  const take = Math.max(1, Math.min(250, options.take || 100));
  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: "AKTIF",
      planId: null,
      reminderDate: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
      note: { startsWith: APPOINTMENT_REMINDER_PREFIX },
      institution: operationalInstitutionWhere(now),
      branch: { isActive: true },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      patient: options.institutionId
        ? { institutionId: options.institutionId, archivedAt: null }
        : { institutionId: { not: "" }, archivedAt: null },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { reminderDate: "asc" }],
    take,
    select: {
      id: true,
      institutionId: true,
      branchId: true,
      patientId: true,
      note: true,
      reminderDate: true,
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
        where: {
          id: { in: appointmentIds },
          institution: operationalInstitutionWhere(now),
          branch: { isActive: true },
        },
        select: {
          id: true,
          institutionId: true,
          branchId: true,
          startAt: true,
          status: true,
          smsReminder: true,
          confirmToken: true,
          patientResponse: true,
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
      || appointment.patient.id !== reminder.patientId
      || appointment.institutionId !== reminder.institutionId
      || appointment.branchId !== reminder.branchId
      || appointment.doctor.institutionId !== institutionId
      || !appointment.smsReminder
      || appointment.startAt <= now
      || ["IPTAL", "GELMEDI", "TAMAMLANDI"].includes(appointment.status)
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

    // Randevu hatırlatma zamanından SONRA açıldıysa (aynı gün / ertesi gün
    // randevusu) ya da o arada tarihi değiştiyse hasta tarihi zaten
    // bilgilendirme/değişiklik mesajıyla yeni aldı; aynı dakikada ikinci mesaj
    // (ikinci kredi) gitmesin. Yalnız GERÇEKTEN gitmiş bir mesaj sayılır.
    const informedRecently = await prisma.smsDispatch.findFirst({
      where: {
        institutionId,
        patientId: appointment.patient.id,
        status: { in: ["SENT", "DELIVERED", "READ"] },
        sentAt: { gte: reminder.reminderDate },
        OR: [
          { idempotencyKey: `appt-info:${appointment.id}` },
          { idempotencyKey: { startsWith: `appt-change:${appointment.id}:` } },
        ],
      },
      select: { id: true },
    });
    if (informedRecently) {
      skipped += 1;
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: "TAMAMLANDI",
          nextAttemptAt: null,
          lastError: "Bilgilendirme mesajı yakın zamanda gittiği için ayrıca hatırlatma gönderilmedi.",
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

    // Bilgilendirme, değişiklik ve iptal mesajlarıyla aynı biçim ("12 Ağustos 2026 14:30");
    // önceden saniyeli "12.08.2026 14:30:00" gidiyordu.
    const dateText = formatAppointmentDateTime(appointment.startAt);
    const institutionName = context.settings?.institutionName || context.institution.name;
    const institutionPhone = context.settings?.institutionPhone || context.institution.phone || "";
    const fallbackMessage = `${institutionName}: Sayın ${appointment.patient.fullName}, ${dateText} tarihindeki randevunuzu hatırlatırız. Hekim: ${appointment.doctor.fullName}.`;
    const rendered = renderCommunicationTemplate(context.template, {
      institutionName,
      institutionPhone,
      patientName: appointment.patient.fullName,
      doctorName: appointment.doctor.fullName,
      dateTime: dateText,
    }, fallbackMessage);
    // "Geleceğim / Gelemeyeceğim" bağlantısı (hasta henüz yanıt vermediyse).
    // Gelemeyecek hastanın saati boşalır, klinik yeni randevu için arar.
    const confirmUrl = appointment.patientResponse
      ? null
      : await ensureAppointmentConfirmToken(appointment.id, appointment.confirmToken).then((token) => (token ? appointmentConfirmUrl(token) : null));
    const confirmLine = confirmUrl ? ` Onaylamak ya da iptal etmek için: ${confirmUrl}` : "";

    // Kanal seçimi, hasta SMS izni, bakiye rezervasyonu/iadesi ve idempotency
    // artık tek merkezden yönetiliyor (bkz. src/lib/notification-dispatch.ts).
    const result = await dispatchPatientMessage({
      institutionId,
      patientId: appointment.patient.id,
      eventType: "APPOINTMENT_REMINDER",
      purpose: "SERVICE",
      templateCode: "HATIRLATMA",
      message: `${rendered.smsMessage}${confirmLine}`,
      whatsappMessage: rendered.whatsappMessage ? `${rendered.whatsappMessage}${confirmLine}` : rendered.whatsappMessage,
      idempotencyKey: `appt-reminder:${reminder.id}`,
      whatsappTemplate: rendered.whatsappTemplate,
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
    outsideSendWindow: false,
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
