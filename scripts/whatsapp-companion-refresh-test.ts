import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import {
  attachCompanionRefresh,
  COMPANION_REG_REFRESH_EVENT,
  newAdvSecret,
  withAdvSecret,
} from "../src/lib/whatsapp-web/companion-refresh";
import { PairingCodeRejectedError, requestPairingCodeChecked } from "../src/lib/whatsapp-web/pairing-code";
import { createBaileysLogger } from "../src/lib/whatsapp-web/logger";

// WhatsApp (28 Temmuz 2026 sonrası) QR okutulunca `companion_reg_refresh`
// bildirimi gönderip gizli anahtarın yenilenmesini ister; Baileys rc14 yapmıyor.
// Bu test, bizim düzeltmemizin parçalarını sahte soketle doğrular.
// (Gerçek WhatsApp sunucusunda ayrıca telefonla doğrulanmıştır.)

const QR = "https://wa.me/settings/linked_devices#REF123,NOISEKEY,IDENTITYKEY,OLDADV,PLATFORM9";

async function main() {
  // 1) QR metninde yalnız 4. parça (gizli anahtar) değişir
  assert.equal(
    withAdvSecret(QR, "NEWADV"),
    "https://wa.me/settings/linked_devices#REF123,NOISEKEY,IDENTITYKEY,NEWADV,PLATFORM9",
  );
  assert.equal(withAdvSecret("beklenmeyen-metin", "NEWADV"), "beklenmeyen-metin", "Tanınmayan QR metni bozulmamalı.");
  assert.equal(withAdvSecret("x#a,b,c", "NEWADV"), "x#a,b,c", "Eksik parçalı QR metni bozulmamalı.");

  // 2) Yeni gizli anahtar: 32 rastgele bayt, base64
  const a = newAdvSecret();
  const b = newAdvSecret();
  assert.equal(Buffer.from(a, "base64").length, 32);
  assert.notEqual(a, b, "Her yenilemede farklı anahtar üretilmeli.");

  // 3) Bildirim gelince: kimliğe yeni anahtar yazılır ve QR yeniden çizilir
  const ws = new EventEmitter();
  const updates: Array<{ advSecretKey: string }> = [];
  const rotated: string[] = [];
  const state = { active: true, paired: false };
  const detach = attachCompanionRefresh(
    {
      ws: { on: (event, listener) => ws.on(event, listener), off: (event, listener) => ws.off(event, listener) },
      ev: { emit: (_event, update) => { updates.push(update); return true; } },
    },
    { isActive: () => state.active, isPaired: () => state.paired, onRotated: (secret) => rotated.push(secret) },
  );
  assert.equal(ws.listenerCount(COMPANION_REG_REFRESH_EVENT), 1);

  ws.emit(COMPANION_REG_REFRESH_EVENT);
  assert.equal(updates.length, 1, "creds.update ile yeni anahtar yayınlanmalı.");
  assert.equal(rotated.length, 1);
  assert.equal(updates[0].advSecretKey, rotated[0], "Kimliğe yazılan ve QR'da gösterilen anahtar aynı olmalı.");

  // 4) Her yenileme isteğinde yeniden döner (kullanıcı QR'ı tekrar okutabilir)
  ws.emit(COMPANION_REG_REFRESH_EVENT);
  assert.equal(rotated.length, 2);
  assert.notEqual(rotated[0], rotated[1]);

  // 5) Eşleşmiş cihazda veya eski soketten gelen olayda anahtar DEĞİŞMEZ
  state.paired = true;
  ws.emit(COMPANION_REG_REFRESH_EVENT);
  state.paired = false;
  state.active = false;
  ws.emit(COMPANION_REG_REFRESH_EVENT);
  assert.equal(rotated.length, 2, "Eşleşmiş ya da eski soket anahtarı değiştirmemeli.");

  // 6) Dinleyici kaldırılır
  detach();
  assert.equal(ws.listenerCount(COMPANION_REG_REFRESH_EVENT), 0);

  // 7) Yönetici düzeltmeyi gerçekten kullanıyor ve tüm geçmiş eşitlemesini kapatmıyor
  const manager = fs.readFileSync(path.join(process.cwd(), "src/lib/whatsapp-web/manager.ts"), "utf8");
  assert(manager.includes("attachCompanionRefresh(sock"), "Yönetici QR eşleştirmesinde yenileme dinleyicisini bağlamalı.");
  assert(manager.includes("withAdvSecret("), "QR güncel gizli anahtarla çizilmeli.");
  assert(!manager.includes("shouldSyncHistoryMessage: () => false"), "Baileys ilk açılış eşitlemesini kapatmayı kararsız sayıyor; kapatılmamalı.");

  assert(manager.includes("requestPairingCodeChecked(sock"), "Telefon numarasıyla bağlamada kod, WhatsApp isteği kabul ettikten sonra gösterilmeli.");
  assert(manager.includes("Browsers.ubuntu("), "Telefon numarasıyla bağlama standart cihaz adıyla yapılmalı (özel ad reddedilebiliyor).");

  // 8) Telefon numarasıyla bağlama: sunucunun yanıtı beklenir
  const fakeSocket = (reply: (ws: EventEmitter) => void) => {
    const ws = new EventEmitter();
    return {
      ws,
      sock: {
        ws: { on: (event: string, listener: (frame: unknown) => void) => ws.on(event, listener), off: (event: string, listener: (frame: unknown) => void) => ws.off(event, listener) },
        requestPairingCode: async () => { setTimeout(() => reply(ws), 5); return "ABCD1234"; },
      },
    };
  };
  const ok = fakeSocket((ws) => ws.emit("frame", { tag: "iq", attrs: { type: "result" }, content: [{ tag: "link_code_companion_reg", attrs: {} }] }));
  assert.equal(await requestPairingCodeChecked(ok.sock as never, "905000000000", { waitMs: 500 }), "ABCD1234");
  assert.equal(ok.ws.listenerCount("frame"), 0, "Dinleyici temizlenmeli.");

  const rejected = fakeSocket((ws) => ws.emit("frame", { tag: "iq", attrs: { type: "error" }, content: [{ tag: "error", attrs: { code: "400", text: "bad-request" } }] }));
  await assert.rejects(
    () => requestPairingCodeChecked(rejected.sock as never, "905000000000", { waitMs: 500 }),
    (error: unknown) => error instanceof PairingCodeRejectedError && /400 bad-request/.test(error.message),
    "WhatsApp isteği reddederse ölü kod gösterilmemeli.",
  );
  assert.equal(rejected.ws.listenerCount("frame"), 0);

  const silent = fakeSocket(() => undefined);
  assert.equal(await requestPairingCodeChecked(silent.sock as never, "905000000000", { waitMs: 30 }), "ABCD1234", "Yanıt gelmezse kod yine gösterilir.");
  const ignored = fakeSocket((ws) => ws.emit("frame", { tag: "notification", attrs: { type: "error" } }));
  assert.equal(await requestPairingCodeChecked(ignored.sock as never, "905000000000", { waitMs: 30 }), "ABCD1234", "iq olmayan çerçeveler yok sayılmalı.");

  // 9) Günlük: hata MESAJI görünür (teşhis için), numara maskelenir, mesaj/düğüm nesneleri yazılmaz
  const lines: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const logger = createBaileysLogger("kurum-123456789");
    logger.error({ error: new Error("Bad MAC for 905454046939"), node: { gizli: "MESAJ-ICERIGI" } }, "error in handling message");
    logger.error({ ackErr: new Error("Cannot read properties of undefined") }, "failed to ack notification");
    logger.error({ node: { gizli: "MESAJ-ICERIGI" } }, "hata");
  } finally {
    console.error = originalError;
  }
  assert(lines[0].includes("error in handling message: Bad MAC for ***39"), "Hata mesajı günlükte görünmeli (numara maskeli).");
  assert(lines[1].includes("failed to ack notification: Cannot read properties of undefined"));
  assert(lines.every((line) => !line.includes("MESAJ-ICERIGI") && !line.includes("905454046939")), "Mesaj/düğüm içeriği ve telefon numarası günlüğe yazılmamalı.");

  console.log("WhatsApp QR gizli anahtar yenileme ve eşleştirme kodu kontrolleri başarılı.");
}

void main();
