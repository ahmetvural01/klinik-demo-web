import { prisma } from "@/lib/prisma";
import type { PanelAdSettings } from "@/lib/panel-ads";

/**
 * Reklam ayarlarının sunucu tarafı (yalnız sunucuda import edilir). Panel
 * kabuğu her açılışta okur; istek başına veritabanına gitmesin diye 60 sn
 * bellekte tutulur. Süperadmin bir ayarı değiştirince önbellek hemen boşaltılır.
 * Önbellek globalThis'te durur: rota işleyicisi ile sayfa ayrı modül kopyası
 * yüklese de aynı süreçte boşaltma iki tarafa da ulaşır.
 */

export type PlatformAdConfigValue = { enabled: boolean; publisherId: string; slotId: string };

const TTL_MS = 60_000;

type AdCache = {
  platform: { value: PlatformAdConfigValue; at: number } | null;
  clinics: Map<string, { value: boolean; at: number }>;
};

const globalForAds = globalThis as typeof globalThis & { __cepklinikAdCache?: AdCache };

function adCache(): AdCache {
  if (!globalForAds.__cepklinikAdCache) globalForAds.__cepklinikAdCache = { platform: null, clinics: new Map() };
  return globalForAds.__cepklinikAdCache;
}

/** Platform reklam ayarı. Veritabanı hatasında son bilinen değer; o da yoksa hata fırlatır. */
export async function getPlatformAdConfig(): Promise<PlatformAdConfigValue> {
  const cache = adCache();
  const now = Date.now();
  if (cache.platform && now - cache.platform.at < TTL_MS) return cache.platform.value;
  try {
    const row = await prisma.platformAdConfig.findUnique({
      where: { id: 1 },
      select: { enabled: true, publisherId: true, slotId: true },
    });
    const value = { enabled: row?.enabled ?? false, publisherId: row?.publisherId ?? "", slotId: row?.slotId ?? "" };
    cache.platform = { value, at: now };
    return value;
  } catch (error) {
    if (cache.platform) return cache.platform.value;
    throw error;
  }
}

async function getClinicAdsEnabled(institutionId: string): Promise<boolean> {
  const cache = adCache();
  const now = Date.now();
  const hit = cache.clinics.get(institutionId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  // Deneme (demo) kliniğinde reklam yok: sistemi deneyen müşteri adayı reklam görmesin.
  const row = await prisma.institution.findUnique({ where: { id: institutionId }, select: { adsEnabled: true, isDemo: true } });
  const value = Boolean(row?.adsEnabled) && !row?.isDemo;
  cache.clinics.set(institutionId, { value, at: now });
  return value;
}

/**
 * Panel kabuğunun reklam alanına verdiği ayar. Kliniksiz oturumda ya da
 * reklamlar platformda kapalıyken null (alan hiç çizilmez). Ekrana ve adrese
 * göre son karar tarayıcıda `shouldShowPanelAd` iledir. Okunamazsa panel
 * reklamsız açılır.
 */
export async function getPanelAdSettings(params: { institutionId: string | null | undefined; ghost: boolean }): Promise<PanelAdSettings | null> {
  if (!params.institutionId) return null;
  try {
    const platform = await getPlatformAdConfig();
    if (!platform.enabled) return null;
    const clinicAdsEnabled = await getClinicAdsEnabled(params.institutionId);
    return { ...platform, clinicAdsEnabled, ghost: params.ghost };
  } catch {
    return null;
  }
}

export function invalidatePlatformAdConfigCache() {
  adCache().platform = null;
}

export function invalidateClinicAdCache(institutionId: string) {
  adCache().clinics.delete(institutionId);
}
