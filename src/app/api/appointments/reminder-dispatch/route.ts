import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { sendSms } from "@/lib/sms";

const APPT_REMINDER_PREFIX = "[APPT_REMINDER]";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

function parseAppointmentId(note: string): string | null {
  if (!note.startsWith(APPT_REMINDER_PREFIX + ":")) return null;
  const id = note.slice((APPT_REMINDER_PREFIX + ":").length).trim();
  return id || null;
}

export const POST = withApiTiming("reminder-dispatch", async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari hatirlatma dagitimi yapabilir" }, { status: 403 });
  }

  const takeRaw = request.nextUrl.searchParams.get("take");
  const take = Math.max(1, Math.min(100, Number(takeRaw || 25) || 25));
  const now = new Date();

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
  ]);

  if (!settings?.smsEnabled || !institution) {
    return NextResponse.json({ processed: 0, sent: 0, skipped: 0, failed: 0, reason: "SMS pasif veya kurum yok" });
  }

  const smsTemplate = await prisma.smsTemplate.findFirst({ where: { code: "HATIRLATMA", isActive: true } });

  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: "AKTIF",
      planId: null,
      reminderDate: { lte: now },
      note: { startsWith: APPT_REMINDER_PREFIX },
      // Baska bir kurumun hatirlatmalari bu dagitim cagrisinda hic
      // cekilmesin (once cekilip "TAMAMLANDI" olarak tuketilmesin diye) —
      // aksi halde o kurumun hatirlatmasi hic gonderilmeden kaybolur.
      patient: { institutionId: auth.user.institutionId },
    },
    orderBy: { reminderDate: "asc" },
    take,
    include: { patient: { select: { id: true, fullName: true, phone: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let balanceLeft = institution.smsBalance;

  // Döngü içinde tek tek findUnique yerine tüm randevuları tek sorguda çekip
  // id'ye göre eşleştiriyoruz (N+1 önlemi).
  const appointmentIds = [...new Set(dueReminders.map((r) => parseAppointmentId(r.note)).filter((id): id is string => Boolean(id)))];
  const appointmentsList = appointmentIds.length > 0
    ? await prisma.appointment.findMany({
        where: { id: { in: appointmentIds } },
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { fullName: true, institutionId: true } },
        },
      })
    : [];
  const appointmentsById = new Map(appointmentsList.map((a) => [a.id, a]));

  for (const reminder of dueReminders) {
    const appointmentId = parseAppointmentId(reminder.note);
    if (!appointmentId) {
      skipped += 1;
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "TAMAMLANDI" } });
      continue;
    }

    const appointment = appointmentsById.get(appointmentId);

    if (!appointment || appointment.doctor.institutionId !== auth.user.institutionId) {
      skipped += 1;
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "TAMAMLANDI" } });
      continue;
    }

    if (!appointment.smsReminder || ["IPTAL", "GELMEDI"].includes(appointment.status)) {
      skipped += 1;
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "TAMAMLANDI" } });
      continue;
    }

    const reservation = await prisma.institution.updateMany({
      where: { id: institution.id, smsBalance: { gte: 1 } },
      data: { smsBalance: { decrement: 1 } },
    });

    if (reservation.count === 0) {
      // Bakiye bitince kalanları ileride tekrar denemek için AKTIF bırak.
      break;
    }

    const dateText = new Date(appointment.startAt).toLocaleString("tr-TR");
    const institutionName = settings.institutionName || institution.name;
    const fallbackMessage = `${institutionName}: Sayın ${appointment.patient.fullName}, yarın ${dateText} tarihinde randevunuz bulunmaktadır. Doktor: ${appointment.doctor.fullName}.`;
    const message = smsTemplate
      ? renderTemplate(smsTemplate.content, {
          institutionName,
          patientName: appointment.patient.fullName,
          doctorName: appointment.doctor.fullName,
          dateTime: dateText,
        })
      : fallbackMessage;

    const sendResult = await sendSms(appointment.patient.phone, message);
    if (sendResult.success) {
      sent += 1;
      balanceLeft -= 1;
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "TAMAMLANDI" } });
      await writeAudit(
        auth.user.id,
        "SMS_REMINDER_AUTO",
        `${appointment.patient.fullName} (${appointment.patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`
      );
    } else {
      failed += 1;
      await prisma.institution.update({
        where: { id: institution.id },
        data: { smsBalance: { increment: 1 } },
      });
      // Sürekli hata döngüsü olmaması için bu kaydı tamamlandıya alıyoruz.
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "TAMAMLANDI" } });
      await writeAudit(
        auth.user.id,
        "SMS_REMINDER_AUTO_FAILED",
        `${appointment.patient.fullName} (${appointment.patient.phone}) - ${sendResult.error || sendResult.providerRaw}`
      );
    }
  }

  return NextResponse.json({
    processed: dueReminders.length,
    sent,
    skipped,
    failed,
    remainingBalance: Math.max(0, balanceLeft),
  });
});
