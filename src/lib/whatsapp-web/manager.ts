import crypto from "crypto";
import os from "os";
import QRCode from "qrcode";
import type {
  BaileysEventMap,
  ReachoutTimelockState,
  SignalKeyStore,
  WAVersion,
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/api";
import { turkeyDateKey } from "@/lib/tz";
import { loadBaileys, type BaileysModule, type BaileysSocket } from "./baileys-loader";
import {
  assertCredentialStorageReady,
  clearAuthState,
  hasStoredPairedCreds,
  isPairedCreds,
  loadAuthState,
  type LoadedAuthState,
} from "./auth-state";
import { WhatsappWebError, WHATSAPP_WEB_UNAVAILABLE_MESSAGE } from "./errors";
import { attachCompanionRefresh, withAdvSecret } from "./companion-refresh";
import { createBaileysLogger, logError, logWarn } from "./logger";
import { formatWhatsappDisplayPhone, maskPhoneDigits } from "./phone";
import {
  WHATSAPP_WEB_PROVIDER_CODE,
  WHATSAPP_WEB_PROVIDER_TYPE,
  type WhatsappWebPairingMethod,
  type WhatsappWebSendCode,
  type WhatsappWebSendMeta,
  type WhatsappWebSendResult,
  type WhatsappWebState,
  type WhatsappWebStatus,
} from "./types";

/**
 * Tek süreçte tüm kliniklerin WhatsApp "bağlı cihaz" oturumlarını yönetir.
 *
 * - Durum globalThis üzerinde tutulur: Next.js geliştirme modunda sıcak
 *   yeniden yüklemede ve instrumentation/rota paketleri arasında aynı oturum
 *   iki kez açılmaz.
 * - Kiralama (lease): aynı veritabanını kullanan iki sunucu süreci aynı
 *   oturumu açıp WhatsApp'ı "bağlantı değiştirildi" döngüsüne sokmasın diye
 *   oturum yalnız kirayı tutan süreçte açılır (30 sn'de bir yenilenir, 90 sn
 *   geçerli).
 * - Gelen mesajlar ve telefondan yazılan mesajlar sisteme ALINMAZ, saklanmaz,
 *   günlüğe yazılmaz; geçmiş eşitleme kapalıdır. Yalnız bizim gönderdiğimiz
 *   mesajların iletildi/okundu bilgisi gönderim kaydına (SmsDispatch) işlenir.
 * - Mesajlar arasında yapay bekleme ve "yazıyor" göstergesi YOKTUR (klinik
 *   sahibinin kararı); kurum başına sıra yalnız Signal oturum yarışını önler.
 */

const PROVIDER_NAME = "WhatsApp (QR ile bağlı)";
const BROWSER: [string, string, string] = ["CepKlinik", "Chrome", "1.0.0"];
const SELF_TEST_MESSAGE = "CepKlinik WhatsApp bağlantısı çalışıyor ✓";

const LEASE_TTL_MS = 90_000;
const LEASE_RENEW_MS = 30_000;
const LEASE_RETRY_MS = 30_000;
const QUEUE_TIMEOUT_MS = 10 * 60_000;

// Aynı kliniğin iki mesajı arasında kısa, rastgele bir aralık (varsayılan
// 1,5–3 sn): art arda saniyede onlarca mesaj WhatsApp'a otomatik gönderim gibi
// görünüp numarayı kısıtlatabilir. Kullanıcı beklemez; toplu gönderim arka
// planda sürer. Ortam değişkenleriyle ayarlanabilir.
function sendGapMs(): number {
  const min = Number.parseInt(process.env.WHATSAPP_WEB_MIN_GAP_MS || "", 10);
  const max = Number.parseInt(process.env.WHATSAPP_WEB_MAX_GAP_MS || "", 10);
  const low = Number.isFinite(min) && min >= 0 ? min : 1_500;
  const high = Number.isFinite(max) && max >= low ? max : Math.max(low, 3_000);
  return low + Math.floor(Math.random() * (high - low + 1));
}
const MAX_QUEUE_LENGTH = 1_000;
const SEND_TIMEOUT_MS = 45_000;
const NUMBER_CHECK_TIMEOUT_MS = 20_000;
const LOGOUT_TIMEOUT_MS = 10_000;
const NUMBER_CACHE_TTL_MS = 24 * 60 * 60_000;
const NUMBER_CACHE_MAX = 5_000;
const RECENT_SENT_MAX = 5_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60_000;
const RECONNECT_ERROR_AFTER = 3;
const PAIRING_WAIT_MS = 12_000;
const PAIRING_ATTEMPTS_PER_HOUR = 10;
const PAIRING_EXPIRED_VISIBLE_MS = 15 * 60_000;
const SELF_TEST_COOLDOWN_MS = 30_000;
const BOOT_START_DELAY_MS = 5_000;
const BOOT_GAP_MS = 2_000;
const VERSION_CACHE_MS = 6 * 60 * 60_000;
const VERSION_RETRY_MS = 10 * 60_000;
const RESTRICTION_ON_463_MS = 60 * 60_000;
const RECEIPT_LOOKBACK_MS = 14 * 24 * 60 * 60_000;

const SEND_ERRORS: Record<WhatsappWebSendCode, string> = {
  NOT_CONNECTED: "Kliniğin WhatsApp numarası şu an bağlı değil.",
  NOT_ON_WHATSAPP: "Bu telefon numarası WhatsApp kullanmıyor.",
  DAILY_LIMIT: "Günlük WhatsApp gönderim sınırına ulaşıldı.",
  QUEUE_TIMEOUT: "WhatsApp gönderim sırası 10 dakikadan uzun sürdü.",
  QUEUE_FULL: "WhatsApp gönderim sırası dolu.",
  RESTRICTED: "WhatsApp bu numaradan gönderimi geçici olarak kısıtladı.",
  CHECK_FAILED: "Numaranın WhatsApp kullanıp kullanmadığı doğrulanamadı.",
  INVALID_PHONE: "Telefon numarası geçersiz.",
  SEND_FAILED: "WhatsApp mesajı gönderilemedi.",
  SEND_UNCERTAIN: "WhatsApp gönderiminin sonucu kesinleşmedi.",
  UNAVAILABLE: WHATSAPP_WEB_UNAVAILABLE_MESSAGE,
};

type SocketMode = { kind: "resume" } | { kind: "pair"; method: WhatsappWebPairingMethod; phone: string | null };

type QueueItem = {
  run: () => Promise<WhatsappWebSendResult>;
  resolve: (result: WhatsappWebSendResult) => void;
  timer: NodeJS.Timeout;
  settled: boolean;
};

type SessionAuth = { loaded: LoadedAuthState; keys: SignalKeyStore };

type Session = {
  institutionId: string;
  /** Her soket başlatma/durdurmada artar; eski soketin geç gelen olayları yok sayılır. */
  generation: number;
  sock: BaileysSocket | null;
  detach: (() => void) | null;
  mode: SocketMode | null;
  auth: SessionAuth | null;
  state: WhatsappWebState;
  stopping: boolean;
  qr: { dataUrl: string; at: number } | null;
  /** Baileys'in verdiği son QR metni; WhatsApp gizli anahtarı yenilettiğinde yeniden çizilir. */
  rawQr: string | null;
  pairingCode: { code: string; at: number } | null;
  pairingRequested: boolean;
  pairingExpiredAt: number | null;
  lastMethod: WhatsappWebPairingMethod | null;
  justPaired: boolean;
  phone: string | null;
  name: string | null;
  error: string | null;
  notice: string | null;
  connectedAt: Date | null;
  restrictedUntil: Date | null;
  restrictionReason: string | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  hasLease: boolean;
  leaseTimer: NodeJS.Timeout | null;
  leaseRetryTimer: NodeJS.Timeout | null;
  actorUserId: string | null;
  queue: QueueItem[];
  pumping: boolean;
  /** Son gerçek gönderimin bittiği an (iki mesaj arasındaki kısa bekleme için). */
  lastSentAt: number;
  numberCache: Map<string, { exists: boolean; jid: string | null; at: number }>;
  recentSent: Map<string, number>;
  pairingStarts: number[];
  lastSelfTestAt: number;
  waiters: Set<() => void>;
  lock: Promise<void>;
};

type ManagerState = {
  processId: string;
  sessions: Map<string, Session>;
  booted: boolean;
  shutdownHooked: boolean;
  version: { value: WAVersion | undefined; at: number; ttl: number } | null;
};

const GLOBAL_KEY = Symbol.for("cepklinik.whatsappWeb");
type GlobalWithManager = typeof globalThis & { [GLOBAL_KEY]?: ManagerState };

function managerState(): ManagerState {
  const g = globalThis as GlobalWithManager;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      processId: `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`,
      sessions: new Map(),
      booted: false,
      shutdownHooked: false,
      version: null,
    };
  }
  return g[GLOBAL_KEY];
}

