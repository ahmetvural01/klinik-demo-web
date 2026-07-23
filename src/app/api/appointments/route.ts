import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema, formatZodError } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { sendSms } from "@/lib/sms";
import { turkeyDayRangeUtc } from "@/lib/tz";
import { findDoctorBlockConflict } from "@/lib/doctor-block-conflict";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";
import { getDailySchedules, checkWithinWorkingHours } from "@/lib/working-hours";

const APPT_REMINDER_PREFIX = "[APPT_REMINDER]";

type AppointmentSmsStatus = {
  info: "sent" | "skipped" | "failed";
  infoMessage: string;
  reminder: "scheduled" | "skipped";
  reminderMessage: string;
  survey: "enabled" | "skipped";
  surveyMessage: string;
};

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

async function sendAppointmentInfoSms(params: {
  appointmentId: string;
  institutionId: string;
  createdByUserId: string;
}): Promise<{ status: AppointmentSmsStatus["info"]; message: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: {
      patient: { select: { fullName: true, phone: true } },
      doctor: { select: { fullName: true } },
    },
  });
  if (!appointment || !appointment.smsInfo) return { status: "skipped", message: "Bilgilendirme SMS'i seçilmedi." };

  const [settings, institution, smsTemplate] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: params.institutionId } }),
    prisma.institution.findUnique({ where: { id: params.institutionId } }),
    prisma.smsTemplate.findFirst({ where: { code: "BILGI", isActive: true } }),
  ]);

  if (!settings?.smsEnabled) return { status: "skipped", message: "Kurum SMS gönderimi kapalı." };
  if (!institution) return { status: "failed", message: "Kurum bilgisi bulunamadı." };
  if (!appointment.patient.phone) return { status: "failed", message: "Hastanın telefon numarası yok." };

  // Bakiyeyi atomik olarak rezerve et — düz "smsBalance <= 0" kontrolü ile ayrı bir
  // decrement arasında yarış durumu olursa bakiye eksiye düşebilir.
  const reservation = await prisma.institution.updateMany({
    where: { id: institution.id, smsBalance: { gte: 1 } },
    data: { smsBalance: { decrement: 1 } },
  });
  if (reservation.count === 0) return { status: "failed", message: "SMS bakiyesi yetersiz." };

  const dateText = new Date(appointment.startAt).toLocaleString("tr-TR");
  const institutionName = settings.institutionName || institution.name;
  const fallbackMessage = `${institutionName}: Sayın ${appointment.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}, Doktor: ${appointment.doctor.fullName}.`;
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
    await writeAudit(
      params.createdByUserId,
      "SMS_BILGI_AUTO",
      `${appointment.patient.fullName} (${appointment.patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`
    );
    return { status: "sent", message: "Bilgilendirme SMS'i gönderildi." };
  }

  // Gönderim başarısız oldu — rezerve edilen krediyi iade et, aksi halde kullanılmayan
  // bir SMS için kurum bakiyesi haksız yere düşmüş olur.
  await prisma.institution.update({
    where: { id: institution.id },
    data: { smsBalance: { increment: 1 } },
  });
  await writeAudit(
      params.createdByUserId,
      "SMS_BILGI_AUTO_FAILED",
      `${appointment.patient.fullName} (${appointment.patient.phone}) - ${sendResult.error || sendResult.providerRaw}`
  );
  return { status: "failed", message: sendResult.error || "Bilgilendirme SMS'i gönderilemedi." };
}

async function scheduleAppointmentReminder(appointment: { id: string; patientId: string; startAt: Date; smsReminder: boolean }) {
  // Hatırlatma kapalıysa açık reminder kaydı bırakma.
  if (!appointment.smsReminder) return;

  const reminderDate = new Date(appointment.startAt);
  reminderDate.setDate(reminderDate.getDate() - 1);

  const note = `${APPT_REMINDER_PREFIX}:${appointment.id}`;

  await prisma.reminder.create({
    data: {
      patientId: appointment.patientId,
      note,
      reminderDate,
      status: "AKTIF",
    },
  });
}

