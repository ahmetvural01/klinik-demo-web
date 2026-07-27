import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";
import { findDoctorBlockConflict } from "@/lib/doctor-block-conflict";
import { getDailySchedules, checkWorkingHoursInterval } from "@/lib/working-hours";
import { checkDoctorWorkingHoursInterval } from "@/lib/working-hours-core";
import { turkeyDayBeforeStartUtc } from "@/lib/tz";

const APPT_REMINDER_PREFIX = "[APPT_REMINDER]";

async function syncAppointmentReminder(appointment: {
  id: string;
  patientId: string;
  startAt: Date;
  smsReminder: boolean;
  status: string;
}) {
  const note = `${APPT_REMINDER_PREFIX}:${appointment.id}`;

  if (!appointment.smsReminder || ["IPTAL", "GELMEDI"].includes(appointment.status)) {
    await prisma.reminder.updateMany({
      where: { note, status: "AKTIF", planId: null },
      data: { status: "TAMAMLANDI" },
    });
    return;
  }

  const reminderDate = turkeyDayBeforeStartUtc(appointment.startAt);

  const existing = await prisma.reminder.findFirst({
    where: { note, planId: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.reminder.update({
      where: { id: existing.id },
      data: { patientId: appointment.patientId, reminderDate, status: "AKTIF" },
    });
    return;
  }

  await prisma.reminder.create({
    data: {
      patientId: appointment.patientId,
      note,
      reminderDate,
      status: "AKTIF",
    },
  });
}

type Params = { params: Promise<{ id: string }> };

async function isEligibleAppointmentDoctor(doctorId: string, institutionId: string | null | undefined, role: string) {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: {
      isActive: true,
      role: true,
      institutionId: true,
      fullName: true,
      profile: { select: { hideAsDoctor: true, workStart: true, workEnd: true } },
    },
  });

  if (!doctor || !doctor.isActive) return null;
  if (role !== "SUPERADMIN" && doctor.institutionId !== institutionId) return null;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role)) return doctor;
  if (doctor.role === "YONETICI" && !doctor.profile?.hideAsDoctor) return doctor;
  return null;
}

