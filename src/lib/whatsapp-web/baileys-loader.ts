import { WhatsappWebError, WHATSAPP_WEB_UNAVAILABLE_MESSAGE } from "./errors";

/**
 * Baileys 7 yalnız ESM'dir ve WASM/protobuf dosyaları paketlenirse bozulur;
 * bu yüzden next.config.mjs `serverExternalPackages` listesinde tutulur ve
 * yalnız burada, çalışma anında dinamik import ile yüklenir. Modül
 * yüklenemezse (eksik kurulum, desteklenmeyen Node sürümü) uygulama çökmez;
 * çağıran anlaşılır bir Türkçe hata alır ve mesajlar SMS'e düşer.
 */
export type BaileysModule = typeof import("@whiskeysockets/baileys");
export type BaileysSocket = import("@whiskeysockets/baileys").WASocket;
export type BaileysLogger = import("@whiskeysockets/baileys").SocketConfig["logger"];

let loading: Promise<BaileysModule> | null = null;

export async function loadBaileys(): Promise<BaileysModule> {
  if (!loading) {
    loading = import("@whiskeysockets/baileys").catch((error: unknown) => {
      // Bir sonraki çağrı yeniden denesin (ör. kurulum sonrası sıcak yeniden yükleme).
      loading = null;
      console.error(
        "[whatsapp-web] Baileys yüklenemedi:",
        error instanceof Error ? error.message : "bilinmeyen hata",
      );
      throw new WhatsappWebError(WHATSAPP_WEB_UNAVAILABLE_MESSAGE, { status: 503, code: "UNAVAILABLE" });
    });
  }
  return loading;
}
