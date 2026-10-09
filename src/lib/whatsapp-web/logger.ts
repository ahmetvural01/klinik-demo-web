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
 * maskeli açıklama metni ve (varsa) hata nesnesinin KISA MESAJI yazılır
 * (ör. "Bad MAC"); mesaj/düğüm nesneleri yazılmaz. trace/debug/info/warn tamamen
 * susturulur (bunlar telefon numarası ve mesaj düğümleri içerebilir).
 */
/** Baileys hata nesnesini farklı anahtarlarla verir (err / error / ackErr / e). */
export function nestedError(obj: unknown): Error | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of ["err", "error", "ackErr", "e"] as const) {
    const value = (obj as Record<string, unknown>)[key];
    if (value instanceof Error) return value;
  }
  return undefined;
}

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
      logError(institutionId, `Baileys: ${base}`, nestedError(obj));
    },
  };
  return logger;
}
