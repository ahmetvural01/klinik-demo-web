import { useSyncExternalStore } from "react";
import { turkeyDateKey } from "@/lib/tz";

const noopSubscribe = () => () => {};
const serverSnapshot = () => null;
const clientSnapshot = () => turkeyDateKey();

/**
 * Türkiye takviminde bugün ("YYYY-MM-DD"), hidrasyon güvenli. Sunucu
 * çiziminde ve hidrasyon sırasında null döner, tarayıcıda hemen ardından
 * gerçek gün gelir: sunucu ile tarayıcının günü farklı olsa da (gece yarısı
 * sınırı, saati yanlış cihaz) metin/öznitelik uyuşmazlığı (#418) olmaz
 * (sözleşme §0.5 "Render sırasında new Date() yok"). Sayfa açıldıktan sonra
 * çizilen bileşende ilk çizimde doğrudan gün döner.
 */
export function useTurkeyToday(): string | null {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}
