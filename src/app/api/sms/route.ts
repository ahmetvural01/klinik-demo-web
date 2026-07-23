import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { sendSms } from "@/lib/sms";
import { metricIncrement, metricObserve } from "@/lib/metrics";
import { enqueueSmsDispatchJob } from "@/lib/sms-jobs";
import { resolveSmsTemplate } from "@/lib/sms-templates";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

// GET - Randevuları SMS durumuyla birlikte getir + istatistikler
export async function GET(request: NextRequest) {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari SMS ekranini kullanabilir" }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type") || "upcoming";
  const now = new Date();

  let whereFilter = {};
  if (type === "upcoming") {
    whereFilter = { startAt: { gte: now } };
  } else if (type === "past") {
    whereFilter = { startAt: { lt: now } };
  }

  const [appointments, settings, smsSentCount] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...whereFilter,
        doctor: { institutionId: auth.user.institutionId },
      },
      include: {
        patient: { select: { fullName: true, phone: true } },
        doctor: { select: { fullName: true } },
      },
      orderBy: { startAt: "asc" },
      take: 100,
    }),
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.auditLog.count({
      where: {
        user: { institutionId: auth.user.institutionId },
        action: { startsWith: "SMS_" },
      },
    }),
  ]);

  return NextResponse.json({
    appointments,
    settings: {
      smsEnabled: settings?.smsEnabled ?? true,
      smsDefaultInfo: settings?.smsDefaultInfo ?? true,
      smsDefaultReminder: settings?.smsDefaultReminder ?? false,
      smsDefaultSurvey: settings?.smsDefaultSurvey ?? false,
    },
    smsSentCount,
  });
}

// POST - Secili randevulara gercek SMS gonder
export async function POST(request: NextRequest) {
  const started = Date.now();
  metricIncrement("sms_jobs_total");

  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Sadece klinik kullanicilari SMS gonderebilir" }, { status: 403 });
  }

  const body = await request.json() as { appointmentIds?: string[]; smsType?: string };
  const { appointmentIds = [], smsType = "BILGI" } = body;
  const dispatchMode = request.nextUrl.searchParams.get("mode") || "sync";

  if (!appointmentIds.length) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "En az bir randevu secin" }, { status: 400 });
  }

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
  ]);

  if (!settings?.smsEnabled) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "SMS servisi pasif durumda" }, { status: 400 });
  }

  if (!institution) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Klinik bulunamadi" }, { status: 404 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: appointmentIds },
      doctor: { institutionId: auth.user.institutionId },
    },
    include: {
      patient: { select: { fullName: true, phone: true } },
      doctor: { select: { fullName: true } },
    },
  });

  if (!appointments.length) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Randevu bulunamadi" }, { status: 404 });
  }

  if (dispatchMode === "queue") {
    if (institution.smsBalance < appointments.length) {
      metricIncrement("api_errors_total");
      return NextResponse.json({
        message: `Yetersiz SMS kredisi. Gerekli: ${appointments.length}, Mevcut: ${institution.smsBalance}`,
      }, { status: 400 });
    }

    const queued = await enqueueSmsDispatchJob({
      institutionId: auth.user.institutionId,
      userId: auth.user.id,
      appointmentIds,
      smsType: (smsType as "BILGI" | "HATIRLATMA" | "ANKET"),
      queuedAt: new Date().toISOString(),
    });

    if (!queued.queued) {
      metricIncrement("api_errors_total");
      return NextResponse.json({ message: `Queue islemi basarisiz: ${queued.reason}` }, { status: 503 });
    }

    return NextResponse.json({
      queued: true,
      queueSize: queued.queueSize || 0,
      message: "SMS gonderimi kuyruğa alindi.",
    }, { status: 202 });
  }

  const reservation = await prisma.institution.updateMany({
    where: { id: institution.id, smsBalance: { gte: appointments.length } },
    data: { smsBalance: { decrement: appointments.length } },
  });

  if (reservation.count === 0) {
    const fresh = await prisma.institution.findUnique({ where: { id: institution.id }, select: { smsBalance: true } });
    metricIncrement("api_errors_total");
    return NextResponse.json({
      message: `Yetersiz SMS kredisi. Gerekli: ${appointments.length}, Mevcut: ${fresh?.smsBalance ?? institution.smsBalance}`,
    }, { status: 400 });
  }

  const updateData: Record<string, boolean> = {};
  if (smsType === "BILGI") updateData.smsInfo = true;
  else if (smsType === "HATIRLATMA") updateData.smsReminder = true;
  else if (smsType === "ANKET") updateData.smsSurvey = true;

  const smsTemplate = await resolveSmsTemplate(auth.user.institutionId, smsType);

  let sent = 0;
  const failedRecipients: { appointmentId: string; phone: string; reason: string }[] = [];

  const batchSize = 8;
  for (let i = 0; i < appointments.length; i += batchSize) {
    const chunk = appointments.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (appt) => {
      const dateText = new Date(appt.startAt).toLocaleString("tr-TR");
      const institutionName = settings.institutionName || institution.name;
      const institutionPhone = settings.institutionPhone || institution.phone || "";
      const fallbackMessage = smsType === "BILGI"
        ? `${institutionName}: Sayın ${appt.patient.fullName}, randevunuz oluşturuldu. Tarih: ${dateText}.`
        : smsType === "HATIRLATMA"
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
        await writeAudit(
          auth.user.id,
          `SMS_${smsType}`,
          `${appt.patient.fullName} (${appt.patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`,
        );
      } else {
        failedRecipients.push({
          appointmentId: appt.id,
          phone: appt.patient.phone,
          reason: sendResult.error || sendResult.providerRaw,
        });
        await writeAudit(
          auth.user.id,
          `SMS_${smsType}_FAILED`,
          `${appt.patient.fullName} (${appt.patient.phone}) - ${sendResult.error || sendResult.providerRaw}`,
        );
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

  const refreshedInstitution = await prisma.institution.findUnique({ where: { id: institution.id } });
  metricObserve("sms_dispatch_ms", Date.now() - started);

  return NextResponse.json({
    sent,
    failed: failedRecipients.length,
    failedRecipients,
    remainingBalance: refreshedInstitution?.smsBalance ?? institution.smsBalance,
    message: `${sent} hastaya ${smsType === "BILGI" ? "bilgi" : smsType === "HATIRLATMA" ? "hatirlatma" : "anket"} SMS'i gonderildi${failedRecipients.length ? `, ${failedRecipients.length} gonderim basarisiz` : ""}`,
  });
}
