import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { sendWhatsapp } from "@/lib/whatsapp";

/**
 * Sistemdeki TEK hasta bildirim çıkışı. Hiçbir modül `sendSms`/`sendWhatsapp`'ı
 * doğrudan çağırmamalı — bu servis kanal seçimini (SMS/WhatsApp), hasta SMS
 * iznini, SMS kredisi rezervasyonunu ve idempotency'yi tek yerden yönetir.
 * (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §2-3). İleride e-posta/push gibi yeni
 * kanallar eklenirse aynı fonksiyon imzası üzerinden genişletilir.
 *
 * Kanal çözümlemesi hiçbir zaman sessizce başarısız olmaz: WhatsApp denenir
 * ve başarısız olursa (sağlayıcı tanımlı değil/pasif, bağlantı hatası, geçersiz
 * şablon vb.) hasta SMS izni varsa SMS'e güvenli şekilde düşülür ve bu düşüş
 * `SmsDispatch.lastError` alanında Türkçe olarak açıkça belirtilir. Hem
 * WhatsApp hem SMS koşulları sağlanmıyorsa gönderim SUPPRESSED olarak,
 * personelin anlayacağı bir gerekçeyle kaydedilir — asla sessizce yutulmaz.
 */

export type NotificationEventType =
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CHANGED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_REMINDER"
  | "APPOINTMENT_INFO"
  | "PAYMENT_REMINDER"
  | "TREATMENT_SURVEY"
  | "BIRTHDAY_GREETING"
  | "HOLIDAY_GREETING"
  | "SMS_CONSENT_REQUEST"
  | "MANUAL_WHATSAPP"
  | "MANUAL_SMS"
  | "BULK_SMS";

export type DispatchPurpose = "SERVICE" | "GREETING" | "CONSENT_REQUEST";

export type DispatchResult = {
  success: boolean;
  channel: "SMS" | "WHATSAPP";
  /** Only true when the provider was definitely not invoked. */
  retryable?: boolean;
  suppressed?: boolean;
  reason?: string;
  error?: string;
  providerMessageId?: string;
};

export type DispatchParams = {
  institutionId: string;
  patientId: string;
  eventType: NotificationEventType;
  purpose: DispatchPurpose;
  templateCode: string;
  message: string;
  whatsappMessage?: string;
  channelPreference?: "AUTO" | "SMS" | "WHATSAPP";
  /** Aynı olayın ikinci kez gönderilmesini engeller, ör. `appt:${id}:reminder`. */
  idempotencyKey: string;
  actorId?: string | null;
  whatsappTemplate?: { name?: string; language?: string; bodyParameters?: string[] };
  /** Kanal zorlandığında sağlayıcı hatasının SMS'e dönüşüp dönüşmeyeceği. */
  allowSmsFallback?: boolean;
};

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? `***${digits}` : `***${digits.slice(-4)}`;
}

function hashMessage(message: string) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

function resultFromDispatch(existing: {
  status: string;
  channel: "SMS" | "WHATSAPP";
  lastError: string | null;
  providerMessageId: string | null;
}): DispatchResult {
  if (existing.status === "QUEUED") {
    return {
      success: false,
      channel: existing.channel,
      retryable: false,
      error: "Gönderimin sonucu kesinleşmedi; çift mesaj riskini önlemek için otomatik olarak tekrar gönderilmedi.",
    };
  }

  if (existing.status === "FAILED") {
    return {
      success: false,
      channel: existing.channel,
      retryable: false,
      error: existing.lastError || "Gönderim başarısız oldu.",
    };
  }

  return {
    success: existing.status === "SENT" || existing.status === "DELIVERED" || existing.status === "READ",
    channel: existing.channel,
    retryable: false,
    suppressed: existing.status === "SUPPRESSED",
    reason: existing.status === "SUPPRESSED" ? existing.lastError || undefined : undefined,
    providerMessageId: existing.providerMessageId || undefined,
  };
}

