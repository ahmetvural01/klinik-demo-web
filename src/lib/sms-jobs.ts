import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { writeAudit } from "@/lib/api";
import { metricIncrement, metricObserve } from "@/lib/metrics";

const SMS_QUEUE_KEY = process.env.SMS_QUEUE_KEY || "ks:sms:jobs";

export type SmsDispatchJob = {
  institutionId: string;
  userId: string;
  appointmentIds: string[];
  smsType: "BILGI" | "HATIRLATMA" | "ANKET";
  queuedAt: string;
};

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: () => 3000,
  });
  client.on("error", () => {});
  return client;
}

export async function enqueueSmsDispatchJob(job: SmsDispatchJob) {
  const redis = getRedis();
  if (!redis) {
    return { queued: false, reason: "Redis tanımlı değil" };
  }

  try {
    const payload = JSON.stringify(job);
    const size = await redis.lpush(SMS_QUEUE_KEY, payload);
    return { queued: true, queueSize: size };
  } finally {
    redis.disconnect();
  }
}

export async function processSmsDispatchJob(job: SmsDispatchJob) {
  const started = Date.now();
  metricIncrement("sms_jobs_total");

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: job.institutionId } }),
    prisma.institution.findUnique({ where: { id: job.institutionId } }),
  ]);

  if (!settings?.smsEnabled) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "SMS servisi pasif" };
  }
  if (!institution) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "Klinik bulunamadi" };
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: job.appointmentIds },
      doctor: { institutionId: job.institutionId },
    },
    include: {
      patient: { select: { fullName: true, phone: true } },
      doctor: { select: { fullName: true } },
    },
  });

  if (!appointments.length) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "Randevu bulunamadi" };
  }

  const smsTemplate = await prisma.smsTemplate.findFirst({
    where: { code: job.smsType, isActive: true },
  });

  let sent = 0;
  const failedRecipients: { appointmentId: string; phone: string; reason: string }[] = [];

  const updateData: Record<string, boolean> = {};
  if (job.smsType === "BILGI") updateData.smsInfo = true;
  else if (job.smsType === "HATIRLATMA") updateData.smsReminder = true;
  else updateData.smsSurvey = true;

  const batchSize = 8;
  for (let i = 0; i < appointments.length; i += batchSize) {
    const chunk = appointments.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (appt) => {
      const dateText = new Date(appt.startAt).toLocaleString("tr-TR");
      const institutionName = settings.institutionName || institution.name;
      const fallbackMessage = job.smsType === "BILGI"
        ? `${institutionName}: Sayın ${appt.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}.`
        : job.smsType === "HATIRLATMA"
          ? `${institutionName}: Sayın ${appt.patient.fullName}, randevu hatırlatması. Tarih: ${dateText}, Doktor: ${appt.doctor.fullName}.`
          : `${institutionName}: Randevunuz tamamlandi. Degerlendirmeniz bizim icin cok degerli.`;

      const message = smsTemplate
        ? renderTemplate(smsTemplate.content, {
            institutionName,
            patientName: appt.patient.fullName,
            doctorName: appt.doctor.fullName,
            dateTime: dateText,
          })
        : fallbackMessage;

      const sendResult = await sendSms(appt.patient.phone, message);
      return { appt, sendResult };
    }));

    for (const { appt, sendResult } of chunkResults) {
      if (sendResult.success) {
        sent += 1;
        await prisma.appointment.update({ where: { id: appt.id }, data: updateData });
        await writeAudit(job.userId, `SMS_${job.smsType}`, `${appt.patient.fullName} (${appt.patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`);
      } else {
        failedRecipients.push({
          appointmentId: appt.id,
          phone: appt.patient.phone,
          reason: sendResult.error || sendResult.providerRaw,
        });
        await writeAudit(job.userId, `SMS_${job.smsType}_FAILED`, `${appt.patient.fullName} (${appt.patient.phone}) - ${sendResult.error || sendResult.providerRaw}`);
      }
    }
  }

  if (sent > 0) {
    await prisma.institution.update({
      where: { id: institution.id },
      data: { smsBalance: { decrement: sent } },
    });
  }

  metricObserve("sms_dispatch_ms", Date.now() - started);

  return {
    sent,
    failed: failedRecipients.length,
    failedRecipients,
    message: `${sent} SMS gonderildi${failedRecipients.length ? `, ${failedRecipients.length} basarisiz` : ""}`,
  };
}

export async function runSmsWorker() {
  const redis = getRedis();
  if (!redis) throw new Error("REDIS_URL tanımlı değil");

  while (true) {
    const popped = await redis.brpop(SMS_QUEUE_KEY, 5);
    if (!popped) continue;
    const raw = popped[1];

    try {
      const job = JSON.parse(raw) as SmsDispatchJob;
      if (!job?.institutionId || !job?.userId || !Array.isArray(job.appointmentIds)) continue;
      await processSmsDispatchJob(job);
    } catch {
      // malformed payload or processing error; continue worker loop
    }
  }
}
