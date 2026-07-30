import { prisma } from "@/lib/prisma";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";

// Meslek/resmi gün kutlama SMS'i — süperadmin kataloğu (CelebrationDay) her
// klinik için varsayılan kapalıdır; klinik CelebrationDaySetting.enabled=true
// yaparak her satırı ayrı ayrı açar (bkz. Ayarlar > SMS > Kutlama Günleri).
// targetProfessions boşsa (resmi bayram) kliniğin tüm hastalarına, doluysa
// yalnızca meslek alanı listede TAM eşleşen hastalara gönderilir — bkz.
// src/lib/professions.ts (hasta formunda artık sabit bir listeden seçilir).
// Yılda bir kez gönderim garantisi CelebrationSmsLog.@@unique([patientId, celebrationCode, year])
// ile DB seviyesinde sağlanır (bkz. src/lib/birthday-reminders.ts — aynı desen).

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

export async function runCelebrationDaySmsSweep(): Promise<{
  daysChecked: number;
  institutionsChecked: number;
  checked: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  skippedNoBalance: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDate = now.getDate();

  const days = await prisma.celebrationDay.findMany({
    where: { isActive: true, month: todayMonth, day: todayDate },
  });

  let institutionsChecked = 0;
  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedAlreadySent = 0;
  let skippedNoBalance = 0;

  for (const day of days) {
    const enabledSettings = await prisma.celebrationDaySetting.findMany({
      where: { celebrationCode: day.code, enabled: true },
      select: { institutionId: true },
    });
    if (enabledSettings.length === 0) continue;

    for (const setting of enabledSettings) {
      institutionsChecked += 1;
      const institution = await prisma.institution.findUnique({
        where: { id: setting.institutionId },
        select: { id: true, name: true, phone: true },
      });
      if (!institution) continue;

      const patients = await prisma.patient.findMany({
        where: {
          institutionId: institution.id,
          archivedAt: null,
          phone: { not: "" },
          ...(day.targetProfessions.length > 0 ? { profession: { in: day.targetProfessions } } : {}),
        },
        select: { id: true, fullName: true, phone: true },
      });

      for (const patient of patients) {
        checked += 1;

        const alreadySent = await prisma.celebrationSmsLog.findFirst({
          where: { patientId: patient.id, celebrationCode: day.code, year },
          select: { id: true },
        });
        if (alreadySent) {
          skippedAlreadySent += 1;
          continue;
        }

        const message = renderTemplate(day.messageTemplate, {
          institutionName: institution.name,
          institutionPhone: institution.phone || "",
          patientName: patient.fullName,
          title: day.title,
        });

        const result = await dispatchPatientMessage({
          institutionId: institution.id,
          patientId: patient.id,
          eventType: "HOLIDAY_GREETING",
          purpose: "GREETING",
          templateCode: day.code,
          message,
          idempotencyKey: `celebration:${day.code}:${patient.id}:${year}`,
        });

        if (result.success) {
          sent += 1;
          await prisma.celebrationSmsLog.create({ data: { patientId: patient.id, celebrationCode: day.code, year, sentTo: patient.phone, status: "SENT" } });
        } else if (result.suppressed) {
          skippedNoBalance += 1;
          await prisma.celebrationSmsLog.create({ data: { patientId: patient.id, celebrationCode: day.code, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.reason } });
        } else {
          failed += 1;
          await prisma.celebrationSmsLog.create({ data: { patientId: patient.id, celebrationCode: day.code, year, sentTo: patient.phone, status: "FAILED", errorDetail: result.error } });
        }
      }
    }
  }

  return { daysChecked: days.length, institutionsChecked, checked, sent, failed, skippedAlreadySent, skippedNoBalance };
}
