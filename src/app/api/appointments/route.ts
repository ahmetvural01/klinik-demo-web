import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";
import { sendSms } from "@/lib/sms";

const APPT_REMINDER_PREFIX = "[APPT_REMINDER]";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

async function sendAppointmentInfoSms(params: {
  appointmentId: string;
  institutionId: string;
  createdByUserId: string;
}) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: {
      patient: { select: { fullName: true, phone: true } },
      doctor: { select: { fullName: true } },
    },
  });
  if (!appointment || !appointment.smsInfo) return;

  const [settings, institution, smsTemplate] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: params.institutionId } }),
    prisma.institution.findUnique({ where: { id: params.institutionId } }),
    prisma.smsTemplate.findFirst({ where: { code: "BILGI", isActive: true } }),
  ]);

  if (!settings?.smsEnabled || !institution || institution.smsBalance <= 0) return;

  const dateText = new Date(appointment.startAt).toLocaleString("tr-TR");
  const institutionName = settings.institutionName || institution.name;
  const fallbackMessage = `${institutionName}: Sayin ${appointment.patient.fullName}, randevunuz olusturuldu. Tarih: ${dateText}, Doktor: ${appointment.doctor.fullName}.`;
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
    await prisma.institution.update({
      where: { id: institution.id },
      data: { smsBalance: { decrement: 1 } },
    });
    await writeAudit(
      params.createdByUserId,
      "SMS_BILGI_AUTO",
      `${appointment.patient.fullName} (${appointment.patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`
    );
  } else {
    await writeAudit(
      params.createdByUserId,
      "SMS_BILGI_AUTO_FAILED",
      `${appointment.patient.fullName} (${appointment.patient.phone}) - ${sendResult.error || sendResult.providerRaw}`
    );
  }
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

async function isEligibleAppointmentDoctor(doctorId: string) {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { isActive: true, role: true, profile: { select: { hideAsDoctor: true } } },
  });

  if (!doctor || !doctor.isActive) return false;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role)) return true;
  if (doctor.role === "YONETICI") return !Boolean(doctor.profile?.hideAsDoctor);
  return false;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const doctorId = request.nextUrl.searchParams.get("doctorId");
  const patientId = request.nextUrl.searchParams.get("patientId");
  const type = request.nextUrl.searchParams.get("type");

  const date = request.nextUrl.searchParams.get("date");
  const dateFrom = date ? new Date(date + "T00:00:00.000Z") : (from ? new Date(from) : undefined);
  const dateTo = date ? new Date(date + "T23:59:59.999Z") : (to ? new Date(to) : undefined);

  const appointments = await prisma.appointment.findMany({
    where: {
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
      patient: { select: { id: true, fullName: true, phone: true, tcNo: true } },
      doctor: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: { startAt: "asc" },
    take: 500, // Güvenlik limiti
  });

  const hidePhone = auth.user.role === "DOKTOR" || auth.user.role === "ASISTAN";
  const result = hidePhone
    ? appointments.map(a => ({
        ...a,
        patient: a.patient ? { ...a.patient, phone: null } : a.patient,
      }))
    : appointments;

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const canCreate = await isDoctorVisibleManager(auth.user.id);
  if (!canCreate) {
    return NextResponse.json({ message: "Randevu sadece doktorlar tarafindan olusturulabilir." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi" }, { status: 400 });
  }

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Secilen personel randevu doktoru olarak kullanilamaz." }, { status: 400 });
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt   = new Date(parsed.data.endAt);

  // Başlangıç / bitiş mantık kontrolü
  if (startAt >= endAt) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır" }, { status: 400 });
  }

  // ── Doktor çakışma kontrolü ─────────────────────────────────────────────
  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId: parsed.data.doctorId,
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

  // ── Aynı hasta, aynı gün çakışma kontrolü ──────────────────────────────
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId: parsed.data.patientId,
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

  const appointment = await prisma.appointment.create({
    data: { ...parsed.data, startAt, endAt },
    include: { patient: true, doctor: true },
  });

  if (auth.user.institutionId) {
    try {
      await sendAppointmentInfoSms({
        appointmentId: appointment.id,
        institutionId: auth.user.institutionId,
        createdByUserId: auth.user.id,
      });
    } catch {
      // SMS hatası randevu oluşturmayı kırmamalı.
    }
  }

  try {
    await scheduleAppointmentReminder({
      id: appointment.id,
      patientId: appointment.patientId,
      startAt: appointment.startAt,
      smsReminder: appointment.smsReminder,
    });
  } catch {
    // Reminder kaydı hatası randevu oluşturmayı kırmamalı.
  }

  await writeAudit(auth.user.id, "APPOINTMENT_CREATE", `${appointment.patient.fullName} icin randevu`);
  return NextResponse.json(appointment, { status: 201 });
}
