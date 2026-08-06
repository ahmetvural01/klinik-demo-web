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
  | "MANUAL_SMS"
  | "BULK_SMS";

export type DispatchPurpose = "SERVICE" | "GREETING" | "CONSENT_REQUEST";

export type DispatchResult = {
  success: boolean;
  channel: "SMS" | "WHATSAPP";
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
  /** Aynı olayın ikinci kez gönderilmesini engeller, ör. `appt:${id}:reminder`. */
  idempotencyKey: string;
  actorId?: string | null;
  whatsappTemplate?: { name?: string; language?: string; bodyParameters?: string[] };
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
  return {
    success: existing.status === "SENT" || existing.status === "DELIVERED",
    channel: existing.channel,
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
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
    },
  });
  if (!patient) {
    return { success: false, channel: "SMS", error: "Hasta bulunamadı veya arşivlenmiş." };
  }

  const [institution, setting, smsPreference] = await Promise.all([
    prisma.institution.findUnique({ where: { id: institutionId }, select: { whatsappEnabled: true } }),
    prisma.setting.findUnique({ where: { institutionId }, select: { defaultNotificationChannel: true, smsEnabled: true } }),
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
    status: "SENT" | "FAILED" | "SUPPRESSED";
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
  const canUseWhatsapp =
    purpose !== "CONSENT_REQUEST" &&
    institution.whatsappEnabled &&
    setting?.defaultNotificationChannel === "WHATSAPP" &&
    Boolean(patient.whatsappOptInAt) &&
    !patient.whatsappOptOutAt;

  // WhatsApp başarısız olursa gerekçesi burada tutulur ve SMS'e düşüldüğünde
  // (başarılı ya da SUPPRESSED) kayda açıkça yazılır — sessiz düşüş yok.
  let whatsappFailureNote: string | undefined;

  if (canUseWhatsapp) {
    const waResult = await sendWhatsapp(patient.phone, message, {
      institutionId,
      patientId,
      countryCode: patient.phoneCountryCode,
      template: params.whatsappTemplate,
    });
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
    // WhatsApp denendi ama başarısız oldu (sağlayıcı tanımlı değil/pasif,
    // bağlantı hatası, geçersiz şablon vb.) — hastaya bilgilendirme hiç
    // gitmemesindense SMS'e düşülür; gerekçe aşağıdaki her kayıtta belirtilir.
    whatsappFailureNote = `WhatsApp denendi, başarısız oldu (${waResult.error || waResult.providerRaw || "bilinmeyen hata"}).`;
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

  const smsResult = await sendSms(patient.phone, message);
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
