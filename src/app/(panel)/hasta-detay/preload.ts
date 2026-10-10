"use client";

/**
 * Hasta dosyasının JS parçasını önceden indirir (hasta listesinde satırın
 * üzerine gelince / odaklanınca çağrılabilir). Yalnız kodu ısıtır; hasta
 * verisini istemez — veri isteği KVKK erişim kaydına yazıldığı için ancak
 * dosya gerçekten açılınca gider.
 */
export function preloadHastaDosyasi() {
  void import("./hasta-detay-content").catch(() => undefined);
}
