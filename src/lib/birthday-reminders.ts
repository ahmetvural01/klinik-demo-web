import { prisma } from "@/lib/prisma";
import { resolveSmsTemplate } from "@/lib/sms-templates";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";

// Doğum günü olan hastalara otomatik kutlama SMS'i — klinik Ayarlar > SMS
// ekranından açıp kapatabilir (Setting.birthdaySmsEnabled). Yılda bir kez
// gönderim garantisi BirthdaySmsLog.@@unique([patientId, year]) ile DB
// seviyesinde sağlanır; bu yüzden saatlik taramanın aynı gün birden fazla
// çalışması güvenlidir (bkz. src/lib/scheduler.ts).

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

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
    where: { birthdaySmsEnabled: true, smsEnabled: true },
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
        birthDate: { not: null },
        phone: { not: "" },
      },
      select: { id: true, fullName: true, phone: true, birthDate: true },
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
      const message = smsTemplate
        ? renderTemplate(smsTemplate.content, {
            institutionName,
            institutionPhone,
            patientName: patient.fullName,
          })
        : fallbackMessage;

      const result = await dispatchPatientMessage({
        institutionId: institution.id,
        patientId: patient.id,
        eventType: "BIRTHDAY_GREETING",
        purpose: "GREETING",
        templateCode: "DOGUM_GUNU",
        message,
        idempotencyKey: `birthday:${patient.id}:${year}`,
      });

      if (result.success) {
        sent += 1;
        await prisma.birthdaySmsLog.create({ data: { patientId: patient.id, year, sentTo: patient.phone, status: "SENT" } });
      } else if (result.suppressed) {
        skippedNoBalance += 1;
        await prisma.birthdaySmsLog.create({ data: { patientId: patient.id, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.reason } });
      } else {
        failed += 1;
        await prisma.birthdaySmsLog.create({ data: { patientId: patient.id, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.error } });
      }
    }
  }

  return { institutionsChecked: settings.length, checked, sent, failed, skippedAlreadySent, skippedNoBalance };
}
