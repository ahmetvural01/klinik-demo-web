"use client";

// Aynı GET isteğini (ör. /api/auth/me, /api/staff) birçok bileşen bağımsız
// olarak her mount'ta tekrar atıyordu — sayfa değiştikçe aynı veri için
// onlarca gereksiz istek oluşuyordu. Bu modül, use-panel-alerts.ts'deki
// kanıtlanmış bellek-önbellek + eş zamanlı istek birleştirme (in-flight
// dedup) desenini genelleştirir: aynı URL için TTL süresi içindeki tüm
// çağrılar tek bir ağ isteğini paylaşır.

const memoryCache: Record<string, { at: number; data: unknown }> = {};
const inFlight: Record<string, Promise<unknown> | undefined> = {};

export class CachedGetError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CachedGetError";
  }
}

// Kimlik/rol gibi yönlendirme kontrolleri geriye dönük olarak HTTP hatasında
// null alabilir. Seçim listeleri ve ana içerik yükleri ise throwOnError ile
// gerçek hata durumunu boş veriden ayırmalıdır.
export function cachedGet<T = unknown>(
  url: string,
  ttlMs: number,
  options?: { force?: boolean; throwOnError?: boolean },
): Promise<T> {
  const cached = memoryCache[url];
  if (!options?.force && cached && Date.now() - cached.at < ttlMs) {
    return Promise.resolve(cached.data as T);
  }

  const requestKey = `${url}|${options?.throwOnError ? "strict" : "soft"}`;
  const existing = inFlight[requestKey];
  if (existing) return existing as Promise<T>;

  const request = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      if (response.ok) return response.json();
      if (!options?.throwOnError) return null;
      const payload = await response.json().catch(() => null);
      throw new CachedGetError(
        payload?.message || payload?.error || "Bilgiler yüklenemedi. Lütfen yeniden deneyin.",
        response.status,
      );
    })
    .then((data) => {
      if (data !== null) memoryCache[url] = { at: Date.now(), data };
      return data as T;
    })
    .finally(() => {
      inFlight[requestKey] = undefined;
    });

  inFlight[requestKey] = request;
  return request;
}

export function invalidateCachedGet(url: string) {
  delete memoryCache[url];
}

export function clearAllCachedGet() {
  for (const key of Object.keys(memoryCache)) delete memoryCache[key];
  for (const key of Object.keys(inFlight)) delete inFlight[key];
}

export function clearBranchSensitiveClientCaches() {
  clearAllCachedGet();
  if (typeof window === "undefined") return;

  const preservedPreviewRole = sessionStorage.getItem("dev-preview-role");
  sessionStorage.clear();
  if (preservedPreviewRole) sessionStorage.setItem("dev-preview-role", preservedPreviewRole);

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith("panel-alerts:")
        || key?.startsWith("clinic-unread-messages:")
        || key?.startsWith("clinic-messages-last-seen:")
        || key?.startsWith("klinikcep-active-price-list:")
      ) localStorage.removeItem(key);
    }
  } catch {
    // Depolama erişimi kapalıysa şube değişimini engelleme.
  }
}
