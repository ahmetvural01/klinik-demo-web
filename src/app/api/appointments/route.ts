import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema, formatZodError } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { turkeyDayRangeUtc, turkeyDayBeforeStartUtc } from "@/lib/tz";
import { findDoctorBlockConflict } from "@/lib/doctor-block-conflict";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";
import { getDailySchedules, checkWorkingHoursInterval } from "@/lib/working-hours";
import { checkDoctorWorkingHoursInterval } from "@/lib/working-hours-core";
import { resolveSmsTemplate } from "@/lib/sms-templates";

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
      patient: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          phoneCountryCode: true,
          whatsappOptInAt: true,
          whatsappOptOutAt: true,
        },
      },
      doctor: { select: { fullName: true } },
    },
  });
  if (!appointment || !appointment.smsInfo) return { status: "skipped", message: "Bilgilendirme SMS'i seçilmedi." };

  const [settings, institution, smsTemplate] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: params.institutionId } }),
    prisma.institution.findUnique({ where: { id: params.institutionId } }),
    resolveSmsTemplate(params.institutionId, "BILGI"),
  ]);

  if (!institution) return { status: "failed", message: "Kurum bilgisi bulunamadı." };
  if (!appointment.patient.phone) return { status: "failed", message: "Hastanın telefon numarası yok." };

  const dateText = new Date(appointment.startAt).toLocaleString("tr-TR");
  const institutionName = settings?.institutionName || institution.name;
  const institutionPhone = settings?.institutionPhone || institution.phone || "";
  const fallbackMessage = `${institutionName}: Sayın ${appointment.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}, Doktor: ${appointment.doctor.fullName}.`;
  const message = smsTemplate
    ? renderTemplate(smsTemplate.content, {
        institutionName,
        institutionPhone,
        patientName: appointment.patient.fullName,
        doctorName: appointment.doctor.fullName,
        dateTime: dateText,
      })
    : fallbackMessage;

  // Kanal seçimi (WhatsApp/SMS), hasta SMS izni, bakiye rezervasyonu/iadesi
  // ve idempotency artık tek merkezden yönetiliyor (bkz. src/lib/notification-dispatch.ts).
  const result = await dispatchPatientMessage({
    institutionId: params.institutionId,
    patientId: appointment.patient.id,
    eventType: "APPOINTMENT_INFO",
    purpose: "SERVICE",
    templateCode: "BILGI",
    message,
    idempotencyKey: `appt-info:${appointment.id}`,
    actorId: params.createdByUserId,
    whatsappTemplate: {
      bodyParameters: [appointment.patient.fullName, dateText, appointment.doctor.fullName],
    },
  });

  if (result.success) {
    await writeAudit(
      params.createdByUserId,
      result.channel === "WHATSAPP" ? "WHATSAPP_BILGI_AUTO" : "SMS_BILGI_AUTO",
      `Hasta: ${appointment.patient.id} - Kanal: ${result.channel} - ProviderMsgId: ${result.providerMessageId || "-"}`
    );
    return {
      status: "sent",
      message: result.channel === "WHATSAPP" ? "Bilgilendirme WhatsApp mesajı gönderildi." : "Bilgilendirme SMS'i gönderildi.",
    };
  }

  if (result.suppressed) {
    return { status: "skipped", message: result.reason || "Bildirim gönderilmedi." };
  }

  await writeAudit(
      params.createdByUserId,
      "SMS_BILGI_AUTO_FAILED",
      `${appointment.patient.fullName} (${appointment.patient.phone}) - ${result.error || "Bilinmeyen hata"}`
  );
  return { status: "failed", message: result.error || "Bilgilendirme SMS'i gönderilemedi." };
}

async function scheduleAppointmentReminder(appointment: { id: string; patientId: string; startAt: Date; smsReminder: boolean }) {
  // Hatırlatma kapalıysa açık reminder kaydı bırakma.
  if (!appointment.smsReminder) return;

  const reminderDate = turkeyDayBeforeStartUtc(appointment.startAt);

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
    select: {
      isActive: true,
      role: true,
      institutionId: true,
      fullName: true,
      profile: { select: { hideAsDoctor: true, workStart: true, workEnd: true } },
    },
  });

  if (!doctor || !doctor.isActive) return null;
  if (institutionId && doctor.institutionId !== institutionId) return null;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role)) return doctor;
  if (doctor.role === "YONETICI" && !doctor.profile?.hideAsDoctor) return doctor;
  return null;
}

