import { prisma } from "@/lib/prisma";

export type WhatsappSendResult = {
  success: boolean;
  providerMessageId?: string;
  providerRaw: string;
  error?: string;
  providerCode?: string;
};

type ProviderConfig = {
  id: string;
  code: string;
  name: string;
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
};

// Aynı normalizasyon kuralı src/lib/sms.ts'deki normalizePhone() ile aynı —
// WhatsApp API'leri de genelde numarayı ülke koduyla (90XXXXXXXXXX) ister.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `9${digits}`;
  if (digits.length === 12 && digits.startsWith("90")) return digits;
  return null;
}

function parseHeaders(headersJson: string | null): Record<string, string> {
  if (!headersJson) return {};
  try {
    const parsed = JSON.parse(headersJson);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function renderBodyTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

async function sendWithMockProvider(provider: ProviderConfig, phone: string, message: string): Promise<WhatsappSendResult> {
  const mockId = `MOCK-WA-${Date.now()}`;
  const payload = { provider: provider.code, phone, message, sender: provider.sender || "KlinikPanel", queuedAt: new Date().toISOString() };

  await prisma.mockWhatsappLog.create({
    data: { phone, message, sender: provider.sender || "KlinikPanel", status: "SENT", responseData: JSON.stringify(payload) },
  });

  return { success: true, providerMessageId: mockId, providerRaw: JSON.stringify(payload), providerCode: provider.code };
}

async function sendWithCustomProvider(provider: ProviderConfig, phone: string, message: string): Promise<WhatsappSendResult> {
  if (!provider.sendUrl) {
    return { success: false, providerRaw: "CUSTOM_SEND_URL_MISSING", error: "WhatsApp sağlayıcı gönderim adresi tanımlı değil", providerCode: provider.code };
  }

  const headers = parseHeaders(provider.headersJson);
  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const bodyTemplate = provider.bodyTemplate || '{"phone":"{{phone}}","message":"{{message}}"}';
  const body = renderBodyTemplate(bodyTemplate, {
    phone, message,
    username: provider.username || "", password: provider.password || "",
    apiKey: provider.apiKey || "", sender: provider.sender || "",
  });

  const response = await fetch(provider.sendUrl, {
    method: (provider.httpMethod || "POST").toUpperCase(),
    headers,
    body,
  });

  const raw = (await response.text()).trim();

  if (provider.successPattern) {
    const ok = raw.includes(provider.successPattern);
    return { success: ok, providerRaw: raw, error: ok ? undefined : `Başarılı yanıt ölçütü bulunamadı: ${provider.successPattern}`, providerCode: provider.code };
  }

  return { success: response.ok, providerRaw: raw, error: response.ok ? undefined : `HTTP ${response.status}`, providerCode: provider.code };
}

async function sendWithProvider(provider: ProviderConfig, phone: string, message: string): Promise<WhatsappSendResult> {
  if (provider.code === "MOCK") return sendWithMockProvider(provider, phone, message);
  return sendWithCustomProvider(provider, phone, message);
}

export async function getWhatsappProviderConfigs() {
  return prisma.whatsappProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}

export async function testWhatsappProviderSend(providerId: string, phoneRaw: string, message: string) {
  const provider = await prisma.whatsappProviderConfig.findUnique({ where: { id: providerId } });
  if (!provider) {
    return { success: false, providerRaw: "PROVIDER_NOT_FOUND", error: "WhatsApp sağlayıcısı bulunamadı." } as WhatsappSendResult;
  }
  const normalizedPhone = normalizePhone(phoneRaw);
  if (!normalizedPhone) {
    return { success: false, providerRaw: "INVALID_PHONE", error: `Geçersiz telefon numarası: ${phoneRaw}`, providerCode: provider.code };
  }
  return sendWithProvider(provider, normalizedPhone, message);
}

/**
 * Kurumun WhatsApp kanalı açıksa (Institution.whatsappEnabled, yalnızca
 * süperadmin tarafından ayarlanır) ve aktif bir sağlayıcı varsa buradan
 * gönderim yapılır — SMS bakiyesi TÜKETİLMEZ. Kanal kapalıysa veya aktif
 * sağlayıcı yoksa null döner; çağıran taraf bu durumda SMS'e düşmelidir.
 */
export async function sendWhatsapp(phoneRaw: string, message: string): Promise<WhatsappSendResult> {
  const normalizedPhone = normalizePhone(phoneRaw);
  if (!normalizedPhone) {
    return { success: false, providerRaw: "INVALID_PHONE", error: `Geçersiz telefon numarası: ${phoneRaw}` };
  }

  const providers = await prisma.whatsappProviderConfig.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (providers.length === 0) {
    return { success: false, providerRaw: "NO_ACTIVE_PROVIDER", error: "Aktif bir WhatsApp sağlayıcısı tanımlı değil." };
  }

  const errors: string[] = [];
  for (const provider of providers) {
    const result = await sendWithProvider(provider, normalizedPhone, message);
    if (result.success) return result;
    errors.push(`${provider.code}: ${result.error || result.providerRaw}`);
  }

  return { success: false, providerRaw: errors.join(" | "), error: "Tüm etkin WhatsApp sağlayıcılarıyla gönderim başarısız oldu." };
}
