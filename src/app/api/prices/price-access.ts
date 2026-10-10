import { requireAnyAuth } from "@/lib/api";

/**
 * Fiyat listesini OKUYABİLEN yetkiler: fiyat ekranı (prices:read) ya da tedavi
 * kaydı girebilen kullanıcı (examinations:write — plan §4). Önceden hekim ve
 * asistan hasta dosyasında kliniğin fiyatlarını okuyamıyor (istek 403), yalnız
 * sabit TDB tarifesi öneriliyordu; yanlış tarife fiyatı yazılabiliyordu.
 * Yazma izinleri değişmez (prices:write).
 */
export const PRICE_READ_PERMISSIONS = ["prices:read", "examinations:write"] as const;

/**
 * Okuma yetkisi kontrolü. requireAnyAuth seçilen izinle requireAuth'u yeniden
 * çalıştırır: kurum politikaları (salt-okunur mod, süperadmin'in kurum dışı
 * erişimi vb.) aynen uygulanır.
 */
export function requirePriceRead() {
  return requireAnyAuth(PRICE_READ_PERMISSIONS);
}
