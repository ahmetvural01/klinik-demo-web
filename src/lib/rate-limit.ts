type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function getClientIpFromHeaders(headers: Headers) {
  // ÖNEMLİ: `x-forwarded-for` zincirinin İLK değeri istemcinin kendisi
  // tarafından serbestçe ayarlanabilir (`X-Forwarded-For: 1.2.3.4` gibi sahte
  // bir değer göndererek IP bazlı rate limit'i sıfırdan saydırabilir — bkz.
  // denetim raporu). Render/Vercel gibi tek güvenilir ters proxy arkasında
  // çalışırken, proxy gerçek bağlantı IP'sini zincirin SONUNA ekler; bu
  // yüzden güvenilir olan SON değerdir, istemcinin gönderdiği ilk değer değil.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") || "unknown";
}
