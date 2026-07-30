import { isIP } from "net";
import { prisma } from "@/lib/prisma";
import { decryptField, encryptField } from "@/lib/field-crypto";

export type WhatsappSendResult = {
  success: boolean;
  providerMessageId?: string;
  providerRaw: string;
  error?: string;
  providerCode?: string;
};

export type WhatsappSendOptions = {
  institutionId?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  countryCode?: string | null;
  template?: {
    name?: string;
    language?: string;
    bodyParameters?: string[];
  };
};

type ProviderConfig = {
  id: string;
  institutionId: string | null;
  code: string;
  name: string;
  providerType: string;
  isActive: boolean;
  priority: number;
  sendUrl: string | null;
  httpMethod: string;
  username: string | null;
  password: string | null;
  apiKey: string | null;
  sender: string | null;
  headersJson: string | null;
  bodyTemplate: string | null;
  successPattern: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string;
  appointmentTemplateName: string | null;
  appointmentTemplateLanguage: string;
};

export function normalizeWhatsappPhone(raw: string, countryCode?: string | null): string | null {
  const phoneDigits = raw.replace(/\D/g, "");
  const countryDigits = String(countryCode || "").replace(/\D/g, "");
  if (!phoneDigits) return null;

  if (raw.trim().startsWith("+") && phoneDigits.length >= 8 && phoneDigits.length <= 15) {
    return phoneDigits;
  }
  if (countryDigits) {
    const local = phoneDigits.replace(/^0+/, "");
    const combined = phoneDigits.startsWith(countryDigits) ? phoneDigits : `${countryDigits}${local}`;
    return combined.length >= 8 && combined.length <= 15 ? combined : null;
  }
  if (phoneDigits.length === 10) return `90${phoneDigits}`;
  if (phoneDigits.length === 11 && phoneDigits.startsWith("0")) return `9${phoneDigits}`;
  if (phoneDigits.length >= 8 && phoneDigits.length <= 15) return phoneDigits;
  return null;
}

function parseHeaders(headersJson: string | null, vars: Record<string, string>): Record<string, string> {
  if (!headersJson) return {};
  try {
    const parsed = JSON.parse(headersJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        renderTemplate(String(value ?? ""), vars),
      ]),
    );
  } catch {
    return {};
  }
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

function validateOutboundUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("WhatsApp gönderim adresi HTTPS olmalıdır.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    (isIP(host) && (
      host.startsWith("10.") ||
      host.startsWith("127.") ||
      host.startsWith("169.254.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ))
  ) {
    throw new Error("Yerel veya özel ağ adreslerine WhatsApp isteği gönderilemez.");
  }
  return url.toString();
}

function extractMessageId(raw: string) {
  try {
    const data = JSON.parse(raw);
    return data?.messages?.[0]?.id || data?.messageId || data?.id || undefined;
  } catch {
    return undefined;
  }
}

async function sendWithMockProvider(provider: ProviderConfig, phone: string, message: string): Promise<WhatsappSendResult> {
  const mockId = `MOCK-WA-${Date.now()}`;
  const payload = {
    provider: provider.code,
    phone,
    message,
    sender: provider.sender || "KlinikPanel",
    queuedAt: new Date().toISOString(),
  };
  await prisma.mockWhatsappLog.create({
    data: {
      phone,
      message,
      sender: provider.sender || "KlinikPanel",
      status: "SENT",
      responseData: JSON.stringify(payload),
    },
  });
  return {
    success: true,
    providerMessageId: mockId,
    providerRaw: JSON.stringify(payload),
    providerCode: provider.code,
  };
}

