import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_STATUS_VALUES, appointmentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";
import { findDoctorBlockConflict } from "@/lib/doctor-block-conflict";
import { getDailySchedules, checkWorkingHoursInterval } from "@/lib/working-hours";
import { checkDoctorWorkingHoursInterval } from "@/lib/working-hours-core";
import { turkeyDayBeforeStartUtc } from "@/lib/tz";
import { hasBranchPermission, requireActiveBranch, type BranchContext } from "@/lib/branch-context";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { can } from "@/lib/rbac";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { formatAppointmentDateTime, notifyAppointmentCancelled, notifyAppointmentChanged } from "@/lib/appointment-change-notify";
import { maskPatientName } from "@/lib/audit-mask";

const APPT_REMINDER_PREFIX = "[APPT_REMINDER]";

// Yanıtta hastanın yalnız randevu ekranlarının gösterdiği alanları. Önceden
// tekil uç tam hasta kaydını (notlar, sağlık geçmişi, adres) randevu okuma
// yetkisiyle döndürüyordu (KVKK: veri en aza indirme). Telefon/TC ayrıca
// maskForRole ile rol kuralına göre gizlenir.
const PATIENT_SAFE_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  tcNo: true,
  hasContagiousDisease: true,
  contagiousDiseaseNote: true,
} as const;

const APPOINTMENT_INCLUDE = {
  patient: { select: PATIENT_SAFE_SELECT },
  doctor: { select: { id: true, fullName: true } },
  clinicUnit: { select: { id: true, name: true, code: true } },
} as const;

const INACTIVE_STATUSES = new Set(["IPTAL", "GELMEDI"]);

function clockTR(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

/**
 * İptal/Gelmedi randevu yeniden açılırken (kısmi durum güncellemesi) yeni
 * randevudaki kuralların aynısı: hasta, koltuk / oda ve doktorun kapalı
 * zamanı kesin engel; doktorun başka randevusu onayla geçilebilir. Önceden
 * "Yeniden aç" hiçbir kontrol yapmıyor, aynı hasta aynı saatte iki doktora
 * randevulu kalabiliyordu (canlı test H3). Yalnız gelecekteki randevular için
 * çalışır — geçmiş randevuyu yeniden açmak kayıt düzeltmesidir.
 */
async function reactivationConflict(params: {
  appointment: { id: string; patientId: string; doctorId: string; clinicUnitId: string | null; startAt: Date; endAt: Date };
  branchId: string;
  overrideDoctorConflict: boolean;
}) {
  const { appointment, branchId, overrideDoctorConflict } = params;
  if (appointment.startAt.getTime() <= Date.now()) return null;
  const overlap = { AND: [{ startAt: { lt: appointment.endAt } }, { endAt: { gt: appointment.startAt } }] };
  const activeOthers = { id: { not: appointment.id }, branchId, status: { notIn: ["IPTAL" as const, "GELMEDI" as const] }, ...overlap };

  const patientConflict = await prisma.appointment.findFirst({
    where: { ...activeOthers, patientId: appointment.patientId },
    select: { startAt: true, endAt: true },
  });
  if (patientConflict) {
    return NextResponse.json({
      message: `Bu hastanın ${clockTR(patientConflict.startAt)}–${clockTR(patientConflict.endAt)} saatleri arası başka bir randevusu var; randevu yeniden açılamaz.`,
    }, { status: 409 });
  }
  if (appointment.clinicUnitId) {
    const unitConflict = await prisma.appointment.findFirst({
      where: { ...activeOthers, clinicUnitId: appointment.clinicUnitId },
      select: { startAt: true, endAt: true },
    });
    if (unitConflict) {
      return NextResponse.json({
        message: `Koltuk / oda ${clockTR(unitConflict.startAt)}–${clockTR(unitConflict.endAt)} saatleri arasında dolu; randevu yeniden açılamaz.`,
      }, { status: 409 });
    }
  }
  const blockConflict = await findDoctorBlockConflict(appointment.doctorId, branchId, appointment.startAt, appointment.endAt);
  if (blockConflict) {
    return NextResponse.json({
      message: `Doktorun bu saat aralığı kapalı (${blockConflict.startTime}–${blockConflict.endTime}${blockConflict.reason ? `: ${blockConflict.reason}` : ""}); randevu yeniden açılamaz.`,
    }, { status: 409 });
  }
  if (!overrideDoctorConflict) {
    const doctorConflict = await prisma.appointment.findFirst({
      where: { ...activeOthers, doctorId: appointment.doctorId },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (doctorConflict) {
      return NextResponse.json({
        message: `Bu doktorun ${clockTR(doctorConflict.startAt)}–${clockTR(doctorConflict.endAt)} arası başka randevusu var (${doctorConflict.patient?.fullName ?? "—"}). Yine de yeniden açılsın mı?`,
        conflictId: doctorConflict.id,
        requiresConfirmation: true,
      }, { status: 409 });
    }
  }
  return null;
}

function appointmentStatusTransitionError(current: string, next: string, startAt: Date) {
  if (current === "IPTAL" && !["IPTAL", "BEKLIYOR"].includes(next)) {
    return "İptal edilmiş randevu önce Planlandı durumuna alınmalıdır.";
  }
  if (next === "GELMEDI" && startAt.getTime() > Date.now()) {
    return "Randevu saati gelmeden Gelmedi olarak işaretlenemez.";
  }
  return null;
}

async function syncAppointmentReminder(appointment: {
  id: string;
  institutionId: string;
  branchId: string;
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
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: appointment.institutionId,
          branchId: appointment.branchId,
        },
      },
      data: {
        institutionId: appointment.institutionId,
        branchId: appointment.branchId,
        patientId: appointment.patientId,
        reminderDate,
        status: "AKTIF",
      },
    });
    return;
  }

  await prisma.reminder.create({
    data: {
      institutionId: appointment.institutionId,
      branchId: appointment.branchId,
      patientId: appointment.patientId,
      note,
      reminderDate,
      status: "AKTIF",
    },
  });
}