async function isEligibleClinicUnit(clinicUnitId: string | null | undefined, institutionId?: string | null) {
  if (!clinicUnitId) return null;
  return prisma.clinicUnit.findFirst({
    where: { id: clinicUnitId, ...(institutionId ? { institutionId } : {}), isActive: true },
    select: { id: true, name: true },
  });
}

function canCreateAppointment(role: string) {
  // ASISTAN ve BANKO zaten "appointments:write" iznine sahip ve mevcut bir
  // randevuyu düzenleyebiliyordu — ama bu ayrı, daha kısıtlı liste yeni
  // randevu OLUŞTURMAYI engelliyordu. Ön büroda randevu almak tam olarak bu
  // rollerin işi olduğundan bu, izin modeliyle çelişen bir hataydı.
  return ["DOKTOR", "YONETICI", "ASISTAN", "BANKO", "ADMIN", "SUPERADMIN"].includes(role);
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
    patient: { id: string; fullName: string; phone: string | null; tcNo: string | null; hasContagiousDisease: boolean; contagiousDiseaseNote: string | null } | null;
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
        clinicUnitId: true,
        patient: { select: { id: true, fullName: true, phone: true, tcNo: true, hasContagiousDisease: true, contagiousDiseaseNote: true, whatsappOptInAt: true, whatsappOptOutAt: true } },
        doctor: { select: { id: true, fullName: true, role: true } },
        clinicUnit: { select: { id: true, name: true, code: true } },
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

  // Doktor çakışması artık sert bir engel değil, bilinçli bir onaydır — personel
  // aynı doktoru aynı saatte (ör. iki koltuk arasında geçiş yaparken) başka bir
  // hastaya da atayabilmeli. Tedavi alanı/ünite ve hasta çakışmaları ise fiziksel
  // olarak imkânsız olduğu için hâlâ kesin engellenir (bkz. kullanıcı kararı).
  const overrideDoctorConflict = body?.overrideConflict === true;

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId, auth.user.institutionId);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Seçilen personel randevu doktoru olarak kullanılamaz." }, { status: 400 });
  }

  const selectedUnit = await isEligibleClinicUnit(parsed.data.clinicUnitId, auth.user.institutionId);
  if (parsed.data.clinicUnitId && !selectedUnit) {
    return NextResponse.json({ message: "Seçilen tedavi alanı bulunamadı veya pasif durumda." }, { status: 400 });
  }

  if (auth.user.institutionId) {
    const patient = await prisma.patient.findFirst({
      where: { id: parsed.data.patientId, institutionId: auth.user.institutionId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ message: "Hasta kurum kapsamı dışında." }, { status: 403 });
    }
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt   = new Date(parsed.data.endAt);

  // Başlangıç / bitiş mantık kontrolü
  if (startAt >= endAt) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır." }, { status: 400 });
  }
  if (startAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "Geçmiş bir tarih veya saate yeni randevu oluşturulamaz." }, { status: 400 });
  }

  // ── Çalışma saatleri / tatil günü kontrolü ──────────────────────────────
  const dailySchedules = await getDailySchedules(auth.user.institutionId);
  const workingHoursError = checkWorkingHoursInterval(startAt, endAt, dailySchedules);
  if (workingHoursError) {
    return NextResponse.json({ message: workingHoursError }, { status: 400 });
  }
  const doctorHoursError = checkDoctorWorkingHoursInterval(
    startAt,
    endAt,
    eligibleDoctor.profile?.workStart,
    eligibleDoctor.profile?.workEnd,
    eligibleDoctor.fullName
  );
  if (doctorHoursError) {
    return NextResponse.json({ message: doctorHoursError }, { status: 400 });
  }

  // ── Doktor çakışma kontrolü (hızlı ön kontrol — iyi UX için) ────────────
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

  if (conflict && !overrideDoctorConflict) {
    const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return NextResponse.json({
      message: `Bu doktorun ${cs}–${ce} saatleri arası randevusu mevcut (${conflict.patient?.fullName ?? "—"}). Yine de oluşturmak istiyor musunuz?`,
      conflictId: conflict.id,
      requiresConfirmation: true,
    }, { status: 409 });
  }

  if (selectedUnit) {
    const unitConflict = await prisma.appointment.findFirst({
      where: {
        clinicUnitId: selectedUnit.id,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: endAt } }, { endAt: { gt: startAt } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (unitConflict) {
      const cs = unitConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const ce = unitConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      return NextResponse.json({
        message: `${selectedUnit.name} tedavi alanı ${cs}–${ce} saatleri arasında dolu (${unitConflict.patient?.fullName ?? "—"}).`,
        conflictId: unitConflict.id,
      }, { status: 409 });
    }
  }

  // ── Doktor bloke saati kontrolü ─────────────────────────────────────────
  const blockConflict = await findDoctorBlockConflict(parsed.data.doctorId, startAt, endAt);
  if (blockConflict) {
    return NextResponse.json({
      message: `Doktorun bu saat aralığı kapalıdır (${blockConflict.startTime}–${blockConflict.endTime}${blockConflict.reason ? `: ${blockConflict.reason}` : ""})`,
    }, { status: 409 });
  }

  // ── Aynı hasta, aynı gün çakışma kontrolü (hızlı ön kontrol) ────────────
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
    // Yukarıdaki kontroller (check) ile aşağıdaki create arasında bir yarış
    // penceresi vardı: aynı doktor/saat için iki istek eşzamanlı gelirse
    // ikisi de "boş" görüp randevu oluşturabiliyordu. Serializable izolasyon
    // altında çakışan iki eşzamanlı işlemden biri P2034 ile başarısız olur
    // (bkz. denetim raporu — çift randevu yarış koşulu).
    const appointment = await prisma.$transaction(async (tx) => {
      const doctorConflictRecheck = overrideDoctorConflict ? null : await tx.appointment.findFirst({
        where: {
          doctorId: parsed.data.doctorId,
          status: { notIn: ["IPTAL", "GELMEDI"] },
          AND: [{ startAt: { lt: endAt } }, { endAt: { gt: startAt } }],
        },
        select: { id: true },
      });
      if (doctorConflictRecheck) {
        throw new Error("DOCTOR_CONFLICT_RECHECK");
      }

      if (selectedUnit) {
        const unitConflictRecheck = await tx.appointment.findFirst({
          where: {
            clinicUnitId: selectedUnit.id,
            status: { notIn: ["IPTAL", "GELMEDI"] },
            AND: [{ startAt: { lt: endAt } }, { endAt: { gt: startAt } }],
          },
          select: { id: true },
        });
        if (unitConflictRecheck) throw new Error("CLINIC_UNIT_CONFLICT_RECHECK");
      }

      const appt = await tx.appointment.create({
        data: { ...parsed.data, clinicUnitId: selectedUnit?.id || null, startAt, endAt },
        include: { patient: true, doctor: { select: { id: true, fullName: true } }, clinicUnit: { select: { id: true, name: true, code: true } } },
      });

    // Reminder'ı transaction içinde oluştur - bir başarısızsa ikisi de rollback
    if (parsed.data.smsReminder) {
      const reminderDate = turkeyDayBeforeStartUtc(startAt);

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
  }, { isolationLevel: "Serializable" });

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

    await writeAudit(auth.user.id, "APPOINTMENT_CREATE", `${appointment.patient.fullName} için randevu${appointment.clinicUnit ? ` · Tedavi alanı: ${appointment.clinicUnit.name}` : ""}${conflict && overrideDoctorConflict ? " · Doktor çakışması onaylanarak oluşturuldu" : ""}`);
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
    if (error instanceof Error && error.message === "DOCTOR_CONFLICT_RECHECK") {
      return NextResponse.json({ message: "Bu doktor için bu saat aralığı az önce başka bir kullanıcı tarafından dolduruldu. Lütfen tekrar deneyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "CLINIC_UNIT_CONFLICT_RECHECK") {
      return NextResponse.json({ message: "Bu tedavi alanı aynı saat aralığında başka bir randevuya ayrıldı. Lütfen tekrar deneyin." }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ message: "Bu randevu aynı anda başka bir işlemle çakıştı. Lütfen tekrar deneyin." }, { status: 409 });
    }
    console.error("[appointments POST] fallback:", error);
    return NextResponse.json({ message: "Randevu oluşturulamadı" }, { status: 503 });
  }
}
