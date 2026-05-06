import Redis from "ioredis";

type RealtimePayload = {
  institutionId: string;
  version: number;
  at: string;
  source: string;
};

type RealtimeListener = (payload: { institutionId: string; version: number; at: string }) => void;

const CHANNEL_PREFIX = "ks:realtime:";
const INSTANCE_ID = Math.random().toString(36).slice(2);
const listenersByInstitution = new Map<string, Set<RealtimeListener>>();
const versionByInstitution = new Map<string, number>();

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let redisReady = false;
let subscribedPattern = false;
let redisDisabledUntil = 0;

function channelForInstitution(institutionId?: string | null) {
  return institutionId || "global";
}

function redisEnabled() {
  return Boolean(process.env.REDIS_URL);
}

function emitLocal(payload: { institutionId: string; version: number; at: string }) {
  const set = listenersByInstitution.get(payload.institutionId);
  if (!set || set.size === 0) return;

  set.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener-specific failures.
    }
  });
}

function applyVersion(institutionId: string, incomingVersion: number) {
  const current = versionByInstitution.get(institutionId) || 0;
  const next = Math.max(current, incomingVersion);
  versionByInstitution.set(institutionId, next);
  return next;
}

async function ensureRedis() {
  if (!redisEnabled() || redisReady) return;
  if (Date.now() < redisDisabledUntil) return;

  try {
    const url = process.env.REDIS_URL as string;
    const pub = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy: () => 3000,
    });
    const sub = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy: () => 3000,
    });

    // Prevent unhandled emitter warnings when Redis is unavailable.
    pub.on("error", () => {});
    sub.on("error", () => {});

    sub.on("pmessage", (_pattern, channel, message) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      try {
        const payload = JSON.parse(message) as RealtimePayload;
        if (!payload?.institutionId || typeof payload.version !== "number") return;
        if (payload.source === INSTANCE_ID) return;

        const nextVersion = applyVersion(payload.institutionId, payload.version);
        emitLocal({
          institutionId: payload.institutionId,
          version: nextVersion,
          at: payload.at || new Date().toISOString(),
        });
      } catch {
        // Ignore malformed pubsub payloads.
      }
    });

    publisher = pub;
    subscriber = sub;

    if (!subscribedPattern) {
      await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
      subscribedPattern = true;
    }

    redisReady = true;
    redisDisabledUntil = 0;
  } catch {
    redisReady = false;
    subscribedPattern = false;
    redisDisabledUntil = Date.now() + 30_000;
    try {
      publisher?.disconnect();
      subscriber?.disconnect();
    } catch {}
    publisher = null;
    subscriber = null;
  }
}

export function getRealtimeInstitutionVersion(institutionId?: string | null) {
  const key = channelForInstitution(institutionId);
  return versionByInstitution.get(key) || 0;
}

export function subscribeRealtimeInstitution(institutionId: string | null | undefined, listener: RealtimeListener) {
  void ensureRedis();
  const key = channelForInstitution(institutionId);
  const set = listenersByInstitution.get(key) || new Set<RealtimeListener>();
  set.add(listener);
  listenersByInstitution.set(key, set);

  return () => {
    const current = listenersByInstitution.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByInstitution.delete(key);
  };
}

export async function bumpRealtimeInstitution(institutionId?: string | null) {
  const key = channelForInstitution(institutionId);
  const nextVersion = (versionByInstitution.get(key) || 0) + 1;
  versionByInstitution.set(key, nextVersion);

  const at = new Date().toISOString();
  emitLocal({ institutionId: key, version: nextVersion, at });

  if (!redisEnabled()) return;
  try {
    await ensureRedis();
    if (!publisher) return;

    const payload: RealtimePayload = {
      institutionId: key,
      version: nextVersion,
      at,
      source: INSTANCE_ID,
    };

    await publisher.publish(`${CHANNEL_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // Fallback to local-only emission when Redis is unavailable.
  }
}