type Params = { params: Promise<{ id: string }> };

// Liste ucundaki (/api/appointments) gizleme kuralının aynısı: telefon görme
// yetkisi olmayan kişiye tekil randevu yanıtında da hasta telefonu/TC'si
// gönderilmez (önceden tekil uç tüm hasta kaydını döndürüyordu). Kural rol +
// kişinin şube izinleri: Şube erişimi'nden telefonu kapatılan kişi de görmez.
async function maskForRole<T extends { patient?: { phone?: string | null; tcNo?: string | null } | null }>(appointment: T, user: Parameters<typeof shouldHidePatientPhoneForUser>[0]): Promise<T> {
  if (!appointment.patient || !(await shouldHidePatientPhoneForUser(user))) return appointment;
  return { ...appointment, patient: { ...appointment.patient, phone: null, tcNo: appointment.patient.tcNo ? "***" : appointment.patient.tcNo } };
}

async function isEligibleAppointmentDoctor(doctorId: string, institutionId: string | null | undefined, branchId: string) {
  return prisma.user.findFirst({
    where: { id: doctorId, ...effectiveDoctorWhere(institutionId, branchId) },
    select: {
      isActive: true,
      role: true,
      institutionId: true,
      fullName: true,
      profile: { select: { hideAsDoctor: true, workStart: true, workEnd: true } },
    },
  });
}

async function isEligibleClinicUnit(clinicUnitId: string | null | undefined, institutionId: string | null | undefined, branchId: string) {
  if (!clinicUnitId) return null;
  return prisma.clinicUnit.findFirst({
    where: { id: clinicUnitId, branchId, ...(institutionId ? { institutionId } : {}), isActive: true },
    select: { id: true, name: true },
  });
}

