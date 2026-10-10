/**
 * ESKİ betik — artık HİÇBİR ŞEY YAZMAZ, yalnız uyarı verir.
 *
 * Önceden "üst izni olan role ince taneli izni de ekle" kuralıyla yetki
 * matrisine yazıyordu (appointments:write → appointments:delete,
 * installments:write → installments:delete, dashboard:read → dashboard:stats).
 * Güncel varsayılan matriste bu izinler BİLEREK ayrıldı: doktor randevu
 * iptal etmez, banko/asistan taksit planı iptal etmez, kurum özeti herkese
 * açık değildir. Betik bu kararları geri alıyor ve matrisi "kaydedilmiş"
 * yaptığı için kurulumu koddaki varsayılan güncellemelerinden koparıyordu
 * (bkz. src/lib/role-permission-store.ts followsDefaults).
 *
 * Mevcut bir kurulumda güncel varsayılanı uygulamanın yolu:
 * Süperadmin › Rol Yetkileri › "Önerilen varsayılandan farklar"ı inceleyin →
 * "Varsayılana döndür". (Kaydedilmiş özelleştirmeler varsa önce not alın.)
 *
 * Kullanım (geriye uyumluluk için duruyor): npm run backfill:fine-grained-permissions
 */
const message = [
  "backfill-fine-grained-permissions: Bu betik artık yetki matrisine YAZMAZ.",
  "Güncel varsayılan matriste randevu iptali, taksit planı iptali ve kurum özeti bilerek ayrı izinlerdir;",
  "eski betik bunları geri ekleyip kurulumu varsayılan güncellemelerinden koparıyordu.",
  "Yapılacak: Süperadmin › Rol Yetkileri › farkları inceleyin → \"Varsayılana döndür\".",
  "",
].join("\n");

process.stdout.write(message);

// Modül olarak derlensin (genel kapsamda ad çakışması olmasın).
export {};
