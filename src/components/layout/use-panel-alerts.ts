"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CountBadgeTone } from "@/components/ui/CountBadge";
import type { NavBadgeKey } from "@/lib/nav";
import { safeLoginNextPath } from "@/lib/routes";
import { scopedStorageKey } from "@/lib/scoped-client-storage";
import { showToastSafe } from "@/lib/toast-client";

// Panel kabuğunun TEK veri kaynağı: /api/panel-summary. Sol menü rozetleri,
// "Bekleyen işler" zili, bekleme salonu ve erişim (izin) yoklaması aynı
// yanıtı paylaşır. Önceden kabuk açılışta beş ağır liste ucu çekiyor, her
// gerçek zamanlı olayda bunları birleştirmeden yeniliyor, ayrıca 15 sn'de bir
// iki yetki isteği atıyordu; tek bir geçici hata (429/5xx/ağ) izinleri
// boşaltıp kullanıcıyı açık formuyla birlikte /yetkisiz'e atıyordu.
//
// Davranış:
// - Hata (ağ, 429, 5xx) son bilinen veriyi SİLMEZ; üstel geri çekilmeyle
//   yeniden denenir, art arda 3 hatadan sonra tek bir uyarı gösterilir.
// - 401 (oturum bitti) iki kez doğrulanınca giriş ekranına gidilir.
// - Yoklama yalnız sekme görünürken: 3 dk aralık, görünür olunca/odakta en
//   fazla 30 sn'de bir, gerçek zamanlı olayda en fazla 8 sn'de bir.

export type WaitingPatient = {
  id: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  startAt: string;
  /** Türkiye takvim günü (YYYY-AA-GG). */
  date: string;
  /** Türkiye saati (SS:dd). */
  time: string;
};

export type LabSummaryCounts = { open: number; notSent: number; atLab: number; late: number; clinic: number };

export type PanelSummaryCounts = {
  waiting: { count: number; items: WaitingPatient[] } | null;
  onlineRequests: number | null;
  tasksDue: number | null;
  lab: LabSummaryCounts | null;
  stockCritical: number | null;
  installmentsOverdue: number | null;
  unreadMessages: number | null;
};

export type PanelSummary = {
  generatedAt: string;
  scopeKey: string | null;
  permissions: string[];
  features: { whatsapp: boolean };
  counts: PanelSummaryCounts;
};

export type PanelSummaryState = {
  /** Son başarılı yanıt; hata olunca silinmez. */
  data: PanelSummary | null;
  loadedAt: number | null;
  /** Art arda başarısız deneme (ağ, 429, 5xx). */
  failures: number;
};

const INITIAL_DELAY_MS = 700;
const REALTIME_MIN_GAP_MS = 8_000;
const VISIBLE_MIN_GAP_MS = 30_000;
const POLL_INTERVAL_MS = 3 * 60_000;
const RETRY_STEPS_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const FAILURES_BEFORE_NOTICE = 3;

const EMPTY_STATE: PanelSummaryState = { data: null, loadedAt: null, failures: 0 };

let state: PanelSummaryState = EMPTY_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<PanelSummaryState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribePanelSummary(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPanelSummaryState() {
  return state;
}

// Sunucuda ve hidrasyonda her zaman boş durum: rozetler istemcide dolar (#418 yok).
function getServerPanelSummaryState() {
  return EMPTY_STATE;
}

/** Kabuk özetini okur (rozetler, zil, bekleme salonu). Yükleyici `usePanelSummarySync`tir. */
export function usePanelSummary() {
  return useSyncExternalStore(subscribePanelSummary, getPanelSummaryState, getServerPanelSummaryState);
}

// ── Yanıt doğrulama ─────────────────────────────────────────────────────────

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseWaiting(value: unknown): PanelSummaryCounts["waiting"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as { items?: unknown };
  if (!Array.isArray(raw.items)) return null;
  const items = raw.items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: asText(item.id),
      patientName: asText(item.patientName) || "Hasta",
      doctorId: asText(item.doctorId),
      doctorName: asText(item.doctorName),
      startAt: asText(item.startAt),
      date: asText(item.date),
      time: asText(item.time),
    }))
    .filter((item) => item.id);
  return { count: items.length, items };
}