function appointmentTenantWhere(id: string, role: string, institutionId: string | null | undefined) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { patient: { institutionId } } : {}),
  };
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  ONAYLANDI: "Onaylandı",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function fmtStatus(v: string): string {
  return APPOINTMENT_STATUS_LABELS[v] || v;
}

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const appointment = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    include: { patient: true, doctor: { select: { id: true, fullName: true } } }
  });

  if (!appointment) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await request.json();

  const existing = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    include: { patient: true, doctor: { select: { id: true, fullName: true } } }
  });

  if (!existing) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  const keys = Object.keys(body);

  // Sadece status / note güncellemesi için partial update destekle
  if (keys.length > 0 && keys.every((key) => ["status", "note"].includes(key))) {
    const appointment = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      },
      include: { patient: true, doctor: { select: { id: true, fullName: true } } }
    });

    try {
      await syncAppointmentReminder({
        id: appointment.id,
        patientId: appointment.patientId,
        startAt: appointment.startAt,
        smsReminder: appointment.smsReminder,
        status: appointment.status,
      });
    } catch {
      // reminder senkron hatası update akışını kırmamalı.
    }

    const beforeParts: string[] = [];
    const afterParts: string[] = [];
    if (typeof body.status === "string" && existing.status !== body.status) {
      beforeParts.push(`Durum: ${fmtStatus(existing.status)}`);
      afterParts.push(`Durum: ${fmtStatus(body.status)}`);
    }
    if (typeof body.note === "string" && fmt(existing.note) !== fmt(body.note)) {
      beforeParts.push(`Not: ${fmt(existing.note)}`);
      afterParts.push(`Not: ${fmt(body.note)}`);
    }

    const action = typeof body.status === "string" && keys.length === 1 ? "APPOINTMENT_STATUS" : "APPOINTMENT_UPDATE";
    const detail = [
      `${auth.user.fullName || "Personel"} tarafından ${appointment.patient.fullName} randevusu güncellendi.`,
      `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
      `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    ].join("\n");

    await writeAudit(auth.user.id, action, detail);
    return NextResponse.json(appointment);
  }

  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi" }, { status: 400 });
  }

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId, auth.user.institutionId, auth.user.role);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Seçilen personel randevu doktoru olarak kullanılamaz." }, { status: 400 });
  }

  const newStart = new Date(parsed.data.startAt);
  const newEnd   = new Date(parsed.data.endAt);

  if (newStart >= newEnd) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır." }, { status: 400 });
  }

  // Çakışma kontrolü — saat/doktor değişiyorsa yeniden kontrol
  const timeChanged   = parsed.data.startAt !== existing.startAt.toISOString() || parsed.data.endAt !== existing.endAt.toISOString();
  const doctorChanged = parsed.data.doctorId !== existing.doctorId;

  if (timeChanged && newStart.getTime() <= Date.now()) {
    return NextResponse.json({ message: "Randevu geçmiş bir tarih veya saate taşınamaz." }, { status: 400 });
  }

  if (timeChanged) {
    const dailySchedules = await getDailySchedules(auth.user.institutionId);
    const workingHoursError = checkWorkingHoursInterval(newStart, newEnd, dailySchedules);
    if (workingHoursError) {
      return NextResponse.json({ message: workingHoursError }, { status: 400 });
    }
  }
  if (timeChanged || doctorChanged) {
    const doctorHoursError = checkDoctorWorkingHoursInterval(
      newStart,
      newEnd,
      eligibleDoctor.profile?.workStart,
      eligibleDoctor.profile?.workEnd,
      eligibleDoctor.fullName
    );
    if (doctorHoursError) {
      return NextResponse.json({ message: doctorHoursError }, { status: 400 });
    }
  }

  if (timeChanged || doctorChanged) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: params.id },
        doctorId: parsed.data.doctorId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (conflict) {
      const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      return NextResponse.json({
        message: `Bu doktorun ${cs}–${ce} arası randevusu mevcut (${conflict.patient?.fullName ?? "—"})`,
        conflictId: conflict.id,
      }, { status: 409 });
    }

    const blockConflict = await findDoctorBlockConflict(parsed.data.doctorId, newStart, newEnd);
    if (blockConflict) {
      return NextResponse.json({
        message: `Doktorun bu saat aralığı kapalıdır (${blockConflict.startTime}–${blockConflict.endTime}${blockConflict.reason ? `: ${blockConflict.reason}` : ""})`,
      }, { status: 409 });
    }
  }

  const appointment = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      startAt: newStart,
      endAt:   newEnd,
    },
    include: { patient: true, doctor: { select: { id: true, fullName: true } } },
  });

  try {
    await syncAppointmentReminder({
      id: appointment.id,
      patientId: appointment.patientId,
      startAt: appointment.startAt,
      smsReminder: appointment.smsReminder,
      status: appointment.status,
    });
  } catch {
    // reminder senkron hatası update akışını kırmamalı.
  }

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Başlangıç", existing.startAt.toISOString(), parsed.data.startAt);
  pushDiff("Bitiş", existing.endAt.toISOString(), parsed.data.endAt);
  pushDiff("Durum", fmtStatus(existing.status), fmtStatus(parsed.data.status));
  pushDiff("Tür", existing.type, parsed.data.type);
  pushDiff("Not", existing.note, parsed.data.note);
  pushDiff("Doktor", existing.doctorId, parsed.data.doctorId);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${appointment.patient.fullName} randevusu güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "APPOINTMENT_UPDATE", detail);
  return NextResponse.json(appointment);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const existing = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    include: { patient: { select: { fullName: true } } },
  });
  if (!existing)
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });

  // Soft delete — durumu IPTAL yap (veri kaybını önler)
  await prisma.appointment.update({
    where: { id: params.id },
    data: { status: "IPTAL" },
  });

  try {
    await prisma.reminder.updateMany({
      where: { note: `${APPT_REMINDER_PREFIX}:${params.id}`, status: "AKTIF", planId: null },
      data: { status: "TAMAMLANDI" },
    });
  } catch {
    // reminder kapanış hatası cancel akışını kırmamalı.
  }

  await writeAudit(auth.user.id, "APPOINTMENT_CANCEL", `${existing.patient?.fullName ?? "—"} randevusu iptal edildi`);
  return NextResponse.json({ ok: true });
}
