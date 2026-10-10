import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

export const dynamic = "force-dynamic";

/**
 * Randevu formunda seçili hastanın kısa bağlamı:
 *  - hastaya randevu mesajı (bilgilendirme/hatırlatma) gidebilir mi,
 *  - yaklaşan randevusu (aynı hastaya ikinci randevu verilmesin),
 *  - bulaşıcı hastalık uyarısı (randevu listesi zaten gösteriyor),
 *  - hekim önerisi: yaklaşan randevunun ve son tamamlanan randevunun hekimi.
 * Önceden form hastanın SMS izni olmadığını söylemiyordu; "Randevu bilgisini
 * gönder" seçili olduğu halde mesaj sessizce gitmiyordu (canlı test H5).
 * Kanal kararı notification-dispatch ile aynı kurallara dayanır; gönderim yine
 * yalnız dispatchPatientMessage üzerinden yapılır — bu uç yalnız bilgi verir.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const patientId = (request.nextUrl.searchParams.get("patientId") || "").trim();
  const excludeAppointmentId = (request.nextUrl.searchParams.get("excludeAppointmentId") || "").trim();
  if (!patientId || patientId.length > 100 || excludeAppointmentId.length > 100) {
    return NextResponse.json({ message: "Geçersiz hasta seçimi." }, { status: 400 });
  }

  try {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, institutionId, homeBranchId: branch.branchId, archivedAt: null },
      select: { id: true, phone: true, whatsappOptOutAt: true, hasContagiousDisease: true, contagiousDiseaseNote: true },
    });
    if (!patient) return NextResponse.json({ message: "Hasta bulunamadı." }, { status: 404 });

    const [institution, setting, smsPreference, nextAppointment, lastCompleted] = await Promise.all([
      prisma.institution.findUnique({ where: { id: institutionId }, select: { whatsappEnabled: true } }),
      prisma.setting.findUnique({
        where: { institutionId },
        select: { smsEnabled: true, defaultNotificationChannel: true, whatsappAppointmentEnabled: true },
      }),
      prisma.patientSmsPreference.findUnique({ where: { patientId: patient.id }, select: { status: true } }),
      prisma.appointment.findFirst({
        where: {
          institutionId,
          branchId: branch.branchId,
          patientId: patient.id,
          startAt: { gt: new Date() },
          status: { notIn: ["IPTAL", "GELMEDI", "TAMAMLANDI"] },
          ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        },
        orderBy: { startAt: "asc" },
        select: { id: true, startAt: true, doctorId: true, doctor: { select: { fullName: true } } },
      }),
      // Hekim önerisi: hastanın son tamamlanan randevusunun hekimi (asistan her
      // randevuda hekimi elle seçmesin). Yalnız kimlik döner.
      prisma.appointment.findFirst({
        where: {
          institutionId,
          branchId: branch.branchId,
          patientId: patient.id,
          status: "TAMAMLANDI",
          startAt: { lte: new Date() },
        },
        orderBy: { startAt: "desc" },
        select: { doctorId: true },
      }),
    ]);

    const whatsappUsable = Boolean(institution?.whatsappEnabled)
      && setting?.defaultNotificationChannel === "WHATSAPP"
      && (setting?.whatsappAppointmentEnabled ?? true)
      && canMessageOnWhatsapp(patient);
    const smsUsable = smsPreference?.status === "ENABLED" && setting?.smsEnabled !== false;
    const canNotify = Boolean(patient.phone) && (whatsappUsable || smsUsable);
    const reason = canNotify
      ? null
      : !patient.phone
        ? "Hastanın telefon numarası yok; mesaj gitmez."
        : setting?.smsEnabled === false && !whatsappUsable
          ? "Kurumun SMS gönderimi kapalı; mesaj gitmez."
          : smsPreference?.status === "DISABLED"
            ? "Hasta SMS almak istemiyor; mesaj gitmez."
            : "Hastanın SMS izni henüz yok; mesaj gitmez.";

    return NextResponse.json({
      notify: { canNotify, reason },
      nextAppointment: nextAppointment
        ? { id: nextAppointment.id, startAt: nextAppointment.startAt, doctorName: nextAppointment.doctor?.fullName || null, doctorId: nextAppointment.doctorId }
        : null,
      lastAppointmentDoctorId: lastCompleted?.doctorId || null,
      contagious: patient.hasContagiousDisease ? { note: patient.contagiousDiseaseNote || null } : null,
    });
  } catch (error) {
    console.error("[appointments patient-context GET]", error);
    return NextResponse.json({ message: "Hasta bilgisi yüklenemedi." }, { status: 503 });
  }
}
