import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { dispatchPatientMessage, type NotificationEventType } from "@/lib/notification-dispatch";
import { writeAudit } from "@/lib/api";
import { metricIncrement, metricObserve } from "@/lib/metrics";
import { renderCommunicationTemplate, resolveSmsTemplate } from "@/lib/sms-templates";
import { maskPatientName, maskPatientPhone } from "@/lib/audit-mask";
import { can } from "@/lib/rbac";
import { isInstitutionOperational } from "@/lib/operational-state";

const EVENT_TYPE_BY_SMS_TYPE: Record<SmsDispatchJob["smsType"], NotificationEventType> = {
  BILGI: "APPOINTMENT_INFO",
  HATIRLATMA: "APPOINTMENT_REMINDER",
  ANKET: "TREATMENT_SURVEY",
};

const SMS_QUEUE_KEY = process.env.SMS_QUEUE_KEY || "ks:sms:jobs";
const SMS_DEAD_LETTER_KEY = process.env.SMS_DEAD_LETTER_KEY || "ks:sms:dead";
const MAX_JOB_ATTEMPTS = 3;

export type SmsDispatchJob = {
  institutionId: string;
  branchId: string;
  userId: string;
  appointmentIds: string[];
  smsType: "BILGI" | "HATIRLATMA" | "ANKET";
  requestId?: string;
  queuedAt: string;
  attempt?: number;
  lastError?: string;
};

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

  const [settings, institution, branch, actor] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: job.institutionId } }),
    prisma.institution.findUnique({
      where: { id: job.institutionId },
      select: {
        id: true,
        name: true,
        phone: true,
        isActive: true,
        serviceMode: true,
        suspendedUntil: true,
        isDemo: true,
        demoExpiresAt: true,
      },
    }),
    prisma.clinicBranch.findFirst({
      where: { id: job.branchId, institutionId: job.institutionId, isActive: true },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: job.userId },
      select: { id: true, institutionId: true, role: true, isActive: true },
    }),
  ]);

  if (!institution || !isInstitutionOperational(institution) || !branch) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "Klinik veya şube gönderim sırasında aktif değil." };
  }
  if (!actor?.isActive || (actor.role !== "SUPERADMIN" && actor.institutionId !== job.institutionId)) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "İşi oluşturan kullanıcının erişimi artık geçerli değil." };
  }
  if (actor.role !== "SUPERADMIN") {
    const membership = await prisma.userBranch.findFirst({
      where: {
        userId: actor.id,
        institutionId: job.institutionId,
        branchId: job.branchId,
        isActive: true,
      },
      select: { permissionCodes: true },
    });
    const branchPermissions = Array.isArray(membership?.permissionCodes)
      ? membership.permissionCodes.filter((value): value is string => typeof value === "string")
      : null;
    const branchAllows = Boolean(membership) && (
      branchPermissions === null
      || branchPermissions.includes("*")
      || branchPermissions.includes("sms:write")
    );
    if (!branchAllows || !await can(actor.role, "sms:write")) {
      return { sent: 0, failed: 0, failedRecipients: [], message: "İşi oluşturan kullanıcının SMS yetkisi kaldırılmış." };
    }
  }

  const requestedIds = [...new Set(job.appointmentIds)];
  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: requestedIds },
      institutionId: job.institutionId,
      branchId: job.branchId,
    },
    include: {
      patient: { select: { id: true, fullName: true, phone: true, phoneCountryCode: true } },
      doctor: { select: { fullName: true } },
    },
  });

  if (appointments.length !== requestedIds.length) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "Randevu seçimi gönderim sırasında değişti; iş güvenli biçimde iptal edildi." };
  }
  const now = new Date();
  const ineligible = appointments.filter((appointment) => {
    if (job.smsType === "ANKET") return appointment.status !== "TAMAMLANDI";
    if (job.smsType === "HATIRLATMA") {
      return appointment.startAt <= now || ["IPTAL", "GELMEDI", "TAMAMLANDI"].includes(appointment.status);
    }
    return appointment.status === "IPTAL";
  });
  if (ineligible.length > 0) {
    return { sent: 0, failed: 0, failedRecipients: [], message: "Randevulardan biri artık bu bildirim türü için uygun değil." };
  }

  // Bakiye rezervasyonu artık toplu değil, her alıcı için dispatchPatientMessage
  // içinde ayrı ayrı atomik olarak yapılıyor (bkz. src/lib/notification-dispatch.ts)
  // — bakiye N alıcıya yetmiyorsa hepsi birden reddedilmek yerine yetenen kadarı
  // gönderilir, kalanı SUPPRESSED olarak loglanır.
  const smsTemplate = await resolveSmsTemplate(job.institutionId, job.smsType);

  let sent = 0;
  const failedRecipients: { appointmentId: string; phone: string; reason: string; retryable: boolean }[] = [];

  const updateData: Record<string, boolean> = {};
  if (job.smsType === "BILGI") updateData.smsInfo = true;
  else if (job.smsType === "HATIRLATMA") updateData.smsReminder = true;
  else updateData.smsSurvey = true;

  const batchSize = 8;
  for (let i = 0; i < appointments.length; i += batchSize) {
    const chunk = appointments.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (appt) => {
      const dateText = new Date(appt.startAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
      const institutionName = settings?.institutionName || institution.name;
      const institutionPhone = settings?.institutionPhone || institution.phone || "";
      const fallbackMessage = job.smsType === "BILGI"
        ? `${institutionName}: Sayın ${appt.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}.`
        : job.smsType === "HATIRLATMA"
          ? `${institutionName}: Sayın ${appt.patient.fullName}, randevu hatırlatması. Tarih: ${dateText}, Doktor: ${appt.doctor.fullName}.`
          : `${institutionName}: Randevunuz tamamlandi. Degerlendirmeniz bizim icin cok degerli.`;

      const rendered = renderCommunicationTemplate(smsTemplate, {
        institutionName,
        institutionPhone,
        patientName: appt.patient.fullName,
        doctorName: appt.doctor.fullName,
        dateTime: dateText,
        surveyLink: settings?.reviewLink || "",
      }, fallbackMessage);

      const result = await dispatchPatientMessage({
        institutionId: job.institutionId,
        patientId: appt.patient.id,
        eventType: EVENT_TYPE_BY_SMS_TYPE[job.smsType],
        purpose: "SERVICE",
        templateCode: job.smsType,
        message: rendered.smsMessage,
        whatsappMessage: rendered.whatsappMessage,
        idempotencyKey: `sms-job:${job.smsType}:${appt.id}:${job.requestId || job.queuedAt}`,
        actorId: job.userId,
        whatsappTemplate: rendered.whatsappTemplate,
      });
      return { appt, result };
    }));

    for (const { appt, result } of chunkResults) {
      if (result.success) {
        sent += 1;
        await prisma.appointment.update({ where: { id: appt.id }, data: updateData });
        await writeAudit(job.userId, `${result.channel}_${job.smsType}`, `${maskPatientName(appt.patient.fullName)} (${maskPatientPhone(appt.patient.phone)}) - ProviderMsgId: ${result.providerMessageId || "-"}`);
      } else {
        failedRecipients.push({
          appointmentId: appt.id,
          phone: appt.patient.phone,
          reason: result.reason || result.error || "Bilinmeyen hata",
          retryable: result.retryable === true,
        });
        await writeAudit(job.userId, `SMS_${job.smsType}_FAILED`, `${maskPatientName(appt.patient.fullName)} (${maskPatientPhone(appt.patient.phone)}) - ${result.reason || result.error || "Bilinmeyen hata"}`);
      }
    }
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
      if (!job?.institutionId || !job?.branchId || !job?.userId || !Array.isArray(job.appointmentIds)) {
        console.error("[sms-worker] Geçersiz iş atlandı:", raw);
        await redis.lpush(SMS_DEAD_LETTER_KEY, JSON.stringify({
          failedAt: new Date().toISOString(),
          reason: "Geçersiz iş gövdesi",
          raw,
        }));
        continue;
      }
      const result = await processSmsDispatchJob(job);
      const retryableRecipients = result.failedRecipients.filter((item) => item.retryable);
      if (retryableRecipients.length > 0) {
        await retryOrDeadLetter(redis, job, {
          appointmentIds: retryableRecipients.map((item) => item.appointmentId),
          reason: retryableRecipients.map((item) => item.reason).join(" | "),
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