function getSession(institutionId: string): Session {
  const { sessions } = managerState();
  let session = sessions.get(institutionId);
  if (!session) {
    session = {
      institutionId,
      generation: 0,
      sock: null,
      detach: null,
      mode: null,
      auth: null,
      state: "NOT_CONNECTED",
      stopping: false,
      qr: null,
      rawQr: null,
      pairingCode: null,
      pairingRequested: false,
      pairingExpiredAt: null,
      lastMethod: null,
      justPaired: false,
      phone: null,
      name: null,
      error: null,
      notice: null,
      connectedAt: null,
      restrictedUntil: null,
      restrictionReason: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      hasLease: false,
      leaseTimer: null,
      leaseRetryTimer: null,
      actorUserId: null,
      queue: [],
      pumping: false,
      lastSentAt: 0,
      numberCache: new Map(),
      recentSent: new Map(),
      pairingStarts: [],
      lastSelfTestAt: 0,
      waiters: new Set(),
      lock: Promise.resolve(),
    };
    sessions.set(institutionId, session);
  }
  return session;
}

/** connect/disconnect/yeniden bağlanma adımları kurum başına sırayla yürür. */
function withSessionLock<T>(session: Session, work: () => Promise<T>): Promise<T> {
  const run = session.lock.then(work);
  session.lock = run.then(() => undefined, () => undefined);
  return run;
}

function unrefTimer(timer: NodeJS.Timeout) {
  timer.unref?.();
  return timer;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    unrefTimer(setTimeout(resolve, ms));
  });
}