function parseLab(value: unknown): LabSummaryCounts | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    open: asCount(raw.open) ?? 0,
    notSent: asCount(raw.notSent) ?? 0,
    atLab: asCount(raw.atLab) ?? 0,
    late: asCount(raw.late) ?? 0,
    clinic: asCount(raw.clinic) ?? 0,
  };
}

function parseSummary(json: unknown): PanelSummary | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  // İzin listesi olmayan yanıt doğrulanmış sayılmaz (izinler ona göre değişmez).
  if (!Array.isArray(raw.permissions)) return null;
  const counts = (raw.counts && typeof raw.counts === "object" ? raw.counts : {}) as Record<string, unknown>;
  const features = (raw.features && typeof raw.features === "object" ? raw.features : {}) as Record<string, unknown>;
  return {
    generatedAt: asText(raw.generatedAt),
    scopeKey: typeof raw.scopeKey === "string" ? raw.scopeKey : null,
    permissions: raw.permissions.filter((item): item is string => typeof item === "string"),
    features: { whatsapp: features.whatsapp === true },
    counts: {
      waiting: parseWaiting(counts.waiting),
      onlineRequests: asCount(counts.onlineRequests),
      tasksDue: asCount(counts.tasksDue),
      lab: parseLab(counts.lab),
      stockCritical: asCount(counts.stockCritical),
      installmentsOverdue: asCount(counts.installmentsOverdue),
      unreadMessages: asCount(counts.unreadMessages),
    },
  };
}

// ── Yükleme ve zamanlama ────────────────────────────────────────────────────

let activeScopeKey = "";
let inFlight: Promise<void> | null = null;
// İstek sürerken gelen yenileme isteği (ör. yavaş yanıt sırasında gerçek
// zamanlı olay) kaybolmasın: yanıt gelince bir kez daha yüklenir.
let rerunRequested = false;
let lastAttemptAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDueAt = 0;
let pendingWhileHidden = false;
let degradedNoticeShown = false;
let blockedNoticeShown = false;
let scopeNoticeShown = false;
let unauthorizedStrikes = 0;

function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function readMessagesSince() {
  if (!activeScopeKey) return "";
  try {
    return localStorage.getItem(scopedStorageKey("clinic-messages-last-seen", activeScopeKey)) || "";
  } catch {
    return "";
  }
}

function schedule(delayMs: number) {
  const dueAt = Date.now() + Math.max(0, delayMs);
  // Daha erken planlanmış bir yükleme varsa o yeterlidir (istekler birleşir).
  if (timer && timerDueAt <= dueAt) return;
  if (timer) clearTimeout(timer);
  timerDueAt = dueAt;
  timer = setTimeout(() => {
    timer = null;
    timerDueAt = 0;
    if (isHidden()) {
      pendingWhileHidden = true;
      return;
    }
    void loadPanelSummary();
  }, Math.max(0, delayMs));
}

function handleUnauthorized() {
  unauthorizedStrikes += 1;
  // Tek bir 401 (ör. eşzamanlı oturum yenilemesi) kullanıcıyı atmasın: kısa
  // süre sonra bir kez daha doğrulanır.
  if (unauthorizedStrikes < 2) {
    schedule(1_500);
    return;
  }
  showToastSafe({ type: "info", title: "Oturumunuz sona erdi", message: "Giriş ekranına yönlendiriliyorsunuz.", duration: 4000 });
  window.setTimeout(() => window.location.assign(sessionExpiredLoginHref()), 800);
}

/**
 * Oturum açık sayfada biterse (yoklama 401) de middleware'deki gibi
 * `?next=<yol+sorgu>&neden=oturum`: giriş ekranı "Oturum süreniz doldu" der ve
 * girişten sonra kaldığı sayfaya döner. Önceden yalnız sayfa geçişinde dönülüyordu.
 */