export async function dispatchPatientMessage(params: DispatchParams): Promise<DispatchResult> {
  const { institutionId, patientId, eventType, purpose, templateCode, message, idempotencyKey, actorId } = params;
  void templateCode; // Şablon çözümlemesi çağıran tarafta yapılıyor; burada yalnızca kayıt amaçlı tutulur.

  const existing = await prisma.smsDispatch.findUnique({
    where: { institutionId_idempotencyKey: { institutionId, idempotencyKey } },
  });
  if (existing) {
    return resultFromDispatch(existing);
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, institutionId, archivedAt: null },
    select: {
      phone: true,
      phoneCountryCode: true,
      homeBranchId: true,
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
    },
  });
  if (!patient) {
    return { success: false, channel: "SMS", error: "Hasta bulunamadı veya arşivlenmiş." };
  }

  const [institution, setting, smsPreference] = await Promise.all([
    prisma.institution.findUnique({ where: { id: institutionId }, select: { whatsappEnabled: true } }),
    prisma.setting.findUnique({
      where: { institutionId },
      select: {
        defaultNotificationChannel: true,
        smsEnabled: true,
        whatsappSmsFallback: true,
        whatsappAppointmentEnabled: true,
        whatsappPaymentEnabled: true,
        whatsappInfoEnabled: true,
      },
    }),
    prisma.patientSmsPreference.findUnique({ where: { patientId }, select: { status: true } }),
  ]);
  if (!institution) {
    return { success: false, channel: "SMS", error: "Kurum bulunamadı." };
  }

  // Sağlayıcıya gitmeden önce idempotency anahtarını sahiplen. Önceki akışta
  // kayıt yalnızca gönderimden SONRA oluşturulduğu için eşzamanlı iki istek de
  // SMS/WhatsApp sağlayıcısına ulaşabiliyor, yalnızca ikinci DB kaydı reddediliyordu.
  let dispatchId: string;
  try {
    const claimed = await prisma.smsDispatch.create({
      data: {
        institutionId,
        branchId: patient.homeBranchId,
        patientId,
        eventType,
        purpose,
        channel: "SMS",
        status: "QUEUED",
        phoneMasked: maskPhone(patient.phone),
        messageHash: hashMessage(message),
        idempotencyKey,
        createdById: actorId || null,
      },
      select: { id: true },
    });
    dispatchId = claimed.id;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      const concurrent = await prisma.smsDispatch.findUnique({
        where: { institutionId_idempotencyKey: { institutionId, idempotencyKey } },
      });
      if (concurrent) return resultFromDispatch(concurrent);
    }
    throw error;
  }

  const logDispatch = (data: {
    channel: "SMS" | "WHATSAPP";
    status: "QUEUED" | "SENT" | "FAILED" | "SUPPRESSED";
    providerCode?: string;
    providerMessageId?: string;
    lastError?: string;
    sentAt?: Date;
  }) =>
    prisma.smsDispatch.update({
      where: { id: dispatchId },
      data: {
        channel: data.channel,
        status: data.status,
        providerCode: data.providerCode || null,
        providerMessageId: data.providerMessageId || null,
        lastError: data.lastError || null,
        sentAt: data.sentAt || null,
        attemptCount: data.status === "FAILED" ? 1 : 0,
      },
    });

  // İzin isteği SMS'inin kendisi izin kontrolünden muaftır (henüz izin durumu
  // PENDING olduğu için) ve her zaman SMS ile gider — WhatsApp izni SMS izninden
  // bağımsız olduğu için "SMS izni istiyoruz" mesajını WhatsApp'tan göndermek
  // anlamsız olurdu.
  const eventWhatsappEnabled = eventType.startsWith("APPOINTMENT_")
    ? (setting?.whatsappAppointmentEnabled ?? true)
    : eventType === "PAYMENT_REMINDER"
      ? (setting?.whatsappPaymentEnabled ?? true)
      : (setting?.whatsappInfoEnabled ?? true);
  const wantsWhatsapp = params.channelPreference === "WHATSAPP"
    || (params.channelPreference !== "SMS" && setting?.defaultNotificationChannel === "WHATSAPP");
  const canUseWhatsapp =
    purpose !== "CONSENT_REQUEST" &&
    institution.whatsappEnabled &&
    wantsWhatsapp &&
    eventWhatsappEnabled &&
    Boolean(patient.whatsappOptInAt) &&
    !patient.whatsappOptOutAt;

  // WhatsApp başarısız olursa gerekçesi burada tutulur ve SMS'e düşüldüğünde
  // (başarılı ya da SUPPRESSED) kayda açıkça yazılır — sessiz düşüş yok.
  let whatsappFailureNote: string | undefined;
  const allowSmsFallback = params.allowSmsFallback ?? setting?.whatsappSmsFallback ?? true;

  if (purpose !== "CONSENT_REQUEST" && wantsWhatsapp && !canUseWhatsapp) {
    const unavailableReason = !institution.whatsappEnabled
      ? "WhatsApp modülü kurum için açık değil."
      : !eventWhatsappEnabled
        ? "Bu bildirim türü için WhatsApp gönderimi kapalı."
        : !patient.whatsappOptInAt || patient.whatsappOptOutAt
          ? "Hastanın WhatsApp iletişim izni bulunmuyor."
          : "WhatsApp kullanılamıyor.";
    if (!allowSmsFallback) {
      await logDispatch({ channel: "WHATSAPP", status: "SUPPRESSED", lastError: unavailableReason });
      return { success: false, channel: "WHATSAPP", suppressed: true, reason: unavailableReason };
    }
    whatsappFailureNote = `${unavailableReason} SMS yedek kanalı denendi.`;
  }

  if (canUseWhatsapp) {
    let waResult;
    try {
      waResult = await sendWhatsapp(patient.phone, params.whatsappMessage || message, {
        institutionId,
        patientId,
        countryCode: patient.phoneCountryCode,
        template: params.whatsappTemplate,
      });
    } catch (error) {
      waResult = {
        success: false,
        deliveryCertainty: "UNKNOWN" as const,
        error: error instanceof Error ? error.message : "WhatsApp sağlayıcısına ulaşılamadı.",
      };
    }
    if (waResult.success) {
      await logDispatch({
        channel: "WHATSAPP",
        status: "SENT",
        providerCode: waResult.providerCode,
        providerMessageId: waResult.providerMessageId,
        sentAt: new Date(),
      });
      return { success: true, channel: "WHATSAPP", providerMessageId: waResult.providerMessageId };
    }
    if (waResult.deliveryCertainty === "UNKNOWN") {
      const reason = `WhatsApp sağlayıcısının yanıtı kesinleşmedi (${waResult.error || "bağlantı kesildi"}). Çift mesajı önlemek için SMS yedek kanalı çalıştırılmadı.`;
      await logDispatch({
        channel: "WHATSAPP",
        status: "QUEUED",
        providerCode: waResult.providerCode,
        providerMessageId: waResult.providerMessageId,
        lastError: reason,
      });
      return { success: false, channel: "WHATSAPP", retryable: false, error: reason };
    }
    // WhatsApp denendi ama başarısız oldu (sağlayıcı tanımlı değil/pasif,
    // bağlantı hatası, geçersiz şablon vb.) — hastaya bilgilendirme hiç
    // gitmemesindense SMS'e düşülür; gerekçe aşağıdaki her kayıtta belirtilir.
    whatsappFailureNote = `WhatsApp denendi, başarısız oldu (${waResult.error || "sağlayıcı hatası"}).`;
    if (!allowSmsFallback) {
      await logDispatch({ channel: "WHATSAPP", status: "FAILED", lastError: whatsappFailureNote });
      return { success: false, channel: "WHATSAPP", error: whatsappFailureNote };
    }
  }

  const withWhatsappNote = (reason: string) => (whatsappFailureNote ? `${whatsappFailureNote} ${reason}` : reason);

  const smsAllowed = purpose === "CONSENT_REQUEST" || smsPreference?.status === "ENABLED";
  if (!smsAllowed) {
    const reason = withWhatsappNote("Hastanın SMS iletişim izni bulunmuyor.");
    await logDispatch({ channel: "SMS", status: "SUPPRESSED", lastError: reason });
    return { success: false, channel: "SMS", suppressed: true, reason };
  }

  if (setting?.smsEnabled === false) {
    const reason = withWhatsappNote("Kurum SMS gönderimini kapatmış.");
    await logDispatch({ channel: "SMS", status: "SUPPRESSED", lastError: reason });
    return { success: false, channel: "SMS", suppressed: true, reason };
  }

  // Bakiyeyi atomik olarak rezerve et — düz "smsBalance <= 0" kontrolü ile ayrı bir
  // decrement arasında yarış durumu olursa bakiye eksiye düşebilir.
  const reservation = await prisma.institution.updateMany({
    where: { id: institutionId, smsBalance: { gte: 1 } },
    data: { smsBalance: { decrement: 1 } },
  });
  if (reservation.count === 0) {
    const reason = withWhatsappNote("SMS bakiyesi yetersiz.");
    await logDispatch({ channel: "SMS", status: "SUPPRESSED", lastError: reason });
    return { success: false, channel: "SMS", suppressed: true, reason };
  }

  let smsResult;
  try {
    smsResult = await sendSms(patient.phone, message);
  } catch (error) {
    // Sağlayıcı çağrısı başlamadan/sonuç üretmeden hata verdiyse ayrılan kredi
    // mutlaka geri alınır. Dış servis sonucu belirsizse aynı idempotency anahtarı
    // otomatik yeniden gönderimi engelleyerek çift mesajı önceler.
    await prisma.institution.update({
      where: { id: institutionId },
      data: { smsBalance: { increment: 1 } },
    });
    const smsError = withWhatsappNote(error instanceof Error ? error.message : "SMS sağlayıcısına ulaşılamadı.");
    await logDispatch({ channel: "SMS", status: "FAILED", lastError: smsError });
    return { success: false, channel: "SMS", retryable: false, error: smsError };
  }
  if (smsResult.success) {
    await logDispatch({
      channel: "SMS",
      status: "SENT",
      providerCode: smsResult.providerCode,
      providerMessageId: smsResult.providerMessageId,
      sentAt: new Date(),
      // Başarılı bir gönderimde lastError alanı normalde boş kalır; burada
      // yalnızca "WhatsApp'tan SMS'e düşüldü" bilgisini kaydetmek için
      // kullanılıyor — bu bir hata değil, şeffaflık notudur.
      lastError: whatsappFailureNote,
    });
    return { success: true, channel: "SMS", providerMessageId: smsResult.providerMessageId };
  }

  // Gönderim başarısız oldu — rezerve edilen krediyi iade et, aksi halde
  // kullanılmayan bir SMS için kurum bakiyesi haksız yere düşmüş olur.
  await prisma.institution.update({
    where: { id: institutionId },
    data: { smsBalance: { increment: 1 } },
  });
  const smsError = withWhatsappNote(smsResult.error || smsResult.providerRaw || "SMS gönderilemedi.");
  await logDispatch({ channel: "SMS", status: "FAILED", lastError: smsError });
  return { success: false, channel: "SMS", error: smsError };
}
