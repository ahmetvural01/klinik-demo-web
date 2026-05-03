import { prisma } from "@/lib/prisma";

export type SmsSendResult = {
  success: boolean;
  providerMessageId?: string;
  providerRaw: string;
  error?: string;
  providerCode?: string;
};

export type SmsBalanceResult = {
  success: boolean;
  balance?: string;
  raw: string;
  error?: string;
};

type ProviderConfig = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  priority: number;
  sendUrl: string | null;
  balanceUrl: string | null;
  httpMethod: string;
  username: string | null;
  password: string | null;
  apiKey: string | null;
  sender: string | null;
  headersJson: string | null;
  bodyTemplate: string | null;
  successPattern: string | null;
};

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return `90${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `9${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("90")) {
    return digits;
  }

  return null;
}

async function sendViaNetgsm(
  phone: string,
  message: string,
  provider?: ProviderConfig,
): Promise<SmsSendResult> {
  const usercode = provider?.username?.trim() || process.env.NETGSM_USERCODE;
  const password = provider?.password?.trim() || process.env.NETGSM_PASSWORD;
  const msgheader = provider?.sender?.trim() || process.env.NETGSM_HEADER;
  const sendUrl = provider?.sendUrl?.trim() || "https://api.netgsm.com.tr/sms/send/get/";

  if (!usercode || !password || !msgheader) {
    return {
      success: false,
      providerRaw: "CONFIG_ERROR",
      error: "NETGSM ayarlari eksik. Kullanici adi, sifre ve gonderen (baslik) zorunludur.",
      providerCode: provider?.code || "NETGSM",
    };
  }

  const params = new URLSearchParams({
    usercode,
    password,
    gsmno: phone,
    message,
    msgheader,
  });

  const response = await fetch(sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = (await response.text()).trim();

  // Netgsm basarili sonuc olarak genelde numerik bir batch/message id doner.
  if (/^\d+$/.test(raw) && raw.length > 3) {
    return {
      success: true,
      providerMessageId: raw,
      providerRaw: raw,
      providerCode: provider?.code || "NETGSM",
    };
  }

  return {
    success: false,
    providerRaw: raw,
    error: `NETGSM hata kodu: ${raw}`,
    providerCode: provider?.code || "NETGSM",
  };
}

async function sendViaTwilio(provider: ProviderConfig, phone: string, message: string): Promise<SmsSendResult> {
  const accountSid = provider.username?.trim();
  const authToken = provider.apiKey?.trim() || provider.password?.trim();
  const from = provider.sender?.trim();

  if (!accountSid || !authToken || !from) {
    return {
      success: false,
      providerRaw: "TWILIO_CONFIG_ERROR",
      error: "Twilio icin username(Account SID), password/apiKey(Auth Token) ve sender(From) zorunlu.",
      providerCode: provider.code,
    };
  }

  const sendUrlTemplate =
    provider.sendUrl?.trim() ||
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const sendUrl = sendUrlTemplate.replace(/{{\s*username\s*}}/g, accountSid);

  const params = new URLSearchParams({
    To: `+${phone}`,
    From: from.startsWith("+") ? from : `+${from}`,
    Body: message,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as { sid?: string; message?: string; code?: number };
    if (response.ok && parsed.sid) {
      return {
        success: true,
        providerMessageId: parsed.sid,
        providerRaw: raw,
        providerCode: provider.code,
      };
    }

    return {
      success: false,
      providerRaw: raw,
      error: parsed.message || `HTTP ${response.status}`,
      providerCode: provider.code,
    };
  } catch {
    return {
      success: response.ok,
      providerRaw: raw,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      providerCode: provider.code,
    };
  }
}

function parseHeaders(headersJson: string | null): Record<string, string> {
  if (!headersJson) return {};
  try {
    const parsed = JSON.parse(headersJson);
    return typeof parsed === "object" && parsed ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function renderBodyTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

async function sendWithCustomProvider(provider: ProviderConfig, phone: string, message: string): Promise<SmsSendResult> {
  if (!provider.sendUrl) {
    return {
      success: false,
      providerRaw: "CUSTOM_SEND_URL_MISSING",
      error: "Provider sendUrl tanimli degil",
      providerCode: provider.code,
    };
  }

  const headers = parseHeaders(provider.headersJson);
  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const bodyTemplate = provider.bodyTemplate || "phone={{phone}}&message={{message}}";
  const body = renderBodyTemplate(bodyTemplate, {
    phone,
    message,
    username: provider.username || "",
    password: provider.password || "",
    apiKey: provider.apiKey || "",
    sender: provider.sender || "",
  });

  const response = await fetch(provider.sendUrl, {
    method: (provider.httpMethod || "POST").toUpperCase(),
    headers,
    body,
  });

  const raw = (await response.text()).trim();

  if (provider.successPattern) {
    const ok = raw.includes(provider.successPattern);
    return {
      success: ok,
      providerRaw: raw,
      error: ok ? undefined : `Basari paterni bulunamadi: ${provider.successPattern}`,
      providerCode: provider.code,
    };
  }

  return {
    success: response.ok,
    providerRaw: raw,
    error: response.ok ? undefined : `HTTP ${response.status}`,
    providerCode: provider.code,
  };
}

async function sendWithMockProvider(provider: ProviderConfig, phone: string, message: string): Promise<SmsSendResult> {
  const mockId = `MOCK-${Date.now()}`;
  const payload = {
    provider: provider.code,
    phone,
    message,
    sender: provider.sender || "KlinikModern",
    queuedAt: new Date().toISOString(),
  };

  await prisma.mockSmsLog.create({
    data: {
      phone,
      message,
      sender: provider.sender || "KlinikModern",
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

async function sendWithProvider(provider: ProviderConfig, phone: string, message: string): Promise<SmsSendResult> {
  if (provider.code === "MOCK") {
    return sendWithMockProvider(provider, phone, message);
  }

  if (provider.code === "TWILIO") {
    return sendViaTwilio(provider, phone, message);
  }

  if (provider.code === "NETGSM") {
    const result = await sendViaNetgsm(phone, message, provider);
    return { ...result, providerCode: provider.code };
  }

  return sendWithCustomProvider(provider, phone, message);
}

export async function getProviderConfigs() {
  return prisma.smsProviderConfig.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function testProviderSend(providerId: string, phoneRaw: string, message: string) {
  const provider = await prisma.smsProviderConfig.findUnique({ where: { id: providerId } });
  if (!provider) {
    return {
      success: false,
      providerRaw: "PROVIDER_NOT_FOUND",
      error: "Saglayici bulunamadi",
    } as SmsSendResult;
  }

  const normalizedPhone = normalizePhone(phoneRaw);
  if (!normalizedPhone) {
    return {
      success: false,
      providerRaw: "INVALID_PHONE",
      error: `Gecersiz telefon numarasi: ${phoneRaw}`,
      providerCode: provider.code,
    };
  }

  return sendWithProvider(provider, normalizedPhone, message);
}

function parseBalance(raw: string): string | null {
  const text = raw.trim();
  const numeric = text.match(/(\d+(?:[.,]\d+)?)/);
  return numeric ? numeric[1] : null;
}

async function getProviderBalanceInternal(provider: ProviderConfig): Promise<SmsBalanceResult> {
  if (provider.code === "MOCK") {
    return {
      success: true,
      balance: "UNLIMITED",
      raw: "Mock provider: ucretsiz test modu",
    };
  }

  if (provider.code === "NETGSM") {
    const usercode = provider.username || process.env.NETGSM_USERCODE;
    const password = provider.password || process.env.NETGSM_PASSWORD;
    const url = provider.balanceUrl || "https://api.netgsm.com.tr/balance/list/xml";

    if (!usercode || !password) {
      return { success: false, raw: "", error: "Kullanici/sifre eksik" };
    }

    const params = new URLSearchParams({ usercode, password });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const raw = await response.text();
    return {
      success: response.ok,
      balance: parseBalance(raw) || undefined,
      raw,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  }

  if (provider.code === "TWILIO") {
    const accountSid = provider.username?.trim();
    const authToken = provider.apiKey?.trim() || provider.password?.trim();

    if (!accountSid || !authToken) {
      return { success: false, raw: "", error: "Twilio Account SID/Auth Token eksik" };
    }

    const balanceUrlTemplate =
      provider.balanceUrl?.trim() ||
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`;
    const balanceUrl = balanceUrlTemplate.replace(/{{\s*username\s*}}/g, accountSid);

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(balanceUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const raw = await response.text();
    if (!response.ok) {
      return { success: false, raw, error: `HTTP ${response.status}` };
    }

    try {
      const parsed = JSON.parse(raw) as { balance?: string; currency?: string };
      return {
        success: true,
        balance: parsed.balance ? `${parsed.balance} ${parsed.currency || ""}`.trim() : undefined,
        raw,
      };
    } catch {
      return { success: true, balance: parseBalance(raw) || undefined, raw };
    }
  }

  if (!provider.balanceUrl) {
    return { success: false, raw: "", error: "balanceUrl tanimli degil" };
  }

  const headers = parseHeaders(provider.headersJson);
  const response = await fetch(provider.balanceUrl, {
    method: (provider.httpMethod || "POST").toUpperCase(),
    headers,
  });
  const raw = await response.text();
  return {
    success: response.ok,
    balance: parseBalance(raw) || undefined,
    raw,
    error: response.ok ? undefined : `HTTP ${response.status}`,
  };
}

export async function testProviderBalance(providerId: string) {
  const provider = await prisma.smsProviderConfig.findUnique({ where: { id: providerId } });
  if (!provider) {
    return { success: false, raw: "", error: "Saglayici bulunamadi" } as SmsBalanceResult;
  }
  return getProviderBalanceInternal(provider);
}

export async function sendSms(phoneRaw: string, message: string): Promise<SmsSendResult> {
  const normalizedPhone = normalizePhone(phoneRaw);

  if (!normalizedPhone) {
    return {
      success: false,
      providerRaw: "INVALID_PHONE",
      error: `Gecersiz telefon numarasi: ${phoneRaw}`,
    };
  }

  const providers = await prisma.smsProviderConfig.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (providers.length > 0) {
    const errors: string[] = [];
    for (const provider of providers) {
      const result = await sendWithProvider(provider, normalizedPhone, message);
      if (result.success) return result;
      errors.push(`${provider.code}: ${result.error || result.providerRaw}`);
    }

    return {
      success: false,
      providerRaw: errors.join(" | "),
      error: "Tum aktif saglayicilarla gonderim basarisiz",
    };
  }

  const provider = (process.env.SMS_PROVIDER || "NETGSM").toUpperCase();

  if (provider === "NETGSM") {
    const result = await sendViaNetgsm(normalizedPhone, message);
    return { ...result, providerCode: "NETGSM" };
  }

  return {
    success: false,
    providerRaw: "UNSUPPORTED_PROVIDER",
    error: `Desteklenmeyen SMS saglayici: ${provider}`,
  };
}
