import { createHash, randomUUID, timingSafeEqual } from "crypto";
import Redis from "ioredis";

type RateResult = { ok: boolean; remaining: number; resetAt: number; unavailable?: boolean };
type LocalEntry = { value: string; expiresAt: number };

const globalSecurity = globalThis as typeof globalThis & {
  __klinikcepSecurityRedis?: Redis;
  __klinikcepSecurityLocal?: Map<string, LocalEntry>;
};

function localStore() {
  globalSecurity.__klinikcepSecurityLocal ??= new Map<string, LocalEntry>();
  return globalSecurity.__klinikcepSecurityLocal;
}

function redisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!globalSecurity.__klinikcepSecurityRedis) {
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 3000,
    });
    client.on("error", () => {});
    globalSecurity.__klinikcepSecurityRedis = client;
  }
  return globalSecurity.__klinikcepSecurityRedis;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function namespaced(key: string) {
  return `kc:security:${digest(key)}`;
}

function localGet(key: string) {
  const store = localStore();
  const entry = store.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

function unavailableRateResult(windowMs: number): RateResult {
  return { ok: false, remaining: 0, resetAt: Date.now() + windowMs, unavailable: true };
}

export async function distributedRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const redis = redisClient();
  const storageKey = `${namespaced(key)}:rate`;
  if (!redis) {
    if (process.env.NODE_ENV === "production") return unavailableRateResult(windowMs);
    const current = localGet(storageKey);
    const count = current ? Number(current.value) + 1 : 1;
    const resetAt = current?.expiresAt ?? Date.now() + windowMs;
    localStore().set(storageKey, { value: String(count), expiresAt: resetAt });
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  }

  try {
    const result = await redis.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('PTTL', KEYS[1])
       return {count, ttl}`,
      1,
      storageKey,
      windowMs,
    ) as [number, number];
    const count = Number(result[0]);
    const ttl = Math.max(0, Number(result[1]));
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Date.now() + ttl,
    };
  } catch {
    if (process.env.NODE_ENV === "production") return unavailableRateResult(windowMs);
    const current = localGet(storageKey);
    const count = current ? Number(current.value) + 1 : 1;
    const resetAt = current?.expiresAt ?? Date.now() + windowMs;
    localStore().set(storageKey, { value: String(count), expiresAt: resetAt });
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  }
}

export async function isFailureBlocked(key: string, maxAttempts: number) {
  const storageKey = `${namespaced(key)}:fail`;
  const redis = redisClient();
  if (!redis) {
    if (process.env.NODE_ENV === "production") return true;
    return Number(localGet(storageKey)?.value || 0) >= maxAttempts;
  }
  try {
    return Number(await redis.get(storageKey) || 0) >= maxAttempts;
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export async function recordFailure(key: string, ttlMs: number) {
  const storageKey = `${namespaced(key)}:fail`;
  const redis = redisClient();
  if (!redis) {
    if (process.env.NODE_ENV === "production") return;
    const current = localGet(storageKey);
    localStore().set(storageKey, {
      value: String(Number(current?.value || 0) + 1),
      expiresAt: current?.expiresAt ?? Date.now() + ttlMs,
    });
    return;
  }
  await redis.eval(
    `local count = redis.call('INCR', KEYS[1])
     if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
     return count`,
    1,
    storageKey,
    ttlMs,
  );
}

export async function clearFailures(key: string) {
  const storageKey = `${namespaced(key)}:fail`;
  const redis = redisClient();
  if (!redis) {
    localStore().delete(storageKey);
    return;
  }
  await redis.del(storageKey);
}

export async function putOneTimeSecret(key: string, secret: string, ttlMs: number) {
  const storageKey = `${namespaced(key)}:once`;
  const value = digest(secret);
  const redis = redisClient();
  if (!redis) {
    if (process.env.NODE_ENV === "production") throw new Error("SECURITY_STORE_UNAVAILABLE");
    localStore().set(storageKey, { value, expiresAt: Date.now() + ttlMs });
    return;
  }
  await redis.set(storageKey, value, "PX", ttlMs);
}

export async function hasOneTimeSecret(key: string, secret: string) {
  const storageKey = `${namespaced(key)}:once`;
  const expected = digest(secret);
  const redis = redisClient();
  const actual = redis
    ? await redis.get(storageKey).catch(() => null)
    : process.env.NODE_ENV === "production" ? null : localGet(storageKey)?.value || null;
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function consumeOneTimeSecret(key: string, secret: string) {
  const storageKey = `${namespaced(key)}:once`;
  const expected = digest(secret);
  const redis = redisClient();
  if (!redis) {
    if (process.env.NODE_ENV === "production") return false;
    const entry = localGet(storageKey);
    if (!entry || entry.value.length !== expected.length) return false;
    const matches = timingSafeEqual(Buffer.from(entry.value), Buffer.from(expected));
    if (matches) localStore().delete(storageKey);
    return matches;
  }
  const consumed = await redis.eval(
    `local current = redis.call('GET', KEYS[1])
     if current == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
     return 0`,
    1,
    storageKey,
    expected,
  ).catch(() => 0);
  return Number(consumed) === 1;
}

export async function withDistributedLease<T>(
  key: string,
  ttlMs: number,
  operation: () => Promise<T>,
): Promise<{ acquired: boolean; value?: T }> {
  const storageKey = `${namespaced(key)}:lease`;
  const token = `${process.pid}:${Date.now()}:${randomUUID()}`;
  const redis = redisClient();

  if (!redis) {
    if (process.env.NODE_ENV === "production") return { acquired: false };
    if (localGet(storageKey)) return { acquired: false };
    localStore().set(storageKey, { value: token, expiresAt: Date.now() + ttlMs });
    try {
      return { acquired: true, value: await operation() };
    } finally {
      if (localGet(storageKey)?.value === token) localStore().delete(storageKey);
    }
  }

  const acquired = await redis.set(storageKey, token, "PX", ttlMs, "NX").catch(() => null);
  if (acquired !== "OK") return { acquired: false };
  try {
    return { acquired: true, value: await operation() };
  } finally {
    await redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
      1,
      storageKey,
      token,
    ).catch(() => 0);
  }
}