class TimeoutError extends Error {
  constructor() {
    super("Zaman aşımı");
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = unrefTimer(setTimeout(() => reject(new TimeoutError()), ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getDailyLimit(): number {
  const parsed = Number.parseInt(process.env.WHATSAPP_WEB_DAILY_LIMIT || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5_000) : 400;
}

function isFeatureEnabled() {
  return process.env.ENABLE_WHATSAPP_WEB !== "false";
}

function setState(session: Session, state: WhatsappWebState) {
  session.state = state;
  for (const waiter of [...session.waiters]) waiter();
}

function isCurrentSocket(session: Session, generation: number, sock: BaileysSocket) {
  return session.generation === generation && session.sock === sock;
}

function disconnectStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const output = (error as { output?: { statusCode?: unknown } }).output;
  return typeof output?.statusCode === "number" ? output.statusCode : undefined;
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

function phoneDigitsFromUser(baileys: BaileysModule, user: BaileysSocket["user"]): string | null {
  if (!user) return null;
  for (const candidate of [user.phoneNumber, user.id]) {
    if (!candidate) continue;
    const decoded = baileys.jidDecode(candidate);
    if (decoded?.server === "s.whatsapp.net" && /^\d{6,15}$/.test(decoded.user)) return decoded.user;
  }
  return null;
}

// ── Kiralama ────────────────────────────────────────────────────────────────

function stopLeaseTimers(session: Session) {
  if (session.leaseTimer) clearInterval(session.leaseTimer);
  if (session.leaseRetryTimer) clearTimeout(session.leaseRetryTimer);
  session.leaseTimer = null;
  session.leaseRetryTimer = null;
}

async function acquireLease(session: Session): Promise<boolean> {
  const { processId } = managerState();
  const { institutionId } = session;
  try {
    await prisma.whatsappWebSession.upsert({ where: { institutionId }, create: { institutionId }, update: {} });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const now = new Date();
  const result = await prisma.whatsappWebSession.updateMany({
    where: {
      institutionId,
      OR: [{ leaseOwner: null }, { leaseUntil: null }, { leaseUntil: { lt: now } }, { leaseOwner: processId }],
    },
    data: { leaseOwner: processId, leaseUntil: new Date(now.getTime() + LEASE_TTL_MS) },
  });
  if (result.count !== 1) return false;
  session.hasLease = true;
  if (session.leaseRetryTimer) clearTimeout(session.leaseRetryTimer);
  session.leaseRetryTimer = null;
  if (!session.leaseTimer) {
    session.leaseTimer = unrefTimer(setInterval(() => {
      void renewLease(session);
    }, LEASE_RENEW_MS));
  }
  return true;
}

async function renewLease(session: Session) {
  if (!session.hasLease) return;
  const { processId } = managerState();
  try {
    const result = await prisma.whatsappWebSession.updateMany({
      where: { institutionId: session.institutionId, leaseOwner: processId },
      data: { leaseUntil: new Date(Date.now() + LEASE_TTL_MS) },
    });
    if (result.count === 0) await handleLeaseLost(session);
  } catch (error) {
    // Geçici veritabanı hatası: başka süreç de kirayı alamaz; bir sonraki turda tekrar denenir.
    logError(session.institutionId, "Kiralama yenilenemedi", error);
  }
}

async function releaseLease(session: Session) {
  stopLeaseTimers(session);
  if (!session.hasLease) return;
  session.hasLease = false;
  const { processId } = managerState();
  try {
    await prisma.whatsappWebSession.updateMany({
      where: { institutionId: session.institutionId, leaseOwner: processId },
      data: { leaseOwner: null, leaseUntil: null },
    });
  } catch (error) {
    logError(session.institutionId, "Kiralama bırakılamadı", error);
  }
}

async function handleLeaseLost(session: Session) {
  session.hasLease = false;
  stopLeaseTimers(session);
  await stopSocket(session);
  session.error = "Bu WhatsApp bağlantısı başka bir sunucu sürecinde açık; bu süreç bağlantıyı bıraktı.";
  setState(session, "ERROR");
  logWarn(session.institutionId, "kiralama başka bir sürece geçti; oturum bu süreçte kapatıldı");
  scheduleLeaseRetry(session);
}

function scheduleLeaseRetry(session: Session) {
  if (session.leaseRetryTimer) return;
  session.leaseRetryTimer = unrefTimer(setTimeout(() => {
    session.leaseRetryTimer = null;
    void resumeSession(session, "lease").catch((error: unknown) => logError(session.institutionId, "Kiralama sonrası bağlantı başlatılamadı", error));
  }, LEASE_RETRY_MS));
}

// ── Sağlayıcı kaydı, kanal ve denetim ───────────────────────────────────────

function providerWhere(institutionId: string) {
  return { institutionId_code: { institutionId, code: WHATSAPP_WEB_PROVIDER_CODE } };
}

async function markProviderConnecting(institutionId: string) {
  await prisma.whatsappProviderConfig.upsert({
    where: providerWhere(institutionId),
    create: {
      institutionId,
      code: WHATSAPP_WEB_PROVIDER_CODE,
      name: PROVIDER_NAME,
      providerType: WHATSAPP_WEB_PROVIDER_TYPE,
      isActive: false,
      priority: 10,
      connectionStatus: "CONNECTING",
    },
    update: {
      name: PROVIDER_NAME,
      providerType: WHATSAPP_WEB_PROVIDER_TYPE,
      isActive: false,
      connectionStatus: "CONNECTING",
      connectionError: null,
    },
  });
}

async function markProviderConnected(session: Session, firstLink: boolean) {
  const now = new Date();
  const existing = await prisma.whatsappProviderConfig.findUnique({
    where: providerWhere(session.institutionId),
    select: { connectedAt: true },
  });
  const connectedAt = firstLink || !existing?.connectedAt ? now : existing.connectedAt;
  const data = {
    name: PROVIDER_NAME,
    providerType: WHATSAPP_WEB_PROVIDER_TYPE,
    isActive: true,
    connectionStatus: "CONNECTED" as const,
    connectedAt,
    disconnectedAt: null,
    displayPhoneNumber: session.phone ? formatWhatsappDisplayPhone(session.phone) : null,
    verifiedName: session.name,
    connectionError: null,
  };
  await prisma.whatsappProviderConfig.upsert({
    where: providerWhere(session.institutionId),
    create: { institutionId: session.institutionId, code: WHATSAPP_WEB_PROVIDER_CODE, priority: 10, ...data },
    update: data,
  });
  session.connectedAt = connectedAt;
}

async function markProviderStatus(
  institutionId: string,
  status: "NOT_CONNECTED" | "CONNECTING" | "ERROR" | "DISCONNECTED",
  extra: { isActive?: boolean; connectionError?: string | null; disconnectedAt?: Date | null } = {},
  onlyFrom?: "CONNECTING" | "CONNECTED",
) {
  await prisma.whatsappProviderConfig.updateMany({
    where: { institutionId, code: WHATSAPP_WEB_PROVIDER_CODE, ...(onlyFrom ? { connectionStatus: onlyFrom } : {}) },
    data: { connectionStatus: status, ...extra },
  });
}

/** İlk bağlantıda: kanal SMS ise WhatsApp'a (SMS yedeği açık) alınır. */
async function switchDefaultChannelToWhatsapp(institutionId: string): Promise<boolean> {
  const result = await prisma.setting.updateMany({
    where: { institutionId, defaultNotificationChannel: "SMS" },
    data: { defaultNotificationChannel: "WHATSAPP", whatsappSmsFallback: true },
  });
  return result.count > 0;
}

/** Bağlantı gidince: başka bağlı WhatsApp sağlayıcısı yoksa kanal SMS'e döner. */
async function revertDefaultChannelToSms(institutionId: string): Promise<boolean> {
  const otherConnected = await prisma.whatsappProviderConfig.count({
    where: { institutionId, code: { not: WHATSAPP_WEB_PROVIDER_CODE }, isActive: true, connectionStatus: "CONNECTED" },
  });
  if (otherConnected > 0) return false;
  const result = await prisma.setting.updateMany({
    where: { institutionId, defaultNotificationChannel: "WHATSAPP" },
    data: { defaultNotificationChannel: "SMS" },
  });
  return result.count > 0;
}

async function resolveSystemAuditUser(institutionId: string): Promise<string | null> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { ownerId: true } });
  if (institution?.ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: institution.ownerId, institutionId, isActive: true },
      select: { id: true },
    });
    if (owner) return owner.id;
  }
  const manager = await prisma.user.findFirst({
    where: { institutionId, role: "YONETICI", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return manager?.id ?? null;
}

/**
 * Denetim kaydı. İşlemi bir kullanıcı başlattıysa onun adına; telefondan
 * kaldırma gibi kendiliğinden olaylarda kliniğin sahibine/ilk yöneticisine
 * "Otomatik:" önekiyle yazılır.
 */
async function auditEvent(institutionId: string, action: string, detail: string, actorUserId?: string | null) {
  try {
    const userId = actorUserId || (await resolveSystemAuditUser(institutionId));
    if (!userId) return;
    await writeAudit(userId, action, actorUserId ? detail : `Otomatik: ${detail}`);
  } catch (error) {
    logError(institutionId, "Denetim kaydı yazılamadı", error);
  }
}

// ── Kısıtlama (WhatsApp'ın gönderim engeli) ─────────────────────────────────

function activeRestriction(session: Session): Date | null {
  if (!session.restrictedUntil) return null;
  if (session.restrictedUntil.getTime() <= Date.now()) {
    session.restrictedUntil = null;
    session.restrictionReason = null;
    return null;
  }
  return session.restrictedUntil;
}

function applyRestriction(session: Session, until: Date, reason: string) {
  const previous = activeRestriction(session);
  if (previous && previous.getTime() >= until.getTime()) return;
  session.restrictedUntil = until;
  session.restrictionReason = reason;
  logWarn(session.institutionId, `WhatsApp gönderim kısıtlaması: ${until.toISOString()} tarihine kadar mesajlar SMS'e düşecek`);
  if (!previous) {
    void auditEvent(
      session.institutionId,
      "WHATSAPP_WEB_RESTRICTED",
      `${reason} Kısıtlama bitene kadar (${until.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}) mesajlar SMS ile gider.`,
    );
  }
}

function clearRestriction(session: Session) {
  session.restrictedUntil = null;
  session.restrictionReason = null;
}

function applyReachoutTimelock(session: Session, lock: ReachoutTimelockState) {
  if (!lock.isActive) {
    clearRestriction(session);
    return;
  }
  const until = lock.timeEnforcementEnds instanceof Date && lock.timeEnforcementEnds.getTime() > Date.now()
    ? lock.timeEnforcementEnds
    : new Date(Date.now() + RESTRICTION_ON_463_MS);
  applyRestriction(session, until, "WhatsApp bu numaradan yeni kişilere mesaj gönderimini geçici olarak kısıtladı.");
}

// ── Soket yaşam döngüsü ─────────────────────────────────────────────────────

async function resolveWaVersion(baileys: BaileysModule): Promise<WAVersion | undefined> {
  const state = managerState();
  if (state.version && Date.now() - state.version.at < state.version.ttl) return state.version.value;
  try {
    const latest = await baileys.fetchLatestWaWebVersion({ signal: AbortSignal.timeout(6_000) });
    state.version = latest.isLatest
      ? { value: latest.version, at: Date.now(), ttl: VERSION_CACHE_MS }
      : { value: undefined, at: Date.now(), ttl: VERSION_RETRY_MS };
  } catch {
    state.version = { value: undefined, at: Date.now(), ttl: VERSION_RETRY_MS };
  }
  return state.version.value;
}

function clearReconnectTimer(session: Session) {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = null;
}

/** Soketi kapatır (telefondaki bağlantıyı KALDIRMADAN); dinleyiciler ve zamanlayıcılar temizlenir. */
async function stopSocket(session: Session) {
  session.stopping = true;
  session.generation += 1;
  clearReconnectTimer(session);
  const sock = session.sock;
  const detach = session.detach;
  session.sock = null;
  session.detach = null;
  detach?.();
  if (sock) {
    try {
      await sock.end(undefined);
    } catch {
      // Kapanmakta olan soket — yok sayılır.
    }
  }
}

function disposeAuth(session: Session) {
  session.auth?.loaded.dispose();
  session.auth = null;
}

async function ensureAuth(session: Session, baileys: BaileysModule): Promise<SessionAuth> {
  if (session.auth) return session.auth;
  const loaded = await loadAuthState(baileys, session.institutionId);
  const keys = baileys.makeCacheableSignalKeyStore(loaded.state.keys, createBaileysLogger(session.institutionId));
  session.auth = { loaded, keys };
  return session.auth;
}

async function startSocket(session: Session, mode: SocketMode): Promise<void> {
  const baileys = await loadBaileys();
  clearReconnectTimer(session);
  if (session.sock) await stopSocket(session);
  const generation = ++session.generation;
  session.stopping = false;
  session.mode = mode;
  session.pairingRequested = false;
  if (mode.kind === "pair") {
    session.qr = null;
    session.rawQr = null;
    session.pairingCode = null;
    session.notice = null;
  }

  const auth = await ensureAuth(session, baileys);
  if (generation !== session.generation) return;
  const version = await resolveWaVersion(baileys);
  if (generation !== session.generation) return;

  const logger = createBaileysLogger(session.institutionId);
  const sock = baileys.makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: auth.loaded.state.creds, keys: auth.keys },
    logger,
    browser: BROWSER,
    countryCode: "TR",
    // Telefona bildirimler gitmeye devam etsin (bağlı cihaz "çevrimiçi" görünmez).
    markOnlineOnConnect: false,
    // Tam geçmiş istenmez. İlk açılış eşitlemesi (LID eşleşmeleri, uygulama durumu
    // anahtarları) KAPATILMAZ: tamamını kapatmak Baileys'e göre kararsızlığa ve
    // oturum hatalarına yol açıyor. Mesaj içeriği zaten dinlenmez/saklanmaz.
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  });
  session.sock = sock;
  setState(session, "CONNECTING");

  const onConnectionUpdate = (update: BaileysEventMap["connection.update"]) => {
    void handleConnectionUpdate(session, baileys, generation, sock, update).catch((error: unknown) => {
      logError(session.institutionId, "Bağlantı olayı işlenemedi", error);
    });
  };
  const onCredsUpdate = () => {
    if (session.generation !== generation) return;
    void auth.loaded.saveCreds().catch(() => undefined);
  };
  const onMessagesUpdate = (updates: BaileysEventMap["messages.update"]) => {
    if (session.generation !== generation) return;
    void handleMessageStatusUpdates(session, baileys, updates).catch((error: unknown) => {
      logError(session.institutionId, "İletim bilgisi işlenemedi", error);
    });
  };
  const onReceiptUpdate = (updates: BaileysEventMap["message-receipt.update"]) => {
    if (session.generation !== generation) return;
    void handleReceiptUpdates(session, updates).catch((error: unknown) => {
      logError(session.institutionId, "Okundu bilgisi işlenemedi", error);
    });
  };
  const onCappingUpdate = (info: BaileysEventMap["message-capping.update"]) => {
    if (session.generation !== generation) return;
    handleCappingUpdate(session, info);
  };

  sock.ev.on("connection.update", onConnectionUpdate);
  sock.ev.on("creds.update", onCredsUpdate);
  sock.ev.on("messages.update", onMessagesUpdate);
  sock.ev.on("message-receipt.update", onReceiptUpdate);
  sock.ev.on("message-capping.update", onCappingUpdate);
  // Not: "messages.upsert" (gelen/telefondan yazılan mesajlar) bilinçli olarak dinlenmez.

  // WhatsApp, QR okutulunca gizli anahtarın yenilenmesini ister; kütüphane bunu
  // yapmıyor (bkz. companion-refresh.ts). Yenilenince aynı QR yeni anahtarla çizilir.
  const detachRefresh = mode.kind === "pair" && mode.method === "qr"
    ? attachCompanionRefresh(sock, {
        isActive: () => isCurrentSocket(session, generation, sock),
        isPaired: () => Boolean(auth.loaded.state.creds.me),
        onRotated: () => {
          logWarn(session.institutionId, "WhatsApp QR okutulunca gizli anahtarın yenilenmesini istedi; QR yeniden gösteriliyor");
          void rerenderQr(session, generation, sock).catch((error: unknown) => {
            logError(session.institutionId, "QR yenilenemedi", error);
          });
        },
      })
    : null;
  session.detach = () => {
    detachRefresh?.();
    sock.ev.off("connection.update", onConnectionUpdate);
    sock.ev.off("creds.update", onCredsUpdate);
    sock.ev.off("messages.update", onMessagesUpdate);
    sock.ev.off("message-receipt.update", onReceiptUpdate);
    sock.ev.off("message-capping.update", onCappingUpdate);
  };
}