async function isDoctorVisibleManager(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, profile: { select: { hideAsDoctor: true } } },
  });
  if (!user) return false;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(user.role)) return true;
  if (user.role === "YONETICI") return !Boolean(user.profile?.hideAsDoctor);
  return false;
}

async function isEligibleAppointmentDoctor(doctorId: string, institutionId?: string | null) {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { isActive: true, role: true, institutionId: true, profile: { select: { hideAsDoctor: true } } },
  });

  if (!doctor || !doctor.isActive) return false;
  if (institutionId && doctor.institutionId !== institutionId) return false;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role)) return true;
  if (doctor.role === "YONETICI") return !Boolean(doctor.profile?.hideAsDoctor);
  return false;
}

function canCreateAppointment(role: string) {
  return ["DOKTOR", "YONETICI", "ADMIN", "SUPERADMIN"].includes(role);
}

export const GET = withApiTiming("appointments", async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const doctorId = request.nextUrl.searchParams.get("doctorId");
  const patientId = request.nextUrl.searchParams.get("patientId");
  const type = request.nextUrl.searchParams.get("type");

  const date = request.nextUrl.searchParams.get("date");
  const dateRange = date ? turkeyDayRangeUtc(date) : undefined;
  const dateFrom = dateRange ? dateRange.start : (from ? new Date(from) : undefined);
  const dateTo = dateRange ? dateRange.end : (to ? new Date(to) : undefined);

  let appointments: Array<{
    patient: { id: string; fullName: string; phone: string | null; tcNo: string; hasContagiousDisease: boolean; contagiousDiseaseNote: string | null } | null;
    [key: string]: unknown;
  }> = [];
  try {
    appointments = await prisma.appointment.findMany({
      where: {
        ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
        startAt: (dateFrom || dateTo) ? { gte: dateFrom, lte: dateTo } : undefined,
        doctorId: doctorId || undefined,
        patientId: patientId || undefined,
        type: type ? { equals: type as "STANDART" | "KONTROL" | "ACIL" } : undefined,
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        type: true,
        colorCode: true,
        note: true,
        smsInfo: true,
        smsReminder: true,
        smsSurvey: true,
        doctorId: true,
        patientId: true,
        patient: { select: { id: true, fullName: true, phone: true, tcNo: true, hasContagiousDisease: true, contagiousDiseaseNote: true } },
        doctor: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { startAt: "asc" },
      take: 500, // Güvenlik limiti
    });
  } catch (error) {
    console.error("[appointments GET] fallback:", error);
    return NextResponse.json({ message: "Randevular yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }

  const hidePhone = shouldHidePatientPhone(auth.user.role);
  const result = hidePhone
    ? appointments.map(a => ({
        ...a,
        patient: a.patient ? { ...a.patient, phone: null } : a.patient,
      }))
    : appointments;

  return NextResponse.json(result);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  if (!canCreateAppointment(auth.user.role)) {
    return NextResponse.json({ message: "Bu rolde randevu oluşturma yetkiniz yok." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi", errors: formatZodError(parsed.error) }, { status: 400 });
  }

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId, auth.user.institutionId);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Secilen personel randevu doktoru olarak kullanilamaz." }, { status: 400 });
  }

  if (auth.user.institutionId) {
    const patient = await prisma.patient.findFirst({
      where: { id: parsed.data.patientId, institutionId: auth.user.institutionId },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ message: "Hasta kurum kapsamı disinda" }, { status: 403 });
    }
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt   = new Date(parsed.data.endAt);

  // Başlangıç / bitiş mantık kontrolü
  if (startAt >= endAt) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır" }, { status: 400 });
  }

  // ── Çalışma saatleri / tatil günü kontrolü ──────────────────────────────
  const dailySchedules = await getDailySchedules(auth.user.institutionId);
  const workingHoursError = checkWithinWorkingHours(startAt, dailySchedules);
  if (workingHoursError) {
    return NextResponse.json({ message: workingHoursError }, { status: 400 });
  }

  // ── Doktor çakışma kontrolü ─────────────────────────────────────────────
  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId: parsed.data.doctorId,
      ...(auth.user.institutionId ? { doctor: { institutionId: auth.user.institutionId } } : {}),
      status: { notIn: ["IPTAL", "GELMEDI"] },
      AND: [
        { startAt: { lt: endAt } },
        { endAt:   { gt: startAt } },
      ],
    },
    select: {
      id: true, startAt: true, endAt: true,
      patient: { select: { fullName: true } },
    },
  });

  if (conflict) {
    const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return NextResponse.json({
      message: `Bu doktorun ${cs}–${ce} saatleri arası randevusu mevcut (${conflict.patient?.fullName ?? "—"})`,
      conflictId: conflict.id,
    }, { status: 409 });
  }

  // ── Doktor bloke saati kontrolü ─────────────────────────────────────────
  const blockConflict = await findDoctorBlockConflict(parsed.data.doctorId, startAt, endAt);
  if (blockConflict) {
    return NextResponse.json({
      message: `Doktor bu saatte bloke edilmiş (${blockConflict.startTime}–${blockConflict.endTime}${blockConflict.reason ? `: ${blockConflict.reason}` : ""})`,
    }, { status: 409 });
  }

  // ── Aynı hasta, aynı gün çakışma kontrolü ──────────────────────────────
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId: parsed.data.patientId,
      ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
      status: { notIn: ["IPTAL", "GELMEDI"] },
      AND: [
        { startAt: { lt: endAt } },
        { endAt:   { gt: startAt } },
      ],
    },
    select: { id: true, startAt: true, endAt: true },
  });

  if (patientConflict) {
    const cs = patientConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const ce = patientConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return NextResponse.json({
      message: `Bu hastanın ${cs}–${ce} saatleri arası başka bir randevusu mevcut`,
      conflictId: patientConflict.id,
    }, { status: 409 });
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: { ...parsed.data, startAt, endAt },
        include: { patient: true, doctor: { select: { id: true, fullName: true } } },
      });

    // Reminder'ı transaction içinde oluştur - bir başarısızsa ikisi de rollback
    if (parsed.data.smsReminder) {
      const reminderDate = new Date(startAt);
      reminderDate.setDate(reminderDate.getDate() - 1);
      
      await tx.reminder.create({
        data: {
          patientId: appt.patientId,
          note: `[APPT_REMINDER]:${appt.id}`,
          reminderDate,
          status: "AKTIF",
        },
      });
    }

    return appt;
  });

    let infoSms = { status: "skipped" as AppointmentSmsStatus["info"], message: "Bilgilendirme SMS'i seçilmedi." };
    if (auth.user.institutionId) {
      try {
        infoSms = await sendAppointmentInfoSms({
          appointmentId: appointment.id,
          institutionId: auth.user.institutionId,
          createdByUserId: auth.user.id,
        });
      } catch (error) {
        infoSms = { status: "failed", message: error instanceof Error ? error.message : "Bilgilendirme SMS'i gönderilemedi." };
        // SMS hatası randevu oluşturmayı kırmamalı.
      }
    }

    await writeAudit(auth.user.id, "APPOINTMENT_CREATE", `${appointment.patient.fullName} icin randevu`);
    return NextResponse.json({
      ...appointment,
      smsStatus: {
        info: infoSms.status,
        infoMessage: infoSms.message,
        reminder: parsed.data.smsReminder ? "scheduled" : "skipped",
        reminderMessage: parsed.data.smsReminder ? "Hatırlatma kaydı oluşturuldu." : "Hatırlatma SMS'i seçilmedi.",
        survey: parsed.data.smsSurvey ? "enabled" : "skipped",
        surveyMessage: parsed.data.smsSurvey ? "Değerlendirme SMS tercihi randevuya işlendi." : "Değerlendirme SMS'i seçilmedi.",
      } satisfies AppointmentSmsStatus,
    }, { status: 201 });
  } catch (error) {
    console.error("[appointments POST] fallback:", error);
    return NextResponse.json({ message: "Randevu oluşturulamadı" }, { status: 503 });
  }
}
