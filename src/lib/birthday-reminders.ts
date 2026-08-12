import { prisma } from "@/lib/prisma";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { operationalInstitutionWhere } from "@/lib/operational-state";

// Doğum günü olan hastalara otomatik kutlama SMS'i — klinik Ayarlar > SMS
// ekranından açıp kapatabilir (Setting.birthdaySmsEnabled). Yılda bir kez
// gönderim garantisi BirthdaySmsLog.@@unique([patientId, year]) ile DB
// seviyesinde sağlanır; bu yüzden saatlik taramanın aynı gün birden fazla
// çalışması güvenlidir (bkz. src/lib/scheduler.ts).

export async function runBirthdaySmsSweep(): Promise<{
  institutionsChecked: number;
  checked: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  skippedNoBalance: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  const settings = await prisma.setting.findMany({
    where: { birthdaySmsEnabled: true, institution: operationalInstitutionWhere(now) },
    select: { institutionId: true, institutionName: true, institutionPhone: true },
  });

  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedAlreadySent = 0;
  let skippedNoBalance = 0;

  for (const setting of settings) {
    const institution = await prisma.institution.findUnique({
      where: { id: setting.institutionId },
      select: { id: true, name: true, phone: true, smsBalance: true },
    });
    if (!institution) continue;

    const candidates = await prisma.patient.findMany({
      where: {
        institutionId: institution.id,
        archivedAt: null,
        homeBranch: { isActive: true },
        birthDate: { not: null },
        phone: { not: "" },
      },
      select: { id: true, homeBranchId: true, fullName: true, phone: true, birthDate: true },
    });

    const birthdayPatients = candidates.filter((p) => {
      if (!p.birthDate) return false;
      return p.birthDate.getMonth() === todayMonth && p.birthDate.getDate() === todayDate;
    });

    for (const patient of birthdayPatients) {
      checked += 1;

      const alreadySent = await prisma.birthdaySmsLog.findFirst({
        where: { patientId: patient.id, year },
        select: { id: true },
      });
      if (alreadySent) {
        skippedAlreadySent += 1;
        continue;
      }

      const institutionName = setting.institutionName || institution.name;
      const institutionPhone = setting.institutionPhone || institution.phone || "";
      const smsTemplate = await resolveSmsTemplate(institution.id, "DOGUM_GUNU");
      const fallbackMessage = `Sayın ${patient.fullName}, doğum gününüzü candan kutlar, sağlık ve mutluluk dolu bir yıl dileriz. ${institutionName} ailesi olarak sizinle birlikte olmaktan mutluluk duyarız.`;
      const rendered = renderCommunicationTemplate(smsTemplate, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
      }, fallbackMessage);

      const result = await dispatchPatientMessage({
        institutionId: institution.id,
        patientId: patient.id,
        eventType: "BIRTHDAY_GREETING",
        purpose: "GREETING",
        templateCode: "DOGUM_GUNU",
        message: rendered.smsMessage,
        whatsappMessage: rendered.whatsappMessage,
        whatsappTemplate: rendered.whatsappTemplate,
        idempotencyKey: `birthday:${patient.id}:${year}`,
      });

      if (result.success) {
        sent += 1;
        await prisma.birthdaySmsLog.upsert({
          where: { patientId_year: { patientId: patient.id, year } },
          update: { status: "SENT", errorDetail: null, sentTo: patient.phone },
          create: { institutionId: institution.id, branchId: patient.homeBranchId, patientId: patient.id, year, sentTo: patient.phone, status: "SENT" },
        });
      } else if (result.suppressed) {
        skippedNoBalance += 1;
        await prisma.birthdaySmsLog.upsert({
          where: { patientId_year: { patientId: patient.id, year } },
          update: { status: "FAILED", errorDetail: result.reason, sentTo: patient.phone },
          create: { institutionId: institution.id, branchId: patient.homeBranchId, patientId: patient.id, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.reason },
        });
      } else {
        failed += 1;
        await prisma.birthdaySmsLog.upsert({
          where: { patientId_year: { patientId: patient.id, year } },
          update: { status: "FAILED", errorDetail: result.error, sentTo: patient.phone },
          create: { institutionId: institution.id, branchId: patient.homeBranchId, patientId: patient.id, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.error },
        });
      }
    }
  }

  return { institutionsChecked: settings.length, checked, sent, failed, skippedAlreadySent, skippedNoBalance };
}