async function handleConnectionUpdate(
  session: Session,
  baileys: BaileysModule,
  generation: number,
  sock: BaileysSocket,
  update: BaileysEventMap["connection.update"],
) {
  if (!isCurrentSocket(session, generation, sock)) return;
  if (update.reachoutTimeLock) applyReachoutTimelock(session, update.reachoutTimeLock);
  if (update.isNewLogin) {
    // Telefon QR'ı okuttu / kodu girdi: WhatsApp birazdan soketi yeniden başlatmamızı ister.
    session.justPaired = true;
    session.qr = null;
    session.rawQr = null;
    session.notice = null;
    session.pairingCode = null;
    setState(session, "CONNECTING");
  }
  if (update.qr) await handleQr(session, generation, sock, update.qr);
  if (update.connection === "open") await handleOpen(session, baileys, generation, sock);
  else if (update.connection === "close") await handleClose(session, baileys, generation, sock, update.lastDisconnect?.error);
  else if (update.connection === "connecting" && session.state !== "QR" && session.state !== "ERROR") setState(session, "CONNECTING");
}

const QR_REFRESHED_NOTICE =
  "WhatsApp güvenlik için QR'ı yeniledi. Telefon hata verdiyse sorun değil: ekrandaki yeni QR'ı tekrar okutun.";

/** QR'ı güncel gizli anahtarla çizer (yenilemeden sonra gelen QR'lar da yeni anahtarı taşır). */
async function renderQr(session: Session, generation: number, sock: BaileysSocket, rawQr: string) {
  const advSecret = session.auth?.loaded.state.creds.advSecretKey;
  const shown = advSecret ? withAdvSecret(rawQr, advSecret) : rawQr;
  const dataUrl = await QRCode.toDataURL(shown, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  if (!isCurrentSocket(session, generation, sock)) return;
  session.qr = { dataUrl, at: Date.now() };
  setState(session, "QR");
}

async function rerenderQr(session: Session, generation: number, sock: BaileysSocket) {
  // Henüz QR gelmediyse sonraki QR zaten güncel anahtarla çizilir.
  if (!session.rawQr) return;
  await renderQr(session, generation, sock, session.rawQr);
  if (isCurrentSocket(session, generation, sock)) session.notice = QR_REFRESHED_NOTICE;
}

async function handleQr(session: Session, generation: number, sock: BaileysSocket, qr: string) {
  const mode = session.mode;
  if (!mode || mode.kind !== "pair") {
    // Kayıtlı oturumla bağlanırken WhatsApp yeniden QR istiyorsa oturum geçersizleşmiştir.
    await stopSocket(session);
    await invalidateSession(session, "Kayıtlı WhatsApp oturumu artık geçerli değil. Numaranızı yeniden bağlayın.", "WHATSAPP_WEB_REMOVED");
    return;
  }
  if (mode.method === "qr") {
    session.rawQr = qr;
    await renderQr(session, generation, sock, qr);
    return;
  }
  if (session.pairingRequested || !mode.phone) return;
  session.pairingRequested = true;
  try {
    const code = await sock.requestPairingCode(mode.phone);
    if (!isCurrentSocket(session, generation, sock)) return;
    session.pairingCode = { code, at: Date.now() };
    setState(session, "QR");
  } catch (error) {
    logError(session.institutionId, "Eşleştirme kodu alınamadı", error);
    if (!isCurrentSocket(session, generation, sock)) return;
    await stopSocket(session);
    await finishPairingAttempt(session, { error: "Bağlantı kodu alınamadı. Numarayı kontrol edip tekrar deneyin." });
  }
}

async function handleOpen(session: Session, baileys: BaileysModule, generation: number, sock: BaileysSocket) {
  if (!isCurrentSocket(session, generation, sock)) return;
  const firstLink = session.justPaired;
  session.justPaired = false;
  session.mode = { kind: "resume" };
  session.reconnectAttempts = 0;
  session.qr = null;
  session.rawQr = null;
  session.pairingCode = null;
  session.pairingExpiredAt = null;
  session.error = null;
  session.notice = null;
  session.phone = phoneDigitsFromUser(baileys, sock.user) ?? session.phone;
  session.name = sock.user?.verifiedName || sock.user?.name || sock.user?.notify || session.name;
  setState(session, "CONNECTED");

  try {
    await markProviderConnected(session, firstLink);
  } catch (error) {
    logError(session.institutionId, "Bağlantı durumu kaydedilemedi", error);
  }
  if (firstLink) {
    let channelSwitched = false;
    try {
      channelSwitched = await switchDefaultChannelToWhatsapp(session.institutionId);
    } catch (error) {
      logError(session.institutionId, "Bildirim kanalı WhatsApp'a alınamadı", error);
    }
    await auditEvent(
      session.institutionId,
      "WHATSAPP_WEB_CONNECTED",
      `WhatsApp numarası QR/kod ile bağlandı (${maskPhoneDigits(session.phone)}).${channelSwitched ? " Otomatik mesajlar artık önce WhatsApp'tan, gidemezse SMS ile gider." : ""}`,
      session.actorUserId,
    );
    logWarn(session.institutionId, `WhatsApp numarası bağlandı (${maskPhoneDigits(session.phone)})`);
  }
}

async function handleClose(
  session: Session,
  baileys: BaileysModule,
  generation: number,
  sock: BaileysSocket,
  error: Error | undefined,
) {
  if (!isCurrentSocket(session, generation, sock)) return;
  const reason = baileys.DisconnectReason;
  const statusCode = disconnectStatusCode(error);
  session.detach?.();
  session.detach = null;
  session.sock = null;
  if (session.stopping) return;

  if (statusCode === reason.restartRequired) {
    // Eşleşme sonrası (veya sunucu isteğiyle) hemen yeniden bağlan; önce creds yazımı bitsin.
    await session.auth?.loaded.flush();
    if (generation !== session.generation) return;
    await resumeSession(session, "restart");
    return;
  }

  if (session.mode?.kind === "pair" && !session.justPaired) {
    const expired = statusCode === reason.timedOut;
    await finishPairingAttempt(session, expired
      ? { expired: true }
      : { error: "WhatsApp'a bağlanılamadı. İnternet bağlantısını kontrol edip tekrar deneyin." });
    return;
  }

  if (statusCode === reason.loggedOut || statusCode === 419) {
    await invalidateSession(
      session,
      "Bağlantı telefondan kaldırıldı. Mesajlar SMS ile gidiyor; yeniden bağlamak için QR kodu okutun.",
      "WHATSAPP_WEB_REMOVED",
    );
    return;
  }
  if (statusCode === reason.connectionReplaced) {
    await enterErrorState(session, "Bu WhatsApp bağlantısı başka bir yerde açıldı. Tekrar bağlanmak için “Yeniden bağlan”a basın.");
    return;
  }
  if (statusCode === reason.forbidden) {
    await enterErrorState(session, "WhatsApp bu numarayı kısıtlamış olabilir; mesajlar SMS ile gidecek.");
    return;
  }
  if (statusCode === reason.multideviceMismatch) {
    await enterErrorState(session, "WhatsApp bu bağlantıyı kabul etmedi. Bağlantıyı kesip numaranızı yeniden bağlayın.");
    return;
  }
  scheduleReconnect(session, statusCode);
}

function scheduleReconnect(session: Session, statusCode: number | undefined) {
  clearReconnectTimer(session);
  const attempt = session.reconnectAttempts;
  session.reconnectAttempts += 1;
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt, 10));
  const delay = Math.round(base * (0.8 + Math.random() * 0.4));
  if (session.reconnectAttempts >= RECONNECT_ERROR_AFTER) {
    session.error = "WhatsApp bağlantısı koptu; otomatik olarak yeniden deneniyor. Bu sürede mesajlar SMS ile gider.";
    setState(session, "ERROR");
    if (session.reconnectAttempts === RECONNECT_ERROR_AFTER) {
      void markProviderStatus(session.institutionId, "ERROR", { connectionError: session.error }).catch((error: unknown) => {
        logError(session.institutionId, "Bağlantı durumu kaydedilemedi", error);
      });
    }
  } else {
    setState(session, "CONNECTING");
  }
  logWarn(session.institutionId, `bağlantı kapandı (kod ${statusCode ?? "?"}); ${Math.round(delay / 1000)} sn sonra yeniden denenecek`);
  session.reconnectTimer = unrefTimer(setTimeout(() => {
    session.reconnectTimer = null;
    void resumeSession(session, "reconnect").catch((error: unknown) => {
      logError(session.institutionId, "Yeniden bağlanma başarısız", error);
      if (!session.sock && !session.stopping) scheduleReconnect(session, undefined);
    });
  }, delay));
}