function appointmentTenantWhere(id: string, institutionId: string | null | undefined, context: BranchContext) {
  return {
    id,
    ...(institutionId ? { institutionId } : {}),
    branchId: context.activeBranchId || "__no_accessible_branch__",
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
    where: appointmentTenantWhere(params.id, auth.user.institutionId, auth.user.branchContext),
    include: { ...APPOINTMENT_INCLUDE, branch: { select: { id: true, name: true, code: true, colorCode: true } } },
  });

  if (!appointment) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(await maskForRole(appointment, auth.user));
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const body = await request.json();
  const keys = Object.keys(body);
  // Kısmi güncelleme: yalnız durum ve/veya not (+ yeniden açmada doktor
  // çakışması onayı için overrideConflict).
  const isPartialStatusOrNote = keys.some((key) => key === "status" || key === "note")
    && keys.every((key) => ["status", "note", "overrideConflict"].includes(key));
  const isCancellation = body.status === "IPTAL";
  const permission = isCancellation
    ? "appointments:approve"
    : "appointments:write";
  const auth = await requireAuth(permission);
  if (auth.error) return auth.error;
  const changesFieldsBeyondStatus = keys.some((key) => key !== "status" && key !== "overrideConflict");
  if (
    isCancellation
    && changesFieldsBeyondStatus
    && !auth.user.ghost
    && (
      !(await can(auth.user.role as import("@prisma/client").Role, "appointments:write"))
      || !hasBranchPermission(auth.user.branchContext, "appointments:write")
    )
  ) {
    return NextResponse.json({ message: "Randevu notunu veya diğer bilgileri değiştirme yetkiniz yok." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 409 });

  const existing = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.institutionId, auth.user.branchContext),
    include: APPOINTMENT_INCLUDE,
  });

  if (!existing) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  // Sadece status / note güncellemesi için partial update destekle
  if (isPartialStatusOrNote) {
    if (typeof body.status === "string" && !APPOINTMENT_STATUS_VALUES.includes(body.status as typeof APPOINTMENT_STATUS_VALUES[number])) {
      return NextResponse.json({ message: "Geçersiz randevu durumu" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(body, "note") && (typeof body.note !== "string" || body.note.length > 5000)) {
      return NextResponse.json({ message: "Randevu notu geçersiz veya çok uzun." }, { status: 400 });
    }
    const reactivating = typeof body.status === "string"
      && INACTIVE_STATUSES.has(existing.status)
      && !INACTIVE_STATUSES.has(body.status);
    if (typeof body.status === "string") {
      const transitionError = appointmentStatusTransitionError(existing.status, body.status, existing.startAt);
      if (transitionError) return NextResponse.json({ message: transitionError }, { status: 409 });
    }
    if (reactivating) {
      const conflictResponse = await reactivationConflict({
        appointment: existing,
        branchId: activeBranch.branchId,
        overrideDoctorConflict: body.overrideConflict === true,
      });
      if (conflictResponse) return conflictResponse;
    }
    let appointment;
    try {
      appointment = await prisma.$transaction(async (tx) => {
        // Yeniden açmada hasta çakışması işlem içinde bir kez daha denetlenir
        // (ön kontrol ile güncelleme arasında aynı hastaya randevu verilmiş olabilir).
        if (reactivating && existing.startAt.getTime() > Date.now()) {
          const patientRecheck = await tx.appointment.findFirst({
            where: {
              id: { not: params.id },
              patientId: existing.patientId,
              branchId: activeBranch.branchId,
              status: { notIn: ["IPTAL", "GELMEDI"] },
              AND: [{ startAt: { lt: existing.endAt } }, { endAt: { gt: existing.startAt } }],
            },
            select: { id: true },
          });
          if (patientRecheck) throw new Error("PATIENT_CONFLICT_RECHECK");
        }
        return tx.appointment.update({
          where: { id: params.id },
          data: {
            ...(typeof body.status === "string" ? { status: body.status } : {}),
            ...(typeof body.note === "string" ? { note: body.note } : {}),
            // Yeniden açılan randevuda hastanın eski "gelemeyeceğim" yanıtı geçersizdir.
            ...(reactivating ? { patientResponse: null, patientRespondedAt: null } : {}),
          },
          include: APPOINTMENT_INCLUDE,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PATIENT_CONFLICT_RECHECK") {
        return NextResponse.json({ message: "Bu hastanın aynı saat aralığında başka bir randevusu az önce oluşturuldu; randevu yeniden açılamaz." }, { status: 409 });
      }
      throw error;
    }

    try {
      await syncAppointmentReminder({
        id: appointment.id,
        institutionId: appointment.institutionId,
        branchId: appointment.branchId,
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

    // İptal edilen gelecek randevu için hastaya bilgi mesajı (yanıt döndükten sonra).
    if (body.status === "IPTAL" && existing.status !== "IPTAL") {
      const actorId = auth.user.id;
      after(() => notifyAppointmentCancelled({ appointment: existing, actorId }).then(() => undefined));
    }

    const action = typeof body.status === "string" && keys.length === 1 ? "APPOINTMENT_STATUS" : "APPOINTMENT_UPDATE";
    // Denetim kaydı platform paneline de düşer: hasta adı maskeli (H9/H11).
    const detail = [
      `${auth.user.fullName || "Personel"} tarafından ${maskPatientName(appointment.patient.fullName)} randevusu güncellendi.`,
      `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
      `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    ].join("\n");

    await writeAudit(auth.user.id, action, detail);
    return NextResponse.json(await maskForRole(appointment, auth.user));
  }

  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi" }, { status: 400 });
  }

  // Doktor çakışması artık sert bir engel değil, bilinçli bir onaydır (bkz.
  // POST /api/appointments üzerindeki aynı not) — koltuk / oda/hasta
  // çakışmaları fiziksel olarak imkânsız olduğu için hâlâ kesin engellenir.
  const overrideDoctorConflict = body?.overrideConflict === true;

  const selectedPatient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      homeBranchId: activeBranch.branchId,
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true },
  });
  if (!selectedPatient) {
    return NextResponse.json({ message: "Seçilen hasta bu şubede bulunamadı veya arşivlenmiş." }, { status: 403 });
  }

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId, auth.user.institutionId, activeBranch.branchId);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Seçilen personel randevu doktoru olarak kullanılamaz." }, { status: 400 });
  }

  // Eski istemciler tam randevu gövdesini üniteden habersiz gönderebilir.
  // Alan gövdede hiç yoksa mevcut bağlantıyı koru; yalnızca açıkça null/
  // değer gönderildiğinde üniteyi kaldır veya değiştir.
  const hasClinicUnitInput = Object.prototype.hasOwnProperty.call(body, "clinicUnitId");
  const requestedClinicUnitId = hasClinicUnitInput ? (parsed.data.clinicUnitId || null) : (existing.clinicUnitId || null);
  let selectedUnit = await isEligibleClinicUnit(requestedClinicUnitId, auth.user.institutionId, activeBranch.branchId);
  // Ünite sonradan pasife alınmış olsa bile, ona bağlı eski randevunun saat
  // veya not düzeltmesi engellenmez. Ancak pasif ünite yeni randevuya ya da
  // başka bir randevuya atanamaz.
  if (!selectedUnit && requestedClinicUnitId && requestedClinicUnitId === existing.clinicUnitId) {
    selectedUnit = await prisma.clinicUnit.findFirst({
      where: { id: requestedClinicUnitId, branchId: activeBranch.branchId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
      select: { id: true, name: true },
    });
  }
  if (requestedClinicUnitId && !selectedUnit) {
    return NextResponse.json({ message: "Seçilen koltuk / oda bulunamadı veya pasif durumda." }, { status: 400 });
  }

  const newStart = new Date(parsed.data.startAt);
  const newEnd   = new Date(parsed.data.endAt);

  if (newStart >= newEnd) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır." }, { status: 400 });
  }

  // Düzenle/taşı formu durumu göndermez: gövdede durum yoksa mevcut durum
  // korunur. Önceden form açıldığı andaki durumu geri yazıyor, arada
  // işaretlenen "Geldi/Planlandı'ya geri al" kayboluyordu (canlı test H2).
  const hasStatusInput = Object.prototype.hasOwnProperty.call(body, "status");
  const targetStatus = hasStatusInput ? parsed.data.status : existing.status;

  const transitionError = appointmentStatusTransitionError(existing.status, targetStatus, newStart);
  if (transitionError) return NextResponse.json({ message: transitionError }, { status: 409 });

  // Çakışma kontrolü — saat/doktor değişiyorsa yeniden kontrol
  const timeChanged   = parsed.data.startAt !== existing.startAt.toISOString() || parsed.data.endAt !== existing.endAt.toISOString();
  const doctorChanged = parsed.data.doctorId !== existing.doctorId;
  const unitChanged = requestedClinicUnitId !== (existing.clinicUnitId || null);
  const patientChanged = parsed.data.patientId !== existing.patientId;
  const existingIsActive = !INACTIVE_STATUSES.has(existing.status);
  const targetIsActive = !INACTIVE_STATUSES.has(targetStatus);
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
        branchId: activeBranch.branchId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (unitConflict) {
      const cs = unitConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
      const ce = unitConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
      return NextResponse.json({ message: `${selectedUnit.name} koltuk / oda ${cs}–${ce} saatleri arasında dolu (${unitConflict.patient?.fullName ?? "—"}).`, conflictId: unitConflict.id }, { status: 409 });
    }
  }

  if (targetIsActive && (timeChanged || patientChanged || reactivating)) {
    const patientConflict = await prisma.appointment.findFirst({
      where: {
        id: { not: params.id },
        patientId: parsed.data.patientId,
        branchId: activeBranch.branchId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true },
    });
    if (patientConflict) {
      const cs = patientConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
      const ce = patientConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
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
        branchId: activeBranch.branchId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (conflict) {
      const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
      const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
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
    const blockConflict = await findDoctorBlockConflict(parsed.data.doctorId, activeBranch.branchId, newStart, newEnd);
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
        const blockConflictRecheck = await findDoctorBlockConflict(parsed.data.doctorId, activeBranch.branchId, newStart, newEnd, tx);
        if (blockConflictRecheck) throw new Error("DOCTOR_BLOCK_RECHECK");
      }
      if (doctorConflictCheckNeeded && !overrideDoctorConflict) {
        const doctorConflictRecheck = await tx.appointment.findFirst({
          where: {
            id: { not: params.id },
            doctorId: parsed.data.doctorId,
            branchId: activeBranch.branchId,
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
            branchId: activeBranch.branchId,
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
            branchId: activeBranch.branchId,
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
          status: targetStatus,
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
          // Saati değişen randevuda hastanın eski onayı yeni saat için geçmez:
          // yeni hatırlatmada bağlantı yeniden gider.
          ...(newStart.getTime() !== existing.startAt.getTime() || (targetStatus !== existing.status && INACTIVE_STATUSES.has(existing.status))
            ? { patientResponse: null, patientRespondedAt: null }
            : {}),
        },
        include: APPOINTMENT_INCLUDE,
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
      return NextResponse.json({ message: "Bu koltuk / oda aynı saat aralığında başka bir randevuya ayrıldı. Lütfen tekrar deneyin." }, { status: 409 });
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
      institutionId: appointment.institutionId,
      branchId: appointment.branchId,
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

  // Denetim kaydında tarih Türkiye saatiyle okunur, hekim kimlik yerine adıyla
  // yazılır; hasta adı maskelidir (platform paneline de düşer — H9/H11).
  pushDiff("Başlangıç", formatAppointmentDateTime(existing.startAt), formatAppointmentDateTime(new Date(parsed.data.startAt)));
  pushDiff("Bitiş", formatAppointmentDateTime(existing.endAt), formatAppointmentDateTime(new Date(parsed.data.endAt)));
  pushDiff("Durum", fmtStatus(existing.status), fmtStatus(targetStatus));
  pushDiff("Tür", existing.type, parsed.data.type);
  pushDiff("Not", existing.note, parsed.data.note);
  // Hekim farkı kimlikle bulunur, adla yazılır: aynı adlı iki hekim arasında
  // taşıma da kayda geçer (önceden adlar eşit olunca fark görülmüyordu).
  if (doctorChanged) {
    beforeParts.push(`Doktor: ${fmt(existing.doctor?.fullName || existing.doctorId)}`);
    afterParts.push(`Doktor: ${fmt(appointment.doctor?.fullName || parsed.data.doctorId)}`);
  }
  pushDiff("Koltuk / oda", existing.clinicUnit?.name, appointment.clinicUnit?.name);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${maskPatientName(appointment.patient.fullName)} randevusu güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    ...(conflictOverridden ? ["Doktor çakışması onaylanarak taşındı."] : []),
  ].join("\n");

  // Hastaya otomatik bilgi: iptal edildiyse iptal mesajı, tarih/saat/doktor
  // değiştiyse değişiklik mesajı (kurallar src/lib/appointment-change-notify.ts).
  {
    const actorId = auth.user.id;
    const updated = appointment;
    if (updated.status === "IPTAL" && existing.status !== "IPTAL") {
      after(() => notifyAppointmentCancelled({ appointment: existing, actorId }).then(() => undefined));
    } else {
      after(() => notifyAppointmentChanged({ before: existing, after: updated, actorId }).then(() => undefined));
    }
  }

  await writeAudit(auth.user.id, "APPOINTMENT_UPDATE", detail);
  return NextResponse.json(await maskForRole(appointment, auth.user));
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("appointments:delete");
  if (auth.error) return auth.error;
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 409 });

  const existing = await prisma.appointment.findFirst({
    where: appointmentTenantWhere(params.id, auth.user.institutionId, auth.user.branchContext),
    include: { patient: { select: { fullName: true } } },
  });
  if (!existing)
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });

  // Soft delete — durumu IPTAL yap (veri kaybını önler).
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: { status: "IPTAL" },
    });
  });

  try {
    await prisma.reminder.updateMany({
      where: { note: `${APPT_REMINDER_PREFIX}:${params.id}`, status: "AKTIF", planId: null },
      data: { status: "TAMAMLANDI" },
    });
  } catch {
    // reminder kapanış hatası cancel akışını kırmamalı.
  }

  if (existing.status !== "IPTAL") {
    const actorId = auth.user.id;
    after(() => notifyAppointmentCancelled({ appointment: existing, actorId }).then(() => undefined));
  }

  await writeAudit(auth.user.id, "APPOINTMENT_CANCEL", `${existing.patient?.fullName ? maskPatientName(existing.patient.fullName) : "—"} randevusu iptal edildi · ${formatAppointmentDateTime(existing.startAt)}`);
  return NextResponse.json({ ok: true });
}
