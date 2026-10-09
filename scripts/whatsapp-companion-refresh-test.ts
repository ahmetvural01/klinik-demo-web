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

// WhatsApp (28 Temmuz 2026 sonrası) QR okutulunca `companion_reg_refresh`
// bildirimi gönderip gizli anahtarın yenilenmesini ister; Baileys rc14 yapmıyor.
// Bu test, bizim düzeltmemizin parçalarını sahte soketle doğrular.
// (Gerçek WhatsApp sunucusunda ayrıca telefonla doğrulanmıştır.)

const QR = "https://wa.me/settings/linked_devices#REF123,NOISEKEY,IDENTITYKEY,OLDADV,PLATFORM9";

function main() {
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

  console.log("WhatsApp QR gizli anahtar yenileme kontrolleri başarılı.");
}

main();