/** Eşleşme tamamlanmadan biten deneme: eşleşmemiş kimlik silinir, kira bırakılır. */
async function finishPairingAttempt(session: Session, outcome: { expired?: boolean; error?: string }) {
  session.mode = null;
  session.qr = null;
  session.rawQr = null;
  session.pairingCode = null;
  session.pairingRequested = false;
  session.justPaired = false;
  session.pairingExpiredAt = outcome.expired ? Date.now() : null;
  session.error = outcome.expired ? null : outcome.error ?? null;
  disposeAuth(session);
  try {
    await clearAuthState(session.institutionId);
  } catch (error) {
    logError(session.institutionId, "Eşleşmemiş oturum temizlenemedi", error);
  }
  await releaseLease(session);
  try {
    await markProviderStatus(session.institutionId, "NOT_CONNECTED", { isActive: false }, "CONNECTING");
  } catch (error) {
    logError(session.institutionId, "Bağlantı durumu kaydedilemedi", error);
  }
  setState(session, "NOT_CONNECTED");
}

/** Telefondan kaldırılan / geçersizleşen oturum: kimlik silinir, kanal SMS'e döner. */
async function invalidateSession(session: Session, message: string, auditAction: string) {
  const phone = session.phone;
  session.mode = null;
  session.qr = null;
  session.rawQr = null;
  session.pairingCode = null;
  session.justPaired = false;
  clearReconnectTimer(session);
  disposeAuth(session);
  try {
    await clearAuthState(session.institutionId);
  } catch (error) {
    logError(session.institutionId, "Oturum temizlenemedi", error);
  }
  let channelReverted = false;
  try {
    await markProviderStatus(session.institutionId, "DISCONNECTED", {
      isActive: false,
      disconnectedAt: new Date(),
      connectionError: message,
    });
    channelReverted = await revertDefaultChannelToSms(session.institutionId);
  } catch (error) {
    logError(session.institutionId, "Bağlantı durumu kaydedilemedi", error);
  }
  await auditEvent(
    session.institutionId,
    auditAction,
    `WhatsApp bağlantısı sona erdi (${maskPhoneDigits(phone)}): ${message}${channelReverted ? " Bildirim kanalı SMS'e alındı." : ""}`,
  );
  await releaseLease(session);
  session.phone = null;
  session.name = null;
  session.connectedAt = null;
  session.error = null;
  session.notice = message;
  clearRestriction(session);
  setState(session, "NOT_CONNECTED");
  logWarn(session.institutionId, "WhatsApp oturumu sona erdi (telefondan kaldırıldı veya geçersiz)");
}

/** Otomatik yeniden bağlanmanın zarar vereceği durumlar: kimlik korunur, kullanıcı "Yeniden bağlan"a basar. */
async function enterErrorState(session: Session, message: string) {
  clearReconnectTimer(session);
  session.mode = null;
  session.error = message;
  setState(session, "ERROR");
  try {
    await markProviderStatus(session.institutionId, "ERROR", { connectionError: message });
  } catch (error) {
    logError(session.institutionId, "Bağlantı durumu kaydedilemedi", error);
  }
  await releaseLease(session);
  await auditEvent(session.institutionId, "WHATSAPP_WEB_CONNECTION_ERROR", `WhatsApp bağlantısı durdu: ${message}`);
  logWarn(session.institutionId, `bağlantı durduruldu: ${message}`);
}

/** Kayıtlı (eşleşmiş) oturumla bağlanır: açılış, kopma sonrası, kira geri alındığında. */
async function resumeSession(session: Session, reason: "boot" | "restart" | "reconnect" | "lease" | "manual") {
  return withSessionLock(session, async () => {
    // Çalışan bir soket varsa (bağlı, bağlanıyor ya da eşleştirme bekliyor) yapılacak bir şey yok.
    if (session.sock) return;

    const paired = session.auth ? isPairedCreds(session.auth.loaded.state.creds) : await hasStoredPairedCreds(session.institutionId);
    if (!paired) {
      // Eşleşmemiş artık kimlik (yarım kalmış eski deneme) varsa temizlenir.
      disposeAuth(session);
      await clearAuthState(session.institutionId).catch((error: unknown) => logError(session.institutionId, "Eski oturum temizlenemedi", error));
      if (session.state !== "NOT_CONNECTED") setState(session, "NOT_CONNECTED");
      return;
    }
    if (!session.hasLease) {
      const leased = await acquireLease(session);
      if (!leased) {
        if (reason === "manual") {
          throw new WhatsappWebError("WhatsApp bağlantısı şu an başka bir sunucu sürecinde açık. Birkaç dakika sonra tekrar deneyin.", { status: 409, code: "LEASE_BUSY" });
        }
        scheduleLeaseRetry(session);
        return;
      }
    }
    if (reason === "manual") {
      session.error = null;
      session.reconnectAttempts = 0;
    }
    await startSocket(session, { kind: "resume" });
  });
}

// ── İletim/okundu bilgisi ───────────────────────────────────────────────────

function rememberSent(session: Session, messageId: string) {
  session.recentSent.set(messageId, Date.now());
  if (session.recentSent.size > RECENT_SENT_MAX) {
    const oldest = session.recentSent.keys().next().value;
    if (oldest) session.recentSent.delete(oldest);
  }
}

type DispatchProgress = "DELIVERED" | "READ";

async function applyDispatchProgress(institutionId: string, messageId: string, progress: DispatchProgress): Promise<number> {
  const now = new Date();
  const where = {
    institutionId,
    channel: "WHATSAPP" as const,
    providerMessageId: messageId,
    createdAt: { gte: new Date(now.getTime() - RECEIPT_LOOKBACK_MS) },
  };
  if (progress === "DELIVERED") {
    const result = await prisma.smsDispatch.updateMany({
      where: { ...where, status: "SENT" },
      data: { status: "DELIVERED", deliveredAt: now },
    });
    return result.count;
  }
  const result = await prisma.smsDispatch.updateMany({
    where: { ...where, status: { in: ["SENT", "DELIVERED"] } },
    data: { status: "READ", readAt: now },
  });
  await prisma.smsDispatch.updateMany({ where: { ...where, status: "READ", deliveredAt: null }, data: { deliveredAt: now } });
  return result.count;
}

async function recordDispatchProgress(session: Session, messageId: string, progress: DispatchProgress) {
  const updated = await applyDispatchProgress(session.institutionId, messageId, progress);
  const sentAt = session.recentSent.get(messageId);
  // Makbuz, gönderim kaydına mesaj kimliği yazılmadan önce gelmiş olabilir: bir kez daha dene.
  if (updated === 0 && sentAt && Date.now() - sentAt < 2 * 60_000) {
    unrefTimer(setTimeout(() => {
      void applyDispatchProgress(session.institutionId, messageId, progress).catch((error: unknown) => {
        logError(session.institutionId, "İletim bilgisi kaydedilemedi", error);
      });
    }, 5_000));
  }
}