function sessionExpiredLoginHref() {
  const params = new URLSearchParams();
  const next = safeLoginNextPath(`${window.location.pathname}${window.location.search}`);
  if (next) params.set("next", next);
  params.set("neden", "oturum");
  return `/klinik/giris?${params.toString()}`;
}

function handleBlocked(message: string) {
  // Kurum askıda / şube erişimi yok: ağ hatası değildir, sık yeniden denenmez.
  if (!blockedNoticeShown) {
    blockedNoticeShown = true;
    showToastSafe({ type: "error", title: "Erişim kısıtlı", message: message || "Bu oturumda klinik bilgileri alınamıyor.", duration: 6000 });
  }
}

function handleFailure() {
  const failures = state.failures + 1;
  setState({ failures });
  if (failures >= FAILURES_BEFORE_NOTICE && !degradedNoticeShown) {
    degradedNoticeShown = true;
    showToastSafe({
      type: "info",
      title: "Bağlantı sorunu",
      message: "Bilgiler şu an güncellenemiyor; ekranınız ve yetkileriniz korunuyor, yeniden deneniyor.",
      duration: 6000,
    });
  }
  schedule(RETRY_STEPS_MS[Math.min(failures - 1, RETRY_STEPS_MS.length - 1)]);
}

/** Özeti hemen yeniden yükler (eşzamanlı çağrılar tek isteği paylaşır). */
export function loadPanelSummary(): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  lastAttemptAt = Date.now();
  pendingWhileHidden = false;
  rerunRequested = false;
  inFlight = (async () => {
    try {
      const since = readMessagesSince();
      const response = await fetch(`/api/panel-summary${since ? `?messagesSince=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
      unauthorizedStrikes = 0;
      if (response.status === 403 || response.status === 423) {
        const body = await response.json().catch(() => null);
        handleBlocked(typeof body?.message === "string" ? body.message : "");
        return;
      }
      if (!response.ok) throw new Error(`panel-summary ${response.status}`);
      const parsed = parseSummary(await response.json().catch(() => null));
      if (!parsed) throw new Error("panel-summary: beklenmeyen yanıt");
      if (degradedNoticeShown) {
        showToastSafe({ type: "success", message: "Bağlantı yeniden kuruldu.", duration: 2500 });
      }
      degradedNoticeShown = false;
      blockedNoticeShown = false;
      // Başka bir sekmede şube değişirse bu sekmenin ekranı eski şubede kalır.
      if (parsed.scopeKey && activeScopeKey && parsed.scopeKey !== activeScopeKey && !scopeNoticeShown) {
        scopeNoticeShown = true;
        showToastSafe({ type: "info", title: "Aktif şube değişti", message: "Şube başka bir sekmede değiştirildi. Doğru bilgileri görmek için sayfayı yenileyin.", duration: 8000 });
      }
      setState({ data: parsed, loadedAt: Date.now(), failures: 0 });
      if (rerunRequested) {
        rerunRequested = false;
        schedule(1_000);
      }
    } catch {
      handleFailure();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function onRealtime() {
  if (isHidden()) {
    pendingWhileHidden = true;
    return;
  }
  // Ard arda gelen değişiklikler tek yüklemede birleşir.
  schedule(Math.max(300, lastAttemptAt + REALTIME_MIN_GAP_MS - Date.now()));
}

function onBecameVisible() {
  if (isHidden()) return;
  if (pendingWhileHidden || Date.now() - lastAttemptAt >= VISIBLE_MIN_GAP_MS) schedule(300);
}

function onUnreadChanged() {
  // Ana sayfa mesajları okundu işaretledi: sayı hemen düşsün, ardından tazelensin.
  // Sayı zaten 0 ise değişecek bir şey yok: ikinci bir /api/panel-summary
  // isteği atılmaz. Özet henüz gelmediyse ya da bir istek yoldaysa yine
  // tazelenir (yoldaki istek eski okundu işaretini taşıyor olabilir).
  const current = state.data;
  if (current && !current.counts.unreadMessages && !inFlight) return;
  if (current && activeScopeKey) {
    let value = 0;
    try {
      value = Number(localStorage.getItem(scopedStorageKey("clinic-unread-messages", activeScopeKey)) || 0) || 0;
    } catch {
      value = 0;
    }
    if (value === 0) setState({ data: { ...current, counts: { ...current.counts, unreadMessages: 0 } } });
  }
  schedule(1_500);
}

function startDriver() {
  schedule(INITIAL_DELAY_MS);
  const onVisibility = () => onBecameVisible();
  const onFocus = () => onBecameVisible();
  const onOnline = () => schedule(500);
  const onFeatures = () => schedule(0);
  const interval = window.setInterval(() => {
    if (isHidden()) return;
    if (Date.now() - lastAttemptAt >= POLL_INTERVAL_MS) schedule(0);
  }, 60_000);
  window.addEventListener("ks:realtime-sync", onRealtime);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("institution-features-change", onFeatures);
  window.addEventListener("clinic-unread-messages-change", onUnreadChanged);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(interval);
    if (timer) clearTimeout(timer);
    timer = null;
    timerDueAt = 0;
    window.removeEventListener("ks:realtime-sync", onRealtime);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("institution-features-change", onFeatures);
    window.removeEventListener("clinic-unread-messages-change", onUnreadChanged);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

let driverUsers = 0;
let stopDriver: (() => void) | null = null;

/**
 * Özet yükleyicisini başlatır (sol menü ve üst bar çağırır; tek kopya çalışır).
 * Oturum kapsamı (kullanıcı/kurum/şube) değişirse eski sayılar atılır.
 */
export function usePanelSummarySync(scopeKey: string) {
  useEffect(() => {
    if (scopeKey !== activeScopeKey) {
      // Başka kullanıcı/kurum/şubenin sayıları ekranda kalmasın.
      const previous = activeScopeKey;
      activeScopeKey = scopeKey;
      scopeNoticeShown = false;
      if (previous) setState(EMPTY_STATE);
    }
    driverUsers += 1;
    if (driverUsers === 1) stopDriver = startDriver();
    return () => {
      driverUsers -= 1;
      if (driverUsers === 0) {
        stopDriver?.();
        stopDriver = null;
      }
    };
  }, [scopeKey]);
}

/** Zildeki "Yeniden dene" gibi elle yenileme. */
export function refreshPanelSummary() {
  schedule(0);
}

// ── Rozet tanımları (menü ve zil aynı metni kullanır) ───────────────────────

export type NavBadge = { count: number; tone: CountBadgeTone; label: string };

/** Menü öğesinin rozeti; sayı bilinmiyorsa ya da 0 ise null (asla "0" gösterilmez). */
export function navBadgeFor(key: NavBadgeKey | undefined, counts: PanelSummaryCounts | null | undefined): NavBadge | null {
  if (!key || !counts) return null;
  switch (key) {
    case "onlineRequests":
      return counts.onlineRequests ? { count: counts.onlineRequests, tone: "warning", label: "online randevu talebi" } : null;
    case "tasksDue":
      return counts.tasksDue ? { count: counts.tasksDue, tone: "warning", label: "görevin zamanı geldi" } : null;
    case "labAtLab": {
      const lab = counts.lab;
      if (!lab?.atLab) return null;
      return lab.late > 0
        ? { count: lab.atLab, tone: "critical", label: `iş laboratuvarda, ${lab.late} gecikti` }
        : { count: lab.atLab, tone: "info", label: "iş laboratuvarda" };
    }
    case "stockCritical":
      return counts.stockCritical ? { count: counts.stockCritical, tone: "critical", label: "kritik malzeme" } : null;
    case "installmentsOverdue":
      return counts.installmentsOverdue ? { count: counts.installmentsOverdue, tone: "critical", label: "geciken taksit" } : null;
    default:
      return null;
  }
}
