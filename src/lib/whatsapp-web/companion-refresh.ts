import crypto from "node:crypto";

/**
 * WhatsApp, 28 Temmuz 2026 sonrasında QR eşleştirmesine bir adım ekledi:
 * telefon QR'ı okutunca sunucu, bağlanmak isteyen cihaza
 * `<notification type="companion_reg_refresh">` gönderir ve okutulan QR'daki
 * gizli anahtarın (ADV secret) yenilenmesini bekler. Baileys 7.0.0-rc14 bu
 * bildirimi yalnız (başarısız bir şekilde) onaylayıp bırakıyor; sonuç: telefon
 * "bağlantınızı kontrol edin ve tekrar deneyin" der, eşleşme tamamlanmaz ve QR
 * sonunda tükenir (bkz. https://github.com/WhiskeySockets/Baileys/issues/2737,
 * düzeltme önerisi #2765 — henüz yayınlanmış bir sürümde yok).
 *
 * Bu dosya düzeltmeyi kütüphaneyi yamamadan uygular: bildirim gelince yeni bir
 * gizli anahtar üretilir, soketin kimliğine yazılır ve aynı QR bu anahtarla
 * yeniden çizilir; kullanıcı QR'ı bir kez daha okutunca eşleşme tamamlanır.
 * Gerçek WhatsApp sunucusunda doğrulanmıştır.
 *
 * Yan etkisizdir (Baileys/Prisma yüklemez); testlerde sahte soketle denenir.
 */

export const COMPANION_REG_REFRESH_EVENT = "CB:notification,type:companion_reg_refresh";

/**
 * QR metni `https://wa.me/settings/linked_devices#ref,noiseKey,identityKey,advSecret,platform`
 * biçimindedir; yalnız 4. parça (advSecret) değişir. Beklenmeyen biçimde metin
 * olduğu gibi döner (QR bozulmaz).
 */
export function withAdvSecret(rawQr: string, advSecret: string): string {
  const hash = rawQr.indexOf("#");
  if (hash < 0) return rawQr;
  const parts = rawQr.slice(hash + 1).split(",");
  if (parts.length < 4) return rawQr;
  parts[3] = advSecret;
  return `${rawQr.slice(0, hash + 1)}${parts.join(",")}`;
}

export function newAdvSecret(): string {
  return crypto.randomBytes(32).toString("base64");
}

export type CompanionRefreshSocket = {
  ws: {
    on(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
  };
  ev: { emit(event: "creds.update", update: { advSecretKey: string }): unknown };
};

/**
 * Yenileme bildirimini dinler. Dönen fonksiyon dinleyiciyi kaldırır.
 *  - isActive: soket hâlâ güncel mi (eski soketin geç gelen olayı yok sayılır)
 *  - isPaired: cihaz zaten eşleşmişse (creds.me) anahtar değiştirilmez
 *  - onRotated: yeni gizli anahtarla QR yeniden çizilir
 */
export function attachCompanionRefresh(
  sock: CompanionRefreshSocket,
  handlers: { isActive: () => boolean; isPaired: () => boolean; onRotated: (advSecret: string) => void },
): () => void {
  const listener = () => {
    if (!handlers.isActive() || handlers.isPaired()) return;
    const advSecret = newAdvSecret();
    // Soketin kendi dinleyicisi güncellemeyi canlı kimliğe uygular (Object.assign(creds, update)).
    sock.ev.emit("creds.update", { advSecretKey: advSecret });
    handlers.onRotated(advSecret);
  };
  sock.ws.on(COMPANION_REG_REFRESH_EVENT, listener);
  return () => {
    sock.ws.off(COMPANION_REG_REFRESH_EVENT, listener);
  };
}