async function recordDispatchFailure(session: Session, messageId: string, errorCode: string) {
  const explanation = errorCode === "463"
    ? "WhatsApp bu mesajı teslim etmedi: numara yeni kişilere yazma konusunda geçici olarak kısıtlanmış olabilir (kod 463)."
    : `WhatsApp bu mesajı teslim etmedi${errorCode ? ` (kod ${errorCode})` : ""}.`;
  await prisma.smsDispatch.updateMany({
    where: {
      institutionId: session.institutionId,
      channel: "WHATSAPP",
      providerMessageId: messageId,
      status: "SENT",
      createdAt: { gte: new Date(Date.now() - RECEIPT_LOOKBACK_MS) },
    },
    data: { status: "FAILED", lastError: explanation },
  });
}

async function handleMessageStatusUpdates(session: Session, baileys: BaileysModule, updates: BaileysEventMap["messages.update"]) {
  const Status = baileys.WAMessageStatus;
  for (const { key, update } of updates) {
    if (!key?.fromMe || !key.id || typeof update.status !== "number") continue;
    if (update.status === Status.ERROR) {
      const code = String(update.messageStubParameters?.[0] ?? "");
      if (code === "463") {
        applyRestriction(session, new Date(Date.now() + RESTRICTION_ON_463_MS), "WhatsApp bir mesajı kısıtlama nedeniyle teslim etmedi.");
      }
      await recordDispatchFailure(session, key.id, code);
    } else if (update.status >= Status.READ) {
      await recordDispatchProgress(session, key.id, "READ");
    } else if (update.status === Status.DELIVERY_ACK) {
      await recordDispatchProgress(session, key.id, "DELIVERED");
    }
  }
}

async function handleReceiptUpdates(session: Session, updates: BaileysEventMap["message-receipt.update"]) {
  for (const { key, receipt } of updates) {
    if (!key?.fromMe || !key.id) continue;
    if (receipt.readTimestamp || receipt.playedTimestamp) await recordDispatchProgress(session, key.id, "READ");
    else if (receipt.receiptTimestamp) await recordDispatchProgress(session, key.id, "DELIVERED");
  }
}

function handleCappingUpdate(session: Session, info: BaileysEventMap["message-capping.update"]) {
  const status = String(info.capping_status ?? "");
  if (status === "CAPPED") {
    const endSeconds = Number(info.cycle_end_timestamp);
    const until = Number.isFinite(endSeconds) && endSeconds * 1000 > Date.now()
      ? new Date(endSeconds * 1000)
      : new Date(Date.now() + 24 * 60 * 60_000);
    applyRestriction(session, until, "WhatsApp bu numaranın yeni sohbet sınırının dolduğunu bildirdi.");
  } else if (status === "NONE") {
    clearRestriction(session);
  } else if (status === "FIRST_WARNING" || status === "SECOND_WARNING") {
    session.notice = "WhatsApp, bu numaranın yeni kişilere mesaj sınırına yaklaştığını bildirdi. Sınır dolarsa mesajlar SMS ile gider.";
    logWarn(session.institutionId, `WhatsApp yeni sohbet sınırı uyarısı (${status})`);
  }
}

// ── Gönderim ────────────────────────────────────────────────────────────────

function failure(code: WhatsappWebSendCode, error?: string): WhatsappWebSendResult {
  return { ok: false, code, error: error || SEND_ERRORS[code] };
}

function enqueueSend(session: Session, run: () => Promise<WhatsappWebSendResult>): Promise<WhatsappWebSendResult> {
  if (session.queue.length >= MAX_QUEUE_LENGTH) return Promise.resolve(failure("QUEUE_FULL"));
  return new Promise<WhatsappWebSendResult>((resolve) => {
    const item: QueueItem = {
      run,
      resolve,
      settled: false,
      timer: unrefTimer(setTimeout(() => {
        if (item.settled) return;
        // Sırası gelmeden 10 dk geçti: çağıran SMS'e düşebilsin, bu iş artık çalıştırılmaz.
        item.settled = true;
        resolve(failure("QUEUE_TIMEOUT"));
      }, QUEUE_TIMEOUT_MS)),
    };
    session.queue.push(item);
    void pumpQueue(session);
  });
}

async function pumpQueue(session: Session) {
  if (session.pumping) return;
  session.pumping = true;
  try {
    while (session.queue.length > 0) {
      const item = session.queue.shift();
      if (!item || item.settled) continue;
      clearTimeout(item.timer);
      if (session.lastSentAt > 0) {
        const wait = session.lastSentAt + sendGapMs() - Date.now();
        if (wait > 0) await sleep(wait);
      }
      let result: WhatsappWebSendResult;
      try {
        result = await item.run();
      } catch (error) {
        logError(session.institutionId, "Gönderim işi beklenmedik biçimde durdu", error);
        result = failure("SEND_UNCERTAIN");
      }
      if (result.ok) session.lastSentAt = Date.now();
      if (!item.settled) {
        item.settled = true;
        item.resolve(result);
      }
    }
  } finally {
    session.pumping = false;
  }
}

/** Türkiye gününe göre atomik günlük sayaç: sınır dolduysa false. */
async function reserveDailySlot(institutionId: string, limit: number): Promise<boolean> {
  const today = turkeyDateKey();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sameDay = await prisma.whatsappWebSession.updateMany({
      where: { institutionId, dailySentDate: today, dailySentCount: { lt: limit } },
      data: { dailySentCount: { increment: 1 } },
    });
    if (sameDay.count === 1) return true;
    const newDay = await prisma.whatsappWebSession.updateMany({
      where: { institutionId, OR: [{ dailySentDate: null }, { dailySentDate: { not: today } }] },
      data: { dailySentDate: today, dailySentCount: 1 },
    });
    if (newDay.count === 1) return true;
    const row = await prisma.whatsappWebSession.findUnique({
      where: { institutionId },
      select: { dailySentDate: true, dailySentCount: true },
    });
    if (!row) {
      await prisma.whatsappWebSession.create({ data: { institutionId } }).catch((error: unknown) => {
        if (!isUniqueViolation(error)) throw error;
      });
      continue;
    }
    if (row.dailySentDate === today && row.dailySentCount >= limit) return false;
  }
  return false;
}

async function refundDailySlot(institutionId: string) {
  await prisma.whatsappWebSession.updateMany({
    where: { institutionId, dailySentDate: turkeyDateKey(), dailySentCount: { gt: 0 } },
    data: { dailySentCount: { decrement: 1 } },
  }).catch((error: unknown) => logError(institutionId, "Günlük sayaç geri alınamadı", error));
}

function cachedNumber(session: Session, digits: string) {
  const entry = session.numberCache.get(digits);
  if (!entry) return null;
  if (Date.now() - entry.at > NUMBER_CACHE_TTL_MS) {
    session.numberCache.delete(digits);
    return null;
  }
  return entry;
}

function rememberNumber(session: Session, digits: string, entry: { exists: boolean; jid: string | null; at: number }) {
  session.numberCache.delete(digits);
  session.numberCache.set(digits, entry);
  if (session.numberCache.size > NUMBER_CACHE_MAX) {
    const oldest = session.numberCache.keys().next().value;
    if (oldest) session.numberCache.delete(oldest);
  }
}

async function performSend(session: Session, phoneDigits: string, text: string): Promise<WhatsappWebSendResult> {
  const sock = session.sock;
  if (!sock || session.state !== "CONNECTED") return failure("NOT_CONNECTED");
  if (activeRestriction(session)) {
    return failure("RESTRICTED", `${session.restrictionReason || SEND_ERRORS.RESTRICTED} Mesaj SMS ile gönderilebilir.`);
  }
  const digits = phoneDigits.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return failure("INVALID_PHONE");

  // Koruyucu önlem: numara WhatsApp'ta değilse gönderim denenmez (yalnız bu numara sorgulanır, 24 saat önbellek).
  let target = cachedNumber(session, digits);
  if (!target) {
    try {
      const results = await withTimeout(sock.onWhatsApp(digits), NUMBER_CHECK_TIMEOUT_MS);
      const hit = results?.find((item) => item.exists);
      target = { exists: Boolean(hit), jid: hit?.jid ?? null, at: Date.now() };
      rememberNumber(session, digits, target);
    } catch (error) {
      logError(session.institutionId, "Numara WhatsApp kontrolü yapılamadı", error);
      return failure("CHECK_FAILED");
    }
  }
  if (!target.exists || !target.jid) return failure("NOT_ON_WHATSAPP");

  if (!(await reserveDailySlot(session.institutionId, getDailyLimit()))) return failure("DAILY_LIMIT");

  if (session.sock !== sock || session.state !== "CONNECTED" || !sock.ws.isOpen) {
    await refundDailySlot(session.institutionId);
    return failure("NOT_CONNECTED");
  }
  try {
    const message = await withTimeout(sock.sendMessage(target.jid, { text, linkPreview: null }), SEND_TIMEOUT_MS);
    const messageId = message?.key?.id;
    if (!messageId) return failure("SEND_UNCERTAIN");
    rememberSent(session, messageId);
    return { ok: true, messageId };
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Mesaj arka planda yine de gidebilir: sayaç geri alınmaz, çağıran SMS'e düşmez (çift mesaj olmasın).
      return failure("SEND_UNCERTAIN", "WhatsApp gönderimi zaman aşımına uğradı; mesajın gidip gitmediği kesin değil.");
    }
    const statusCode = disconnectStatusCode(error);
    const socketDropped = session.sock !== sock || !sock.ws.isOpen;
    if (statusCode === 428 && !socketDropped) {
      await refundDailySlot(session.institutionId);
      return failure("NOT_CONNECTED");
    }
    if (socketDropped) {
      // Bağlantı gönderim sırasında koptu: mesajın sunucuya ulaşıp ulaşmadığı belirsiz.
      return failure("SEND_UNCERTAIN", "WhatsApp bağlantısı gönderim sırasında koptu; mesajın gidip gitmediği kesin değil.");
    }
    // Soket açıkken ve gönderim düğümü yazılmadan önce oluşan hata: mesaj gitmedi.
    logError(session.institutionId, "WhatsApp mesajı gönderilemedi", error);
    await refundDailySlot(session.institutionId);
    return failure("SEND_FAILED");
  }
}

