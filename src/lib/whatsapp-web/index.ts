import { WhatsappWebError, WHATSAPP_WEB_UNAVAILABLE_MESSAGE } from "./errors";
import { logError } from "./logger";
import * as manager from "./manager";
import type { WhatsappWebSendMeta, WhatsappWebSendResult, WhatsappWebStatus } from "./types";

/**
 * WhatsApp QR bağlantısının dışa açık yüzü. Baileys yüklenemezse ya da
 * beklenmedik bir hata olursa uygulama çökmez:
 *  - getStatus → ERROR durumu ve Türkçe açıklama,
 *  - sendText / sendSelfTest → { ok:false, code:"UNAVAILABLE" } (çağıran SMS'e düşer),
 *  - connect / disconnect → WhatsappWebError (API rotası Türkçe mesajla döner),
 *  - bootAll → yalnız günlüğe yazar.
 *
 * Hastaya mesaj YALNIZ src/lib/notification-dispatch.ts (dispatchPatientMessage)
 * → src/lib/whatsapp.ts üzerinden gönderilir; sendText'i başka yerden çağırmayın.
 */

export { WhatsappWebError } from "./errors";
export { getDailyLimit } from "./manager";
export {
  WHATSAPP_WEB_DAILY_LIMIT_MARKER,
  WHATSAPP_WEB_PROVIDER_CODE,
  WHATSAPP_WEB_PROVIDER_TYPE,
  WHATSAPP_WEB_RAW_PREFIX,
} from "./types";
export type {
  WhatsappWebPairingMethod,
  WhatsappWebSendCode,
  WhatsappWebSendMeta,
  WhatsappWebSendResult,
  WhatsappWebState,
  WhatsappWebStatus,
  WhatsappWebStatusResponse,
} from "./types";

function toUserError(error: unknown, fallback: string): WhatsappWebError {
  if (error instanceof WhatsappWebError) return error;
  logError(null, fallback, error);
  return new WhatsappWebError(fallback, { status: 500, code: "UNEXPECTED" });
}

export async function getStatus(institutionId: string): Promise<WhatsappWebStatus> {
  try {
    return await manager.getStatus(institutionId);
  } catch (error) {
    logError(institutionId, "WhatsApp bağlantı durumu okunamadı", error);
    return {
      state: "ERROR",
      method: null,
      qrDataUrl: null,
      pairingCode: null,
      pairingExpired: false,
      phone: null,
      name: null,
      error: error instanceof WhatsappWebError ? error.message : "WhatsApp bağlantı durumu şu an okunamadı. Sayfayı yenileyin.",
      notice: null,
      connectedAt: null,
      restrictedUntil: null,
      dailySentCount: 0,
      dailyLimit: manager.getDailyLimit(),
    };
  }
}

export async function connect(
  institutionId: string,
  options: { method: "qr" } | { method: "code"; phone: string },
  actorUserId?: string | null,
): Promise<WhatsappWebStatus> {
  try {
    return await manager.connect(institutionId, options, actorUserId);
  } catch (error) {
    throw toUserError(error, "WhatsApp bağlantısı başlatılamadı. Lütfen tekrar deneyin.");
  }
}

export async function disconnect(
  institutionId: string,
  actorUserId?: string | null,
): Promise<{ wasConnected: boolean; removedFromPhone: boolean }> {
  try {
    return await manager.disconnect(institutionId, actorUserId);
  } catch (error) {
    throw toUserError(error, "WhatsApp bağlantısı kesilemedi. Lütfen tekrar deneyin.");
  }
}

export async function sendText(
  institutionId: string,
  phoneDigits: string,
  text: string,
  meta?: WhatsappWebSendMeta,
): Promise<WhatsappWebSendResult> {
  try {
    return await manager.sendText(institutionId, phoneDigits, text, meta);
  } catch (error) {
    logError(institutionId, "WhatsApp gönderimi başlatılamadı", error);
    return { ok: false, code: "UNAVAILABLE", error: WHATSAPP_WEB_UNAVAILABLE_MESSAGE };
  }
}

export async function sendSelfTest(institutionId: string): Promise<WhatsappWebSendResult> {
  try {
    return await manager.sendSelfTest(institutionId);
  } catch (error) {
    logError(institutionId, "WhatsApp test mesajı gönderilemedi", error);
    return { ok: false, code: "UNAVAILABLE", error: WHATSAPP_WEB_UNAVAILABLE_MESSAGE };
  }
}

/** Sunucu açılışında kayıtlı oturumları yeniden bağlar; asla hata fırlatmaz. */
export async function bootAll(): Promise<void> {
  try {
    await manager.bootAll();
  } catch (error) {
    logError(null, "WhatsApp oturumları açılışta başlatılamadı", error);
  }
}

/** Durum sorgusunda açılış taraması yapılmadıysa arka planda başlatır. */
export function ensureBooted(): void {
  try {
    manager.ensureBooted();
  } catch (error) {
    logError(null, "WhatsApp açılış taraması başlatılamadı", error);
  }
}