async function sendWithMetaProvider(
  provider: ProviderConfig,
  phone: string,
  message: string,
  options: WhatsappSendOptions,
): Promise<WhatsappSendResult> {
  const token = decryptField(provider.apiKey || "");
  if (!provider.phoneNumberId || !token) {
    return {
      success: false,
      providerRaw: "META_CONFIG_MISSING",
      error: "Meta telefon numarası kimliği veya erişim anahtarı eksik.",
      providerCode: provider.code,
    };
  }

  const templateName = options.template?.name || provider.appointmentTemplateName;
  const language = options.template?.language || provider.appointmentTemplateLanguage || "tr";
  const body = templateName
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          ...(options.template?.bodyParameters?.length
            ? {
                components: [{
                  type: "body",
                  parameters: options.template.bodyParameters.map((text) => ({ type: "text", text })),
                }],
              }
            : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body: message },
      };

  const response = await fetch(
    `https://graph.facebook.com/${provider.apiVersion || "v23.0"}/${provider.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const raw = (await response.text()).trim();
  return {
    success: response.ok,
    providerMessageId: extractMessageId(raw),
    providerRaw: raw,
    error: response.ok ? undefined : `Meta WhatsApp API HTTP ${response.status}`,
    providerCode: provider.code,
  };
}

async function sendWithTwilioProvider(
  provider: ProviderConfig,
  phone: string,
  message: string,
): Promise<WhatsappSendResult> {
  const accountSid = provider.username?.trim();
  const authToken = decryptField(provider.apiKey || "");
  const from = provider.sender?.trim();

  if (!accountSid || !authToken || !from) {
    return {
      success: false,
      providerRaw: "TWILIO_CONFIG_MISSING",
      error: "Twilio için Account SID, Auth Token ve WhatsApp numarası zorunludur.",
      providerCode: provider.code,
    };
  }

  const sendUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const toFormatted = `whatsapp:+${phone}`;
  const fromDigits = from.replace(/^whatsapp:/, "");
  const fromFormatted = `whatsapp:${fromDigits.startsWith("+") ? fromDigits : `+${fromDigits}`}`;

  const params = new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: message });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const raw = await response.text();

    try {
      const parsed = JSON.parse(raw) as { sid?: string; message?: string; code?: number };
      if (response.ok && parsed.sid) {
        return { success: true, providerMessageId: parsed.sid, providerRaw: raw, providerCode: provider.code };
      }
      return {
        success: false,
        providerRaw: raw,
        error: parsed.message || `Twilio WhatsApp API HTTP ${response.status}`,
        providerCode: provider.code,
      };
    } catch {
      return {
        success: response.ok,
        providerRaw: raw,
        error: response.ok ? undefined : `Twilio WhatsApp API HTTP ${response.status}`,
        providerCode: provider.code,
      };
    }
  } catch (error) {
    return {
      success: false,
      providerRaw: "TWILIO_REQUEST_ERROR",
      error: error instanceof Error ? error.message : "Twilio WhatsApp API'sine erişilemedi.",
      providerCode: provider.code,
    };
  }
}

async function sendWithCustomProvider(
  provider: ProviderConfig,
  phone: string,
  message: string,
): Promise<WhatsappSendResult> {
  if (!provider.sendUrl) {
    return {
      success: false,
      providerRaw: "CUSTOM_SEND_URL_MISSING",
      error: "WhatsApp sağlayıcı gönderim adresi tanımlı değil.",
      providerCode: provider.code,
    };
  }

  const vars = {
    phone,
    message,
    username: provider.username || "",
    password: decryptField(provider.password || ""),
    apiKey: decryptField(provider.apiKey || ""),
    sender: provider.sender || "",
  };
  const headers = parseHeaders(provider.headersJson, vars);
  if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
  const bodyTemplate = provider.bodyTemplate || '{"phone":"{{phone}}","message":"{{message}}"}';

  try {
    const response = await fetch(validateOutboundUrl(provider.sendUrl), {
      method: (provider.httpMethod || "POST").toUpperCase(),
      headers,
      body: renderTemplate(bodyTemplate, vars),
      signal: AbortSignal.timeout(12_000),
    });
    const raw = (await response.text()).trim();
    const success = provider.successPattern ? raw.includes(provider.successPattern) : response.ok;
    return {
      success,
      providerMessageId: extractMessageId(raw),
      providerRaw: raw,
      error: success ? undefined : `WhatsApp sağlayıcısı HTTP ${response.status}`,
      providerCode: provider.code,
    };
  } catch (error) {
    return {
      success: false,
      providerRaw: "CUSTOM_PROVIDER_ERROR",
      error: error instanceof Error ? error.message : "WhatsApp sağlayıcısına erişilemedi.",
      providerCode: provider.code,
    };
  }
}

async function sendWithProvider(
  provider: ProviderConfig,
  phone: string,
  message: string,
  options: WhatsappSendOptions,
) {
  if (provider.code === "MOCK" || provider.providerType === "MOCK") {
    return sendWithMockProvider(provider, phone, message);
  }
  if (provider.providerType === "META_CLOUD") {
    return sendWithMetaProvider(provider, phone, message, options);
  }
  if (provider.providerType === "TWILIO") {
    return sendWithTwilioProvider(provider, phone, message);
  }
  return sendWithCustomProvider(provider, phone, message);
}

export async function getWhatsappProviderConfigs() {
  return prisma.whatsappProviderConfig.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function testWhatsappProviderSend(providerId: string, phoneRaw: string, message: string) {
  const provider = await prisma.whatsappProviderConfig.findUnique({ where: { id: providerId } });
  if (!provider) {
    return {
      success: false,
      providerRaw: "PROVIDER_NOT_FOUND",
      error: "WhatsApp sağlayıcısı bulunamadı.",
    } as WhatsappSendResult;
  }
  const normalizedPhone = normalizeWhatsappPhone(phoneRaw);
  if (!normalizedPhone) {
    return {
      success: false,
      providerRaw: "INVALID_PHONE",
      error: `Geçersiz telefon numarası: ${phoneRaw}`,
      providerCode: provider.code,
    };
  }
  return sendWithProvider(provider, normalizedPhone, message, {});
}

export async function sendWhatsapp(
  phoneRaw: string,
  message: string,
  options: WhatsappSendOptions = {},
): Promise<WhatsappSendResult> {
  const normalizedPhone = normalizeWhatsappPhone(phoneRaw, options.countryCode);
  if (!normalizedPhone) {
    return {
      success: false,
      providerRaw: "INVALID_PHONE",
      error: `Geçersiz telefon numarası: ${phoneRaw}`,
    };
  }

  if (options.patientId) {
    const patient = await prisma.patient.findUnique({
      where: { id: options.patientId },
      select: { whatsappOptInAt: true, whatsappOptOutAt: true },
    });
    if (patient?.whatsappOptOutAt || !patient?.whatsappOptInAt) {
      return {
        success: false,
        providerRaw: "WHATSAPP_CONSENT_REQUIRED",
        error: "Hastanın WhatsApp iletişim izni bulunmuyor.",
      };
    }
  }

  if (!options.institutionId) {
    return {
      success: false,
      providerRaw: "NO_INSTITUTION",
      error: "WhatsApp gönderimi bir kuruma bağlı olmadan yapılamaz.",
    };
  }

  // Platform genelinde paylaşılan bir WhatsApp sağlayıcısı yok — her klinik
  // yalnızca kendi bağladığı sağlayıcıyı kullanır, mesaj hiçbir zaman ortak bir
  // numaradan gitmez (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §3).
  const providers = await prisma.whatsappProviderConfig.findMany({
    where: { isActive: true, institutionId: options.institutionId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (providers.length === 0) {
    return {
      success: false,
      providerRaw: "NO_ACTIVE_PROVIDER",
      error: "Bu klinik için aktif bir WhatsApp sağlayıcısı tanımlı değil.",
    };
  }

  const errors: string[] = [];
  for (const provider of providers) {
    const result = await sendWithProvider(provider, normalizedPhone, message, options);
    if (options.institutionId) {
      await prisma.whatsappMessage.create({
        data: {
          institutionId: options.institutionId,
          providerId: provider.id,
          patientId: options.patientId || null,
          appointmentId: options.appointmentId || null,
          externalMessageId: result.providerMessageId || null,
          direction: "OUTBOUND",
          status: result.success ? "SENT" : "FAILED",
          phone: normalizedPhone,
          content: encryptField(message),
          templateName: options.template?.name || provider.appointmentTemplateName || null,
          errorDetail: result.success ? null : result.error || result.providerRaw.slice(0, 1000),
          sentAt: result.success ? new Date() : null,
          failedAt: result.success ? null : new Date(),
        },
      });
    }
    if (result.success) return result;
    errors.push(`${provider.code}: ${result.error || result.providerRaw}`);
  }

  return {
    success: false,
    providerRaw: errors.join(" | "),
    error: "Tüm etkin WhatsApp sağlayıcılarıyla gönderim başarısız oldu.",
  };
}
