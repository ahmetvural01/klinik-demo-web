import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_STATUS_VALUES, appointmentSchema } from "@/lib/validators";
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

  if (!appointment.smsReminder || ["IPTAL", "GELMEDI", "TAMAMLANDI"].includes(appointment.status)) {
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

async function isEligibleClinicUnit(clinicUnitId: string | null | undefined, institutionId: string | null | undefined, role: string) {
  if (!clinicUnitId) return null;
  return prisma.clinicUnit.findFirst({
    where: { id: clinicUnitId, ...(role !== "SUPERADMIN" && institutionId ? { institutionId } : {}), isActive: true },
    select: { id: true, name: true },
  });
}

function appointmentTenantWhere(id: string, role: string, institutionId: string | null | undefined) {
  return {
    id,
    ...(role !== "SUPERADMIN" && institutionId ? { patient: { institutionId } } : {}),
  };
}

// Bu etiketler ekranda gösterilen anlamla birebir aynıdır (bkz.
// src/lib/appointment-status.ts): ham GELDI artık "Bekliyor" (hasta geldi,
// bekleme salonunda) anlamına gelir, ham BEKLIYOR ise henüz check-in
// yapılmamış "Planlandı" durumudur.
const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Planlandı",
  ONAYLANDI: "Onaylandı",
  GELDI: "Bekliyor",
  TAMAMLANDI: "Tamamlandı",
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
    include: { patient: true, doctor: { select: { id: true, fullName: true } }, clinicUnit: { select: { id: true, name: true, code: true } } }
  });

  if (!appointment) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const body = await request.json();
  const keys = Object.keys(body);
  const isPartialStatusOrNote = keys.length > 0 && keys.every((key) => ["status", "note"].includes(key));
  const permission = isPartialStatusOrNote && body.status === "IPTAL"
    ? "appointments:approve"
    : "appointments:write";
  const auth = await requireAuth(permission);
  if (auth.error) return auth.error;

  const existing = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    include: { patient: true, doctor: { select: { id: true, fullName: true } }, clinicUnit: { select: { id: true, name: true, code: true } } }
  });

  if (!existing) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  // Sadece status / note güncellemesi için partial update destekle
  if (isPartialStatusOrNote) {
    if (typeof body.status === "string" && !APPOINTMENT_STATUS_VALUES.includes(body.status as typeof APPOINTMENT_STATUS_VALUES[number])) {
      return NextResponse.json({ message: "Geçersiz randevu durumu" }, { status: 400 });
    }
    const appointment = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      },
      include: { patient: true, doctor: { select: { id: true, fullName: true } }, clinicUnit: { select: { id: true, name: true, code: true } } }
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

  // Doktor çakışması artık sert bir engel değil, bilinçli bir onaydır (bkz.
  // POST /api/appointments üzerindeki aynı not) — tedavi alanı/hasta
  // çakışmaları fiziksel olarak imkânsız olduğu için hâlâ kesin engellenir.
  const overrideDoctorConflict = body?.overrideConflict === true;

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId, auth.user.institutionId, auth.user.role);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Seçilen personel randevu doktoru olarak kullanılamaz." }, { status: 400 });
  }

  // Eski istemciler tam randevu gövdesini üniteden habersiz gönderebilir.
  // Alan gövdede hiç yoksa mevcut bağlantıyı koru; yalnızca açıkça null/
  // değer gönderildiğinde üniteyi kaldır veya değiştir.
  const hasClinicUnitInput = Object.prototype.hasOwnProperty.call(body, "clinicUnitId");
  const requestedClinicUnitId = hasClinicUnitInput ? (parsed.data.clinicUnitId || null) : (existing.clinicUnitId || null);
  let selectedUnit = await isEligibleClinicUnit(requestedClinicUnitId, auth.user.institutionId, auth.user.role);
  // Ünite sonradan pasife alınmış olsa bile, ona bağlı eski randevunun saat
  // veya not düzeltmesi engellenmez. Ancak pasif ünite yeni randevuya ya da
  // başka bir randevuya atanamaz.
  if (!selectedUnit && requestedClinicUnitId && requestedClinicUnitId === existing.clinicUnitId) {
    selectedUnit = await prisma.clinicUnit.findFirst({
      where: { id: requestedClinicUnitId, ...(auth.user.role !== "SUPERADMIN" && auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
      select: { id: true, name: true },
    });
  }
  if (requestedClinicUnitId && !selectedUnit) {
    return NextResponse.json({ message: "Seçilen tedavi alanı bulunamadı veya pasif durumda." }, { status: 400 });
  }

  const newStart = new Date(parsed.data.startAt);
  const newEnd   = new Date(parsed.data.endAt);

  if (newStart >= newEnd) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır." }, { status: 400 });
  }

  // Çakışma kontrolü — saat/doktor değişiyorsa yeniden kontrol
  const timeChanged   = parsed.data.startAt !== existing.startAt.toISOString() || parsed.data.endAt !== existing.endAt.toISOString();
  const doctorChanged = parsed.data.doctorId !== existing.doctorId;
  const unitChanged = requestedClinicUnitId !== (existing.clinicUnitId || null);
  const patientChanged = parsed.data.patientId !== existing.patientId;
  const inactiveStatuses = new Set(["IPTAL", "GELMEDI"]);
  const existingIsActive = !inactiveStatuses.has(existing.status);
  const targetIsActive = !inactiveStatuses.has(parsed.data.status);
  const reactivating = !existingIsActive && targetIsActive;

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
  if (targetIsActive && (timeChanged || doctorChanged || reactivating)) {
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

  if (targetIsActive && selectedUnit && (timeChanged || unitChanged || reactivating)) {
    const unitConflict = await prisma.appointment.findFirst({
      where: {
        id: { not: params.id },
        clinicUnitId: selectedUnit.id,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (unitConflict) {
      const cs = unitConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const ce = unitConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      return NextResponse.json({ message: `${selectedUnit.name} tedavi alanı ${cs}–${ce} saatleri arasında dolu (${unitConflict.patient?.fullName ?? "—"}).`, conflictId: unitConflict.id }, { status: 409 });
    }
  }

  if (targetIsActive && (timeChanged || patientChanged || reactivating)) {
    const patientConflict = await prisma.appointment.findFirst({
      where: {
        id: { not: params.id },
        patientId: parsed.data.patientId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
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
  }

  let conflictOverridden = false;
  const doctorConflictCheckNeeded = targetIsActive && (timeChanged || doctorChanged || reactivating);
  if (doctorConflictCheckNeeded && !overrideDoctorConflict) {
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
        message: `Bu doktorun ${cs}–${ce} arası randevusu mevcut (${conflict.patient?.fullName ?? "—"}). Yine de taşımak istiyor musunuz?`,
        conflictId: conflict.id,
        requiresConfirmation: true,
      }, { status: 409 });
    }
  } else if (doctorConflictCheckNeeded && overrideDoctorConflict) {
    conflictOverridden = true;
  }

  // Doktor bloke saati (izin/mola vb.) çakışma onayından bağımsız — fiziksel
  // olarak doktor o saatte hiç müsait değildir, override edilemez.
  if (targetIsActive && (timeChanged || doctorChanged || reactivating)) {
    const blockConflict = await findDoctorBlockConflict(parsed.data.doctorId, newStart, newEnd);
    if (blockConflict) {
      return NextResponse.json({
        message: `Doktorun bu saat aralığı kapalıdır (${blockConflict.startTime}–${blockConflict.endTime}${blockConflict.reason ? `: ${blockConflict.reason}` : ""})`,
      }, { status: 409 });
    }
  }

  let appointment;
  try {
    // Ön kontroller ile update arasındaki kısa yarış penceresini kapat: aynı
    // anda iki kullanıcı randevuyu taşıdığında hem doktor hem seçili ünite
    // tekrar sorgulanır. Böylece ekran boş görünse bile çift atama oluşmaz.
    appointment = await prisma.$transaction(async (tx) => {
      if (targetIsActive && (timeChanged || doctorChanged || reactivating)) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${parsed.data.doctorId} FOR UPDATE`;
        const blockConflictRecheck = await findDoctorBlockConflict(parsed.data.doctorId, newStart, newEnd, tx);
        if (blockConflictRecheck) throw new Error("DOCTOR_BLOCK_RECHECK");
      }
      if (doctorConflictCheckNeeded && !overrideDoctorConflict) {
        const doctorConflictRecheck = await tx.appointment.findFirst({
          where: {
            id: { not: params.id },
            doctorId: parsed.data.doctorId,
            status: { notIn: ["IPTAL", "GELMEDI"] },
            AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
          },
          select: { id: true },
        });
        if (doctorConflictRecheck) throw new Error("DOCTOR_CONFLICT_RECHECK");
      }
      if (targetIsActive && selectedUnit && (timeChanged || unitChanged || reactivating)) {
        const unitConflictRecheck = await tx.appointment.findFirst({
          where: {
            id: { not: params.id },
            clinicUnitId: selectedUnit.id,
            status: { notIn: ["IPTAL", "GELMEDI"] },
            AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
          },
          select: { id: true },
        });
        if (unitConflictRecheck) throw new Error("CLINIC_UNIT_CONFLICT_RECHECK");
      }
      if (targetIsActive && (timeChanged || patientChanged || reactivating)) {
        const patientConflictRecheck = await tx.appointment.findFirst({
          where: {
            id: { not: params.id },
            patientId: parsed.data.patientId,
            status: { notIn: ["IPTAL", "GELMEDI"] },
            AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
          },
          select: { id: true },
        });
        if (patientConflictRecheck) throw new Error("PATIENT_CONFLICT_RECHECK");
      }
      return tx.appointment.update({
        where: { id: params.id },
        data: {
          ...parsed.data,
          clinicUnitId: requestedClinicUnitId,
          startAt: newStart,
          endAt: newEnd,
          // İletişim tercihleri (smsInfo/smsReminder/smsSurvey) yalnızca randevu
          // oluşturulurken hastanın onayıyla belirlenir. Genel düzenleme/taşıma
          // isteği (arayüzde bu üç alan için ayrı bir onay adımı yok, formlar
          // sabit değer gönderiyor) bu tercihleri asla sessizce değiştirmemeli —
          // bkz. denetim raporu: düzenleme/sürükle-taşıma "Hatırlatma SMS"i
          // farkında olmadan kapatıyordu.
          smsInfo: existing.smsInfo,
          smsReminder: existing.smsReminder,
          smsSurvey: existing.smsSurvey,
        },
        include: { patient: true, doctor: { select: { id: true, fullName: true } }, clinicUnit: { select: { id: true, name: true, code: true } } },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && error.message === "DOCTOR_BLOCK_RECHECK") {
      return NextResponse.json({ message: "Doktorun bu saat aralığı az önce kapatıldı. Takvimi yenileyip başka bir saat seçin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DOCTOR_CONFLICT_RECHECK") {
      return NextResponse.json({ message: "Bu doktor için bu saat aralığı az önce başka bir kullanıcı tarafından dolduruldu. Lütfen tekrar deneyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "CLINIC_UNIT_CONFLICT_RECHECK") {
      return NextResponse.json({ message: "Bu tedavi alanı aynı saat aralığında başka bir randevuya ayrıldı. Lütfen tekrar deneyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PATIENT_CONFLICT_RECHECK") {
      return NextResponse.json({ message: "Bu hastanın aynı saat aralığında başka bir randevusu az önce oluşturuldu. Lütfen tekrar deneyin." }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ message: "Randevu aynı anda başka bir işlemle çakıştı. Lütfen tekrar deneyin." }, { status: 409 });
    }
    return NextResponse.json({ message: "Randevu güncellenemedi." }, { status: 503 });
  }

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
  pushDiff("Tedavi alanı", existing.clinicUnit?.name, appointment.clinicUnit?.name);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${appointment.patient.fullName} randevusu güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    ...(conflictOverridden ? ["Doktor çakışması onaylanarak taşındı."] : []),
  ].join("\n");

  await writeAudit(auth.user.id, "APPOINTMENT_UPDATE", detail);
  return NextResponse.json(appointment);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("appointments:delete");
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
