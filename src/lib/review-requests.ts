import { prisma } from "@/lib/prisma";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { operationalInstitutionWhere } from "@/lib/operational-state";
import { isWithinPatientMessageWindow } from "@/lib/appointment-reminders";

/**
 * Tedavi sonrası değerlendirme isteği (ANKET şablonu). Randevu formunda
 * "Değerlendirme" seçili kalan (varsayılanı İletişim › Otomatik mesajlar)
 * randevu "Tamamlandı" işaretlenince hastaya, randevu bitiminden en az 2 saat
 * sonra ve yalnız mesaj saatlerinde (09:00–20:00) kliniğin değerlendirme
 * bağlantısıyla (Ayarlar › Klinik) bir kez gider. Önceden seçenek formda hep
 * kapalı gönderiliyordu; bağlantı girilse de hiçbir hastaya mesaj gitmiyordu.
 *
 * `Appointment.smsSurvey` = "değerlendirme istendi". Mesaj denenince (gitti,
 * izin yok ya da kredi yok) false yapılır: aynı randevuya ikinci kez denenmez;
 * çift gönderimi ayrıca `idempotencyKey` önler. 48 saatten eski randevuya
 * (ör. günler sonra kapatılan açık randevu) mesaj gitmez.
 */
const DELAY_AFTER_END_MS = 2 * 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BATCH = 200;

export async function runReviewRequestSweep(now: Date = new Date()) {
  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isWithinPatientMessageWindow(now)) return result;

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "TAMAMLANDI",
      smsSurvey: true,
      endAt: { gte: new Date(now.getTime() - MAX_AGE_MS), lte: new Date(now.getTime() - DELAY_AFTER_END_MS) },
      institution: operationalInstitutionWhere(now),
    },
    select: {
      id: true,
      institutionId: true,
      startAt: true,
      patient: { select: { id: true, fullName: true } },
      doctor: { select: { fullName: true } },
    },
    orderBy: { endAt: "asc" },
    take: BATCH,
  });
  if (appointments.length === 0) return result;

  const institutionIds = Array.from(new Set(appointments.map((row) => row.institutionId)));
  const [settings, institutions] = await Promise.all([
    prisma.setting.findMany({
      where: { institutionId: { in: institutionIds } },
      select: { institutionId: true, institutionName: true, institutionPhone: true, reviewLink: true },
    }),
    prisma.institution.findMany({ where: { id: { in: institutionIds } }, select: { id: true, name: true, phone: true } }),
  ]);
  const settingBy = new Map(settings.map((row) => [row.institutionId, row]));
  const institutionBy = new Map(institutions.map((row) => [row.id, row]));
  const templates = new Map<string, Awaited<ReturnType<typeof resolveSmsTemplate>>>();

  for (const appointment of appointments) {
    result.checked += 1;
    const setting = settingBy.get(appointment.institutionId);
    const institution = institutionBy.get(appointment.institutionId);
    const reviewLink = setting?.reviewLink?.trim();
    // Bağlantı yoksa mesajın bir işi yok: denenmiş sayılır, kredi harcanmaz.
    if (!reviewLink || !institution) {
      result.skipped += 1;
      await prisma.appointment.update({ where: { id: appointment.id }, data: { smsSurvey: false } }).catch(() => undefined);
      continue;
    }
    if (!templates.has(appointment.institutionId)) {
      templates.set(appointment.institutionId, await resolveSmsTemplate(appointment.institutionId, "ANKET"));
    }
    const institutionName = setting?.institutionName || institution.name;
    const rendered = renderCommunicationTemplate(templates.get(appointment.institutionId) ?? null, {
      institutionName,
      institutionPhone: setting?.institutionPhone || institution.phone || "",
      patientName: appointment.patient.fullName,
      doctorName: appointment.doctor.fullName,
      surveyLink: reviewLink,
    }, `${institutionName}: Sayın ${appointment.patient.fullName}, bizi tercih ettiğiniz için teşekkür ederiz. Değerlendirmeniz bizim için çok değerli: ${reviewLink}`);

    try {
      const sent = await dispatchPatientMessage({
        institutionId: appointment.institutionId,
        patientId: appointment.patient.id,
        eventType: "TREATMENT_SURVEY",
        purpose: "SERVICE",
        templateCode: "ANKET",
        message: rendered.smsMessage,
        whatsappMessage: rendered.whatsappMessage,
        whatsappTemplate: rendered.whatsappTemplate,
        idempotencyKey: `review-request:${appointment.id}`,
      });
      if (sent.success) result.sent += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      console.error("[review-requests]", appointment.id, error);
    }
    await prisma.appointment.update({ where: { id: appointment.id }, data: { smsSurvey: false } }).catch(() => undefined);
  }
  return result;
}
