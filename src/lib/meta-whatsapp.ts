import crypto from "crypto";

type GraphError = {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

type TokenDebug = {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number;
    data_access_expires_at?: number;
    scopes?: string[];
  };
};

export type MetaEmbeddedSignupResult = {
  accessToken: string;
  registrationPin: string;
  tokenExpiresAt: Date | null;
  businessAccountId: string;
  businessId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  apiVersion: string;
};

const DEFAULT_API_VERSION = "v25.0";

const META_CONFIG_KEYS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_EMBEDDED_SIGNUP_CONFIG_ID",
  "META_WEBHOOK_VERIFY_TOKEN",
] as const;

export function getMetaWhatsappReadiness() {
  const missing = META_CONFIG_KEYS.filter((key) => !process.env[key]?.trim());
  return { ready: missing.length === 0, missing };
}

export function getMetaWhatsappConfig() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  const apiVersion = process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_API_VERSION;
  if (!appId || !appSecret || !configId || !verifyToken) {
    throw new Error("Meta WhatsApp ortam yapılandırması tamamlanmamış.");
  }
  return { appId, appSecret, configId, verifyToken, apiVersion };
}

export function getMetaWhatsappPublicConfig() {
  const { appId, configId, apiVersion } = getMetaWhatsappConfig();
  return { appId, configId, apiVersion };
}

function appSecretProof(token: string, appSecret: string) {
  return crypto.createHmac("sha256", appSecret).update(token).digest("hex");
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: T & GraphError;
  try {
    parsed = JSON.parse(text) as T & GraphError;
  } catch {
    throw new Error(`Meta API geçersiz yanıt verdi (HTTP ${response.status}).`);
  }
  if (!response.ok || parsed.error) {
    const code = parsed.error?.code ? ` [${parsed.error.code}]` : "";
    throw new Error(`${parsed.error?.message || `Meta API HTTP ${response.status}`}${code}`);
  }
  return parsed;
}

async function graphRequest<T>(
  path: string,
  token: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>,
) {
  const { appSecret, apiVersion } = getMetaWhatsappConfig();
  const separator = path.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com/${apiVersion}/${path}${separator}appsecret_proof=${appSecretProof(token, appSecret)}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  return readJson<T>(response);
}

export async function completeMetaEmbeddedSignup(input: {
  code: string;
  businessAccountId: string;
  phoneNumberId: string;
  businessId?: string | null;
}): Promise<MetaEmbeddedSignupResult> {
  const config = getMetaWhatsappConfig();
  const tokenUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("code", input.code);

  const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(15_000) });
  const tokenData = await readJson<{ access_token?: string }>(tokenResponse);
  if (!tokenData.access_token) throw new Error("Meta erişim anahtarı üretilemedi.");
  const accessToken = tokenData.access_token;

  const debugUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", `${config.appId}|${config.appSecret}`);
  const debugResponse = await fetch(debugUrl, { signal: AbortSignal.timeout(15_000) });
  const debug = await readJson<TokenDebug>(debugResponse);
  if (!debug.data?.is_valid || debug.data.app_id !== config.appId) {
    throw new Error("Meta bağlantı kodu bu uygulama için geçerli değil.");
  }
  const scopes = new Set(debug.data.scopes || []);
  if (!scopes.has("whatsapp_business_management") || !scopes.has("whatsapp_business_messaging")) {
    throw new Error("Meta hesabı gerekli WhatsApp yönetim ve mesajlaşma izinlerini vermedi.");
  }

  const numbers = await graphRequest<{
    data?: Array<{
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
    }>;
  }>(`${encodeURIComponent(input.businessAccountId)}/phone_numbers?fields=id,display_phone_number,verified_name`, accessToken);
  const phone = numbers.data?.find((item) => item.id === input.phoneNumberId);
  if (!phone) throw new Error("Seçilen telefon numarası seçilen WhatsApp Business hesabına ait değil.");

  const registrationPin = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await graphRequest<{ success?: boolean }>(`${encodeURIComponent(input.phoneNumberId)}/register`, accessToken, "POST", {
    messaging_product: "whatsapp",
    pin: registrationPin,
  });
  await graphRequest<{ success?: boolean }>(`${encodeURIComponent(input.businessAccountId)}/subscribed_apps`, accessToken, "POST");

  const expiresAt = debug.data.data_access_expires_at || debug.data.expires_at;
  return {
    accessToken,
    registrationPin,
    tokenExpiresAt: expiresAt ? new Date(expiresAt * 1000) : null,
    businessAccountId: input.businessAccountId,
    businessId: input.businessId || null,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: phone.display_phone_number || null,
    verifiedName: phone.verified_name || null,
    apiVersion: config.apiVersion,
  };
}

export async function unsubscribeMetaWaba(businessAccountId: string, accessToken: string) {
  await graphRequest<{ success?: boolean }>(`${encodeURIComponent(businessAccountId)}/subscribed_apps`, accessToken, "DELETE");
}

export function hashEmbeddedSignupState(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
