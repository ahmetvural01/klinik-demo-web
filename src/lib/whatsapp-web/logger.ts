import type { BaileysLogger } from "./baileys-loader";

/**
 * WhatsApp QR bağlantısının günlükleri. Telefon numarası, JID ve mesaj
 * içeriği günlüğe YAZILMAZ: Baileys'in nesne argümanları (mesaj, düğüm,
 * kişi bilgisi içerebilir) tamamen atılır, yalnız kısa açıklama metni
 * tutulur ve içindeki uzun rakam dizileri maskelenir.
 */

const PREFIX = "[whatsapp-web]";

export function maskSensitiveText(text: string): string {
  return text
    .replace(/\d{6,}/g, (digits) => `***${digits.slice(-2)}`)
    .slice(0, 300);
}

function institutionTag(institutionId: string | null | undefined) {
  return institutionId ? ` kurum=${institutionId.slice(0, 10)}` : "";
}

export function logWarn(institutionId: string | null | undefined, message: string) {
  console.warn(`${PREFIX}${institutionTag(institutionId)} ${maskSensitiveText(message)}`);
}

export function logError(institutionId: string | null | undefined, message: string, error?: unknown) {
  const detail = error instanceof Error ? `: ${maskSensitiveText(error.message)}` : "";
  console.error(`${PREFIX}${institutionTag(institutionId)} ${maskSensitiveText(message)}${detail}`);
}

/**
 * Baileys'e verilen sessiz günlükçü. Yalnız "error" seviyesindeki olayların
 * maskeli açıklama metni yazılır; trace/debug/info/warn tamamen susturulur
 * (bunlar telefon numarası ve mesaj düğümleri içerebilir).
 */
export function createBaileysLogger(institutionId: string): BaileysLogger {
  const logger: BaileysLogger = {
    level: "error",
    child: () => logger,
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (obj: unknown, msg?: string) => {
      const base = typeof msg === "string" && msg ? msg : typeof obj === "string" ? obj : "Baileys hatası";
      const nested = obj && typeof obj === "object" && "err" in obj ? (obj as { err?: unknown }).err : undefined;
      logError(institutionId, `Baileys: ${base}`, nested instanceof Error ? nested : undefined);
    },
  };
  return logger;
}
