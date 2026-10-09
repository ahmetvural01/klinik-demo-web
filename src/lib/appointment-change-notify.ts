import { prisma } from "@/lib/prisma";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";

// Randevunun tarihi/saati/doktoru değişince ve randevu iptal edilince hastaya
// otomatik bilgi mesajı (kliniğin kanal tercihine göre WhatsApp veya SMS;
// izin, kredi ve tekrar gönderim koruması dispatchPatientMessage'da).
// Kurallar:
//  - İletişim > Otomatik Mesajlar'daki ilgili anahtar kapalıysa gönderilmez.
//  - Randevuda "Bilgilendirme mesajı" (smsInfo) kapalıysa gönderilmez.
//  - Yalnız gelecekteki randevular (geçmiş randevu için mesaj gitmez).
//  - Değişiklikte yalnız tarih/saat veya doktor değiştiyse (not/durum değil).
// Bu fonksiyonlar hata fırlatmaz; randevu kaydını asla bozmaz.

export type AppointmentNotifySnapshot = {
  id: string;
  institutionId: string;
  patientId: string;
  doctorId: string;
  startAt: Date;
  status: string;
  smsInfo: boolean;
};

export type AppointmentNotifyResult = { sent: boolean; reason: string };

const CLOSED_STATUSES = new Set(["IPTAL", "GELMEDI", "TAMAMLANDI"]);

/** Mesajlarda görünen tarih/saat — sunucu hangi saat diliminde olursa olsun Türkiye saati. */
export function formatAppointmentDateTime(date: Date) {
  return date.toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

async function sendAppointmentMessage(params: {
  appointment: AppointmentNotifySnapshot;
  templateCode: "RANDEVU_DEGISIKLIK" | "RANDEVU_IPTAL";
  eventType: "APPOINTMENT_CHANGED" | "APPOINTMENT_CANCELLED";
  idempotencyKey: string;
  actorId?: string | null;
  fallback: (vars: { institutionName: string; institutionPhone: string; patientName: string; doctorName: string; dateTime: string }) => string;
}): Promise<AppointmentNotifyResult> {
  const { appointment } = params;
  const [patient, doctor, settings, institution, template] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: appointment.patientId, institutionId: appointment.institutionId, archivedAt: null },
      select: { id: true, fullName: true, phone: true },
    }),
    prisma.user.findFirst({ where: { id: appointment.doctorId, institutionId: appointment.institutionId }, select: { fullName: true } }),
    prisma.setting.findUnique({ where: { institutionId: appointment.institutionId }, select: { institutionName: true, institutionPhone: true } }),
    prisma.institution.findUnique({ where: { id: appointment.institutionId }, select: { name: true, phone: true } }),
    resolveSmsTemplate(appointment.institutionId, params.templateCode),
  ]);
  if (!patient || !institution) return { sent: false, reason: "Hasta veya klinik bulunamadı." };
  if (!patient.phone) return { sent: false, reason: "Hastanın telefon numarası yok." };

  const vars = {
    institutionName: settings?.institutionName || institution.name,
    institutionPhone: settings?.institutionPhone || institution.phone || "",
    patientName: patient.fullName,
    doctorName: doctor?.fullName || "",
    dateTime: formatAppointmentDateTime(appointment.startAt),
  };
  const rendered = renderCommunicationTemplate(template, vars, params.fallback(vars));
  const result = await dispatchPatientMessage({
    institutionId: appointment.institutionId,
    patientId: patient.id,
    eventType: params.eventType,
    purpose: "SERVICE",
    templateCode: params.templateCode,
    message: rendered.smsMessage,
    whatsappMessage: rendered.whatsappMessage,
    idempotencyKey: params.idempotencyKey,
    actorId: params.actorId || null,
    whatsappTemplate: rendered.whatsappTemplate,
  });
  if (result.success) return { sent: true, reason: result.channel === "WHATSAPP" ? "WhatsApp ile gönderildi." : "SMS ile gönderildi." };
  return { sent: false, reason: result.reason || result.error || "Gönderilemedi." };
}

