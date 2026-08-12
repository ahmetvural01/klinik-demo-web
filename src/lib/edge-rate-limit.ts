type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkLocalRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (bucket.count >= limit) return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  bucket.count += 1;
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function getClientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const configuredHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10);
    const trustedProxyHops = Number.isFinite(configuredHops) && configuredHops > 0
      ? configuredHops
      : 1;
    const clientIndex = Math.max(0, parts.length - trustedProxyHops);
    if (parts.length > 0) return parts[clientIndex];
  }
  return headers.get("x-real-ip") || "unknown";
}