/**
 * Hastaya mesaj gönderir (yalnız whatsapp.ts → dispatchPatientMessage yolu
 * üzerinden çağrılmalı). Asla hata fırlatmaz; sonuç kodu çağıranın SMS'e
 * düşüp düşmeyeceğine karar vermesini sağlar.
 */
export async function sendText(
  institutionId: string,
  phoneDigits: string,
  text: string,
  meta: WhatsappWebSendMeta = {},
): Promise<WhatsappWebSendResult> {
  void meta;
  const session = managerState().sessions.get(institutionId);
  if (!session || session.state !== "CONNECTED" || !session.sock) return failure("NOT_CONNECTED");
  if (!text.trim()) return failure("SEND_FAILED", "Boş mesaj gönderilemez.");
  return enqueueSend(session, () => performSend(session, phoneDigits, text));
}

/** Bağlı numaranın KENDİSİNE bağlantı testi mesajı (hasta mesajı değildir, günlük sayaca girmez). */
export async function sendSelfTest(institutionId: string): Promise<WhatsappWebSendResult> {
  const session = managerState().sessions.get(institutionId);
  if (!session || session.state !== "CONNECTED" || !session.sock) return failure("NOT_CONNECTED");
  const sinceLast = Date.now() - session.lastSelfTestAt;
  if (sinceLast < SELF_TEST_COOLDOWN_MS) {
    return failure("SEND_FAILED", `Yeni bir test mesajı için ${Math.ceil((SELF_TEST_COOLDOWN_MS - sinceLast) / 1000)} sn bekleyin.`);
  }
  session.lastSelfTestAt = Date.now();
  const baileys = await loadBaileys();
  return enqueueSend(session, async () => {
    const sock = session.sock;
    if (!sock || session.state !== "CONNECTED" || !sock.user?.id) return failure("NOT_CONNECTED");
    try {
      const selfJid = baileys.jidNormalizedUser(sock.user.id);
      const message = await withTimeout(sock.sendMessage(selfJid, { text: SELF_TEST_MESSAGE, linkPreview: null }), SEND_TIMEOUT_MS);
      return message?.key?.id ? { ok: true, messageId: message.key.id } : failure("SEND_UNCERTAIN");
    } catch (error) {
      logError(institutionId, "Test mesajı gönderilemedi", error);
      return failure(error instanceof TimeoutError ? "SEND_UNCERTAIN" : "SEND_FAILED");
    }
  });
}

// ── Durum ───────────────────────────────────────────────────────────────────

function waitForPairingInfo(session: Session, timeoutMs: number) {
  const ready = () => Boolean(session.qr || session.pairingCode) || ["CONNECTED", "ERROR", "NOT_CONNECTED"].includes(session.state);
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      session.waiters.delete(check);
      resolve();
    };
    const check = () => {
      if (ready()) finish();
    };
    const timer = unrefTimer(setTimeout(finish, timeoutMs));
    session.waiters.add(check);
  });
}

async function readDailyCount(institutionId: string) {
  const row = await prisma.whatsappWebSession.findUnique({
    where: { institutionId },
    select: { dailySentDate: true, dailySentCount: true, leaseOwner: true, leaseUntil: true },
  });
  return {
    dailySentCount: row?.dailySentDate === turkeyDateKey() ? row.dailySentCount : 0,
    leaseHeldElsewhere: Boolean(
      row?.leaseOwner && row.leaseOwner !== managerState().processId && row.leaseUntil && row.leaseUntil.getTime() > Date.now(),
    ),
  };
}

export async function getStatus(institutionId: string): Promise<WhatsappWebStatus> {
  const session = managerState().sessions.get(institutionId);
  const [{ dailySentCount, leaseHeldElsewhere }, provider] = await Promise.all([
    readDailyCount(institutionId),
    prisma.whatsappProviderConfig.findUnique({
      where: providerWhere(institutionId),
      select: { connectionStatus: true, connectionError: true, displayPhoneNumber: true, verifiedName: true, connectedAt: true, isActive: true },
    }),
  ]);
  const base: WhatsappWebStatus = {
    state: "NOT_CONNECTED",
    method: null,
    qrDataUrl: null,
    pairingCode: null,
    pairingExpired: false,
    phone: null,
    name: null,
    error: null,
    notice: null,
    connectedAt: null,
    restrictedUntil: null,
    dailySentCount,
    dailyLimit: getDailyLimit(),
  };

  const sessionIsLive = Boolean(session && (session.sock || session.state !== "NOT_CONNECTED" || session.pairingExpiredAt || session.notice || session.error));
  if (session && sessionIsLive) {
    const restriction = activeRestriction(session);
    const pairingMethod = session.mode?.kind === "pair" ? session.mode.method : session.lastMethod;
    return {
      ...base,
      state: session.state,
      method: pairingMethod ?? null,
      qrDataUrl: session.state === "QR" ? session.qr?.dataUrl ?? null : null,
      pairingCode: session.state === "QR" ? session.pairingCode?.code ?? null : null,
      pairingExpired: Boolean(session.pairingExpiredAt && Date.now() - session.pairingExpiredAt < PAIRING_EXPIRED_VISIBLE_MS),
      phone: session.phone ? formatWhatsappDisplayPhone(session.phone) : provider?.displayPhoneNumber ?? null,
      name: session.name ?? provider?.verifiedName ?? null,
      error: session.error,
      notice: session.notice,
      connectedAt: (session.connectedAt ?? provider?.connectedAt ?? null)?.toISOString() ?? null,
      restrictedUntil: restriction ? restriction.toISOString() : null,
    };
  }

  // Bu süreçte canlı oturum yok: kayıtlı duruma göre anlatılır.
  if (!provider) return base;
  const fromDb = {
    ...base,
    phone: provider.displayPhoneNumber,
    name: provider.verifiedName,
    connectedAt: provider.connectedAt?.toISOString() ?? null,
  };
  if (provider.connectionStatus === "CONNECTED" && provider.isActive) {
    if (leaseHeldElsewhere) return { ...fromDb, state: "CONNECTED" };
    if (!isFeatureEnabled()) {
      return { ...fromDb, state: "ERROR", error: "WhatsApp bağlantısı bu sunucuda kapalı (ENABLE_WHATSAPP_WEB=false). Mesajlar SMS ile gider." };
    }
    return { ...fromDb, state: "CONNECTING", notice: "Bağlantı yeniden kuruluyor…" };
  }
  if (provider.connectionStatus === "ERROR") return { ...fromDb, state: "ERROR", error: provider.connectionError || "WhatsApp bağlantısında sorun var." };
  if (provider.connectionStatus === "DISCONNECTED" && provider.connectionError) {
    return { ...base, notice: provider.connectionError };
  }
  return base;
}

// ── Bağlama / kesme ─────────────────────────────────────────────────────────