export async function notifyAppointmentChanged(params: {
  before: AppointmentNotifySnapshot;
  after: AppointmentNotifySnapshot;
  actorId?: string | null;
}): Promise<AppointmentNotifyResult> {
  try {
    const { before, after } = params;
    const timeChanged = before.startAt.getTime() !== after.startAt.getTime();
    const doctorChanged = before.doctorId !== after.doctorId;
    if (!timeChanged && !doctorChanged) return { sent: false, reason: "Tarih, saat veya doktor değişmedi." };
    if (CLOSED_STATUSES.has(after.status)) return { sent: false, reason: "Randevu açık değil." };
    if (after.startAt.getTime() <= Date.now()) return { sent: false, reason: "Geçmiş randevu." };
    if (!after.smsInfo) return { sent: false, reason: "Randevuda bilgilendirme mesajı kapalı." };
    const setting = await prisma.setting.findUnique({
      where: { institutionId: after.institutionId },
      select: { appointmentChangeNotifyEnabled: true },
    });
    if (setting && !setting.appointmentChangeNotifyEnabled) return { sent: false, reason: "Randevu değişiklik mesajı kapalı." };
    return await sendAppointmentMessage({
      appointment: after,
      templateCode: "RANDEVU_DEGISIKLIK",
      eventType: "APPOINTMENT_CHANGED",
      idempotencyKey: `appt-change:${after.id}:${after.startAt.toISOString()}:${after.doctorId}`,
      actorId: params.actorId,
      fallback: (v) => `Sayın ${v.patientName}, ${v.institutionName} randevunuz ${v.dateTime} olarak güncellenmiştir.${v.doctorName ? ` Doktorunuz: ${v.doctorName}.` : ""}`,
    });
  } catch (error) {
    console.error("[randevu-bildirim] Değişiklik mesajı gönderilemedi:", error instanceof Error ? error.message : "bilinmeyen hata");
    return { sent: false, reason: "Beklenmeyen hata." };
  }
}

/** `appointment`: iptalden ÖNCEKİ randevu bilgisi (zaten iptal ise mesaj gitmez). */
export async function notifyAppointmentCancelled(params: {
  appointment: AppointmentNotifySnapshot;
  actorId?: string | null;
}): Promise<AppointmentNotifyResult> {
  try {
    const { appointment } = params;
    if (CLOSED_STATUSES.has(appointment.status)) return { sent: false, reason: "Randevu zaten kapalıydı." };
    if (appointment.startAt.getTime() <= Date.now()) return { sent: false, reason: "Geçmiş randevu." };
    if (!appointment.smsInfo) return { sent: false, reason: "Randevuda bilgilendirme mesajı kapalı." };
    const setting = await prisma.setting.findUnique({
      where: { institutionId: appointment.institutionId },
      select: { appointmentCancelNotifyEnabled: true },
    });
    if (setting && !setting.appointmentCancelNotifyEnabled) return { sent: false, reason: "Randevu iptal mesajı kapalı." };
    return await sendAppointmentMessage({
      appointment,
      templateCode: "RANDEVU_IPTAL",
      eventType: "APPOINTMENT_CANCELLED",
      idempotencyKey: `appt-cancel:${appointment.id}`,
      actorId: params.actorId,
      fallback: (v) => `Sayın ${v.patientName}, ${v.dateTime} tarihli ${v.institutionName} randevunuz iptal edilmiştir.${v.institutionPhone ? ` Bilgi için: ${v.institutionPhone}.` : ""}`,
    });
  } catch (error) {
    console.error("[randevu-bildirim] İptal mesajı gönderilemedi:", error instanceof Error ? error.message : "bilinmeyen hata");
    return { sent: false, reason: "Beklenmeyen hata." };
  }
}
