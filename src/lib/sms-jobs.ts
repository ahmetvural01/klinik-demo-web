import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { writeAudit } from "@/lib/api";
import { metricIncrement, metricObserve } from "@/lib/metrics";
import { resolveSmsTemplate } from "@/lib/sms-templates";
import { maskPatientName, maskPatientPhone } from "@/lib/audit-mask";

const SMS_QUEUE_KEY = process.env.SMS_QUEUE_KEY || "ks:sms:jobs";
const SMS_DEAD_LETTER_KEY = process.env.SMS_DEAD_LETTER_KEY || "ks:sms:dead";
const MAX_JOB_ATTEMPTS = 3;

export type SmsDispatchJob = {
  institutionId: string;
  userId: string;
  appointmentIds: string[];
  smsType: "BILGI" | "HATIRLATMA" | "ANKET";
  queuedAt: string;
  attempt?: number;
  lastError?: string;
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
    return { sent: 0, failed: 0, failedRecipients: [], message: "Klinik bulunamadı." };
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
    return { sent: 0, failed: 0, failedRecipients: [], message: "Randevu bulunamadı." };
  }

  const reservation = await prisma.institution.updateMany({
    where: { id: institution.id, smsBalance: { gte: appointments.length } },
    data: { smsBalance: { decrement: appointments.length } },
  });

  if (reservation.count === 0) {
    return {
      sent: 0,
      failed: appointments.length,
      failedRecipients: appointments.map((appt) => ({
        appointmentId: appt.id,
        phone: appt.patient.phone,
        reason: "Yetersiz SMS kredisi",
      })),
      message: `Yetersiz SMS kredisi. Gerekli: ${appointments.length}, Mevcut: ${institution.smsBalance}`,
    };
  }

  const smsTemplate = await resolveSmsTemplate(job.institutionId, job.smsType);

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
      const institutionPhone = settings.institutionPhone || institution.phone || "";
      const fallbackMessage = job.smsType === "BILGI"
        ? `${institutionName}: Sayın ${appt.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}.`
        : job.smsType === "HATIRLATMA"
          ? `${institutionName}: Sayın ${appt.patient.fullName}, randevu hatırlatması. Tarih: ${dateText}, Doktor: ${appt.doctor.fullName}.`
          : `${institutionName}: Randevunuz tamamlandi. Degerlendirmeniz bizim icin cok degerli.`;

      const message = smsTemplate
        ? renderTemplate(smsTemplate.content, {
            institutionName,
            institutionPhone,
            patientName: appt.patient.fullName,
            doctorName: appt.doctor.fullName,
            dateTime: dateText,
            surveyLink: settings.reviewLink || "",
          })
        : fallbackMessage;

      const sendResult = await sendSms(appt.patient.phone, message);
      return { appt, sendResult };
    }));

    for (const { appt, sendResult } of chunkResults) {
      if (sendResult.success) {
        sent += 1;
        await prisma.appointment.update({ where: { id: appt.id }, data: updateData });
        await writeAudit(job.userId, `SMS_${job.smsType}`, `${maskPatientName(appt.patient.fullName)} (${maskPatientPhone(appt.patient.phone)}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`);
      } else {
        failedRecipients.push({
          appointmentId: appt.id,
          phone: appt.patient.phone,
          reason: sendResult.error || sendResult.providerRaw,
        });
        await writeAudit(job.userId, `SMS_${job.smsType}_FAILED`, `${maskPatientName(appt.patient.fullName)} (${maskPatientPhone(appt.patient.phone)}) - ${sendResult.error || sendResult.providerRaw}`);
      }
    }
  }

  const failed = appointments.length - sent;
  if (failed > 0) {
    await prisma.institution.update({
      where: { id: institution.id },
      data: { smsBalance: { increment: failed } },
    });
  }

  metricObserve("sms_dispatch_ms", Date.now() - started);

  return {
    sent,
    failed: failedRecipients.length,
    failedRecipients,
    message: `${sent} SMS gönderildi${failedRecipients.length ? `; ${failedRecipients.length} gönderim başarısız` : ""}.`,
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
      if (!job?.institutionId || !job?.userId || !Array.isArray(job.appointmentIds)) {
        console.error("[sms-worker] Geçersiz iş atlandı:", raw);
        await redis.lpush(SMS_DEAD_LETTER_KEY, JSON.stringify({
          failedAt: new Date().toISOString(),
          reason: "Geçersiz iş gövdesi",
          raw,
        }));
        continue;
      }
      const result = await processSmsDispatchJob(job);
      if (result.failed > 0 && result.failedRecipients.length > 0) {
        await retryOrDeadLetter(redis, job, {
          appointmentIds: result.failedRecipients.map((item) => item.appointmentId),
          reason: result.failedRecipients.map((item) => item.reason).join(" | "),
        });
      }
    } catch (error) {
      console.error("[sms-worker] İş işlenemedi:", raw, error);
      let parsed: SmsDispatchJob | null = null;
      try {
        parsed = JSON.parse(raw) as SmsDispatchJob;
      } catch {
        // Geçersiz JSON aşağıda doğrudan son hata kuyruğuna alınır.
      }
      if (parsed?.institutionId && parsed.userId && Array.isArray(parsed.appointmentIds)) {
        await retryOrDeadLetter(redis, parsed, {
          appointmentIds: parsed.appointmentIds,
          reason: error instanceof Error ? error.message : "Bilinmeyen worker hatası",
        });
      } else {
        await redis.lpush(SMS_DEAD_LETTER_KEY, JSON.stringify({
          failedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : "Bilinmeyen worker hatası",
          raw,
        }));
      }
    }
  }
}

async function retryOrDeadLetter(
  redis: Redis,
  job: SmsDispatchJob,
  failure: { appointmentIds: string[]; reason: string },
) {
  const nextAttempt = (job.attempt || 0) + 1;
  const retryJob: SmsDispatchJob = {
    ...job,
    appointmentIds: failure.appointmentIds,
    attempt: nextAttempt,
    lastError: failure.reason.slice(0, 2000),
  };
  if (nextAttempt >= MAX_JOB_ATTEMPTS) {
    await redis.lpush(SMS_DEAD_LETTER_KEY, JSON.stringify({
      ...retryJob,
      failedAt: new Date().toISOString(),
    }));
    console.error(`[sms-worker] İş ${MAX_JOB_ATTEMPTS} denemeden sonra son hata kuyruğuna alındı.`);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000 * nextAttempt));
  await redis.lpush(SMS_QUEUE_KEY, JSON.stringify(retryJob));
  console.warn(`[sms-worker] ${failure.appointmentIds.length} alıcı için yeniden deneme kuyruğa alındı (${nextAttempt}/${MAX_JOB_ATTEMPTS}).`);
}

export function isSmsQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}