export async function connect(
  institutionId: string,
  options: { method: "qr" } | { method: "code"; phone: string },
  actorUserId?: string | null,
): Promise<WhatsappWebStatus> {
  assertCredentialStorageReady();
  if (!isFeatureEnabled()) {
    throw new WhatsappWebError("WhatsApp bağlantısı bu sunucuda kapalı. Sistem yöneticisine başvurun.", { status: 503, code: "FEATURE_DISABLED" });
  }
  const session = getSession(institutionId);
  if (actorUserId) session.actorUserId = actorUserId;
  installShutdownHooks();

  await withSessionLock(session, async () => {
    if (session.state === "CONNECTED" && session.sock) return;

    const phone = options.method === "code" ? options.phone : null;
    const pairing = session.mode?.kind === "pair" ? session.mode : null;
    if (session.sock && pairing && pairing.method === options.method && pairing.phone === phone) return;

    const paired = session.auth ? isPairedCreds(session.auth.loaded.state.creds) : await hasStoredPairedCreds(institutionId);
    if (paired) {
      // Eşleşmiş kimlik duruyor (ör. hata sonrası "Yeniden bağlan"): QR gerekmez.
      if (session.sock) await stopSocket(session);
      if (!session.hasLease && !(await acquireLease(session))) {
        throw new WhatsappWebError("WhatsApp bağlantısı şu an başka bir sunucu sürecinde açık. Birkaç dakika sonra tekrar deneyin.", { status: 409, code: "LEASE_BUSY" });
      }
      session.error = null;
      session.notice = null;
      session.reconnectAttempts = 0;
      await startSocket(session, { kind: "resume" });
      return;
    }

    const hourAgo = Date.now() - 60 * 60_000;
    session.pairingStarts = session.pairingStarts.filter((at) => at > hourAgo);
    if (session.pairingStarts.length >= PAIRING_ATTEMPTS_PER_HOUR) {
      throw new WhatsappWebError("Kısa sürede çok fazla bağlantı denemesi yapıldı. Birkaç dakika sonra tekrar deneyin.", { status: 429, code: "TOO_MANY_ATTEMPTS" });
    }

    if (session.sock) await stopSocket(session);
    disposeAuth(session);
    await clearAuthState(institutionId);
    if (!(await acquireLease(session))) {
      throw new WhatsappWebError("WhatsApp bağlantısı şu an başka bir sunucu sürecinde açık. Birkaç dakika sonra tekrar deneyin.", { status: 409, code: "LEASE_BUSY" });
    }
    await markProviderConnecting(institutionId);
    session.pairingStarts.push(Date.now());
    session.lastMethod = options.method;
    session.pairingExpiredAt = null;
    session.error = null;
    session.notice = null;
    session.justPaired = false;
    try {
      await startSocket(session, { kind: "pair", method: options.method, phone });
    } catch (error) {
      await releaseLease(session);
      await markProviderStatus(institutionId, "NOT_CONNECTED", { isActive: false }, "CONNECTING").catch(() => undefined);
      throw error;
    }
  });

  await waitForPairingInfo(session, PAIRING_WAIT_MS);
  return getStatus(institutionId);
}

/**
 * Bağlantıyı keser: telefondaki "Bağlı cihazlar" listesinden de çıkar
 * (sock.logout), kimlik silinir, sağlayıcı pasife alınır, gerekiyorsa kanal
 * SMS'e döner. Eşleşme tamamlanmamışsa yalnız deneme iptal edilir.
 */
export async function disconnect(
  institutionId: string,
  actorUserId?: string | null,
): Promise<{ wasConnected: boolean; removedFromPhone: boolean }> {
  const session = getSession(institutionId);
  return withSessionLock(session, async () => {
    if (!session.sock && (await readDailyCount(institutionId)).leaseHeldElsewhere) {
      throw new WhatsappWebError(
        "WhatsApp bağlantısı şu an başka bir sunucu sürecinde açık; bağlantı oradan kesilmeli. Birkaç dakika sonra tekrar deneyin.",
        { status: 409, code: "LEASE_BUSY" },
      );
    }
    const paired = session.auth ? isPairedCreds(session.auth.loaded.state.creds) : await hasStoredPairedCreds(institutionId);
    const sock = session.sock;
    const wasOpen = Boolean(sock && session.state === "CONNECTED" && sock.ws.isOpen);

    // Önce dinleyicileri ayır ki kapanış olayı "telefondan kaldırıldı" gibi işlenmesin.
    session.stopping = true;
    session.generation += 1;
    clearReconnectTimer(session);
    session.detach?.();
    session.detach = null;
    session.sock = null;

    let removedFromPhone = false;
    if (sock && paired && wasOpen) {
      try {
        await withTimeout(sock.logout(), LOGOUT_TIMEOUT_MS);
        removedFromPhone = true;
      } catch (error) {
        logError(institutionId, "Telefondaki bağlı cihaz kaydı kaldırılamadı", error);
      }
    }
    if (sock) {
      try {
        await sock.end(undefined);
      } catch {
        // zaten kapalı
      }
    }

    disposeAuth(session);
    await clearAuthState(institutionId);
    for (const item of session.queue.splice(0)) {
      if (item.settled) continue;
      item.settled = true;
      clearTimeout(item.timer);
      item.resolve(failure("NOT_CONNECTED"));
    }
    session.mode = null;
    session.qr = null;
    session.rawQr = null;
    session.pairingCode = null;
    session.justPaired = false;
    session.pairingExpiredAt = null;
    session.error = null;
    session.notice = null;
    clearRestriction(session);
    session.numberCache.clear();

    if (!paired) {
      await markProviderStatus(institutionId, "NOT_CONNECTED", { isActive: false }, "CONNECTING").catch((error: unknown) => {
        logError(institutionId, "Bağlantı durumu kaydedilemedi", error);
      });
      await releaseLease(session);
      setState(session, "NOT_CONNECTED");
      return { wasConnected: false, removedFromPhone: false };
    }

    const phone = session.phone;
    await markProviderStatus(institutionId, "DISCONNECTED", { isActive: false, disconnectedAt: new Date(), connectionError: null });
    const channelReverted = await revertDefaultChannelToSms(institutionId);
    await releaseLease(session);
    session.phone = null;
    session.name = null;
    session.connectedAt = null;
    setState(session, "NOT_CONNECTED");
    await auditEvent(
      institutionId,
      "WHATSAPP_DISCONNECTED",
      `WhatsApp (QR) bağlantısı kesildi (${maskPhoneDigits(phone)}).${removedFromPhone ? "" : " Telefondaki Bağlı cihazlar listesinden de kaldırılması önerilir."}${channelReverted ? " Bildirim kanalı SMS'e alındı." : ""}`,
      actorUserId ?? session.actorUserId,
    );
    return { wasConnected: true, removedFromPhone };
  });
}

// ── Açılış ve kapanış ───────────────────────────────────────────────────────

function installShutdownHooks() {
  const state = managerState();
  if (state.shutdownHooked) return;
  state.shutdownHooked = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    // Başka dinleyici yoksa (ör. betik) varsayılan "süreci kapat" davranışı bozulmasın.
    if (process.listenerCount(signal) === 0) continue;
    process.once(signal, () => {
      void shutdownAll();
    });
  }
}

/** Süreç kapanırken: soketler kapatılır (telefondan çıkış YAPILMAZ), kiralar bırakılır. */
export async function shutdownAll() {
  const sessions = [...managerState().sessions.values()];
  await Promise.allSettled(sessions.map(async (session) => {
    await stopSocket(session);
    await releaseLease(session);
  }));
}

/**
 * Sunucu açılışında kayıtlı (eşleşmiş) oturumları sırayla, aralarında 2 sn
 * ile yeniden bağlar. Yalnız kurum aktif ve WhatsApp modülü açıksa.
 */
export async function bootAll(): Promise<void> {
  const state = managerState();
  if (state.booted || !isFeatureEnabled()) return;
  state.booted = true;
  installShutdownHooks();
  await sleep(BOOT_START_DELAY_MS);
  let rows: { institutionId: string }[] = [];
  try {
    rows = await prisma.whatsappWebSession.findMany({
      where: { credsEncrypted: { not: null }, institution: { isActive: true, whatsappEnabled: true } },
      select: { institutionId: true },
      orderBy: { updatedAt: "asc" },
    });
  } catch (error) {
    state.booted = false;
    logError(null, "Kayıtlı WhatsApp oturumları okunamadı", error);
    return;
  }
  for (const [index, row] of rows.entries()) {
    if (index > 0) await sleep(BOOT_GAP_MS);
    try {
      await resumeSession(getSession(row.institutionId), "boot");
    } catch (error) {
      logError(row.institutionId, "Açılışta WhatsApp oturumu başlatılamadı", error);
    }
  }
  if (rows.length > 0) logWarn(null, `${rows.length} klinik için kayıtlı WhatsApp oturumu açılışta yeniden bağlanıyor`);
}

/** API durum sorgusunda açılış taraması henüz yapılmadıysa başlatır (instrumentation devrede değilse). */
export function ensureBooted() {
  if (managerState().booted || !isFeatureEnabled()) return;
  void bootAll().catch((error: unknown) => logError(null, "WhatsApp açılış taraması başarısız", error));
}
