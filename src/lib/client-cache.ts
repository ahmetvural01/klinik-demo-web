"use client";

// Aynı GET isteğini (ör. /api/auth/me, /api/staff) birçok bileşen bağımsız
// olarak her mount'ta tekrar atıyordu — sayfa değiştikçe aynı veri için
// onlarca gereksiz istek oluşuyordu. Bu modül, use-panel-alerts.ts'deki
// kanıtlanmış bellek-önbellek + eş zamanlı istek birleştirme (in-flight
// dedup) desenini genelleştirir: aynı URL için TTL süresi içindeki tüm
// çağrılar tek bir ağ isteğini paylaşır.

const memoryCache: Record<string, { at: number; data: unknown }> = {};
const inFlight: Record<string, Promise<unknown> | undefined> = {};

// ÖNEMLİ: Bu fonksiyon HTTP hatasında (401/403/5xx) reddetmez (reject), "null"
// ile çözülür (resolve) — ağ hatası (fetch reddi) dışında asla throw etmez.
// Çağıran taraf ".catch(...)" ile hata yakalamayı beklememeli; dönen değerin
// null olabileceğini kontrol etmelidir (örn. `const d = await cachedGet(...); if (!d) ...`).
export function cachedGet<T = unknown>(url: string, ttlMs: number): Promise<T> {
  const cached = memoryCache[url];
  if (cached && Date.now() - cached.at < ttlMs) {
    return Promise.resolve(cached.data as T);
  }

  const existing = inFlight[url];
  if (existing) return existing as Promise<T>;

  const request = fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data !== null) memoryCache[url] = { at: Date.now(), data };
      return data as T;
    })
    .finally(() => {
      inFlight[url] = undefined;
    });

  inFlight[url] = request;
  return request;
}

export function invalidateCachedGet(url: string) {
  delete memoryCache[url];
}
