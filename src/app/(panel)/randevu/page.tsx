"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarOff, ClipboardCheck, FileSpreadsheet, Inbox, ListChecks, Lock, Plus, Printer, Rows3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { CalendarSkeleton, TableSkeleton } from "@/components/ui/PageSkeleton";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { cachedGet } from "@/lib/client-cache";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { STATUS_ACTION_ICON } from "@/lib/status-actions";
import { turkeyDateKey } from "@/lib/tz";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { DateNav } from "@/components/randevu/DateNav";
import { TimeGrid, type GridColumn } from "@/components/randevu/TimeGrid";
import { MonthGrid, monthGridRange, type MonthDaySummary } from "@/components/randevu/MonthGrid";
import { AgendaList } from "@/components/randevu/AgendaList";
import type { AppointmentFormInitial, AppointmentFormSaved } from "@/components/randevu/AppointmentFormModal";
import type { PendingTab } from "@/components/randevu/PendingRequestsModal";
import { useCalendarSettings } from "@/components/randevu/useCalendarSettings";
import { linkBookingRequest, linkWaitlistEntry, saveAppointment } from "@/components/randevu/appointment-api";
import { downloadExcel, printRoomList, printSchedule, type ExportMeta } from "@/components/randevu/randevu-export";
import {
  TR_DAYS_SHORT,
  TR_MONTHS,
  addDays,
  countByDisplay,
  dateAtMinutes,
  displayStatus,
  durationMinutes,
  formatClock,
  formatDayLong,
  formatDayShort,
  fromDateKey,
  getDayHours,
  nextVisitDateKey,
  parseNoteFull,
  patientNoticeText,
  preferredDateKeyOf,
  preferredMinutesOf,
  timeLabel,
  toDateKey,
  type Appointment,
  type AppointmentPermissions,
  type AppointmentSource,
  type DoctorBlock,
} from "@/components/randevu/appointment-utils";

// Pencereler ilk açılışta indirilmez (sayfa paketi küçülür); takvim
// yüklendikten sonra boşta form ve detay penceresi önceden indirilir.
const loadFormModal = () => import("@/components/randevu/AppointmentFormModal");
const loadDetailModal = () => import("@/components/randevu/AppointmentDetailModal");
const AppointmentFormModal = dynamic(() => loadFormModal().then((module) => module.AppointmentFormModal), { ssr: false });
const AppointmentDetailModal = dynamic(() => loadDetailModal().then((module) => module.AppointmentDetailModal), { ssr: false });
const BlockTimeModal = dynamic(() => import("@/components/randevu/BlockTimeModal").then((module) => module.BlockTimeModal), { ssr: false });
const BlockActionModal = dynamic(() => import("@/components/randevu/BlockActionModal").then((module) => module.BlockActionModal), { ssr: false });
const PendingRequestsModal = dynamic(() => import("@/components/randevu/PendingRequestsModal").then((module) => module.PendingRequestsModal), { ssr: false });

type ViewKey = "GUN" | "HAFTA" | "AY" | "AJANDA";
const VIEW_KEYS: readonly ViewKey[] = ["GUN", "HAFTA", "AY", "AJANDA"];
// `talepler` (online | bekleme): zil, Ana sayfa "Bekleyen işler" ve routes.bookingRequests()
// bu adresle gelir; Talepler penceresi ilgili sekmede açılır.
const ONE_SHOT_PARAMS = ["yeni", "patientId", "patientName", "newPatientId", "newPatientName", "focusAppointmentId", "talepler"];
const UNLINKED_STORAGE_KEY = "randevu:unlinked-online-requests";
/** Doktor rolünde varsayılan kendi takvimidir; "Tüm doktorlar" seçimi adreste böyle tutulur. */
const ALL_DOCTORS = "tum";
/** Bu süreden eski veri, sekmeye/pencereye dönülünce sessizce yenilenir. */
const STALE_MS = 60_000;
const CACHE_LIMIT = 12;
/**
 * Kendi kaydımızın gerçek zamanlı olayı (~1,2 sn birleştirmeyle gelir) az önce
 * yapılan yüklemeyi tekrarlamasın: KENDİ değişikliğimizden sonraki yenilemeden
 * bu yana bu süre geçmediyse olay atlanır (önceden kayıttan sonra randevular,
 * kapalı zamanlar ve sayaçlar ikişer kez yükleniyordu — H7). Gezinme
 * yüklemeleri bu süreyi başlatmaz: o arada başka personelin verdiği randevu
 * olayı atlanıp takvim eski kalmasın.
 */
const REALTIME_DEDUPE_MS = 2_000;

type AgendaFilter = "AKTIF" | "PLANLANDI" | "BEKLIYOR" | "TAMAMLANDI" | "GELMEDI" | "IPTAL";
const AGENDA_FILTERS: readonly AgendaFilter[] = ["AKTIF", "PLANLANDI", "BEKLIYOR", "TAMAMLANDI", "GELMEDI", "IPTAL"];

type FormState = {
  mode: "create" | "edit";
  appointment?: Appointment | null;
  initial?: AppointmentFormInitial;
  source?: AppointmentSource | null;
};

type PendingCounts = { onlineRequests: number; waitlist: number; openPast: number };

type RangeEntry =
  | { kind: "month"; monthDays: Record<string, MonthDaySummary>; truncated: boolean }
  | { kind: "list"; appointments: Appointment[]; blocks: DoctorBlock[]; truncated: boolean };

function weekStart(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function readUnlinked(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(UNLINKED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeUnlinked(value: Record<string, string>) {
  try {
    window.localStorage.setItem(UNLINKED_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Tarayıcı depolaması kapalıysa yalnız bu oturumda tutulur.
  }
}

export default function RandevuPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, role, userId: sessionUserId } = usePermissions();

  // İzinler boolean'a indirilir: `can` her yetki yoklamasında yeni fonksiyon
  // olduğu için önceden takvim 15 sn'de bir baştan çiziliyordu.
  const canCreate = can("appointments:write");
  const canDelete = can("appointments:delete");
  const canApprove = can("appointments:approve");
  const canSeePhone = can("patients:phone");
  const canStaffWrite = can("staff:write");
  const canManageBlocks = canCreate && (role === "YONETICI" || role === "SUPERADMIN");
  const permissions = useMemo<AppointmentPermissions>(
    () => ({ canCreate, canDelete, canApprove, canSeePhone, canManageBlocks }),
    [canCreate, canDelete, canApprove, canSeePhone, canManageBlocks],
  );

  const { settings, doctors, treatments, clinicUnits, slotInterval, error: settingsError, reload: reloadSettings } = useCalendarSettings();

  // ── "Bugün" Türkiye takvimine göre: sunucu (UTC) ile tarayıcı aynı günü
  // yazar. Önceden gece 00:00–03:00 arasında sunucu bir gün geride kalıyor,
  // her açılışta hidrasyon hatası (#418) oluyordu.
  const [todayKey, setTodayKey] = useState(() => turkeyDateKey());

  // ── Adres çubuğu: görünüm, tarih, doktor ve liste süzgeci tek gerçek kaynak.
  // Görünüm adreste yoksa telefonda Liste, geniş ekranda Gün (adrese yazılmaz;
  // önceden adrese yazılması tek seferlik parametre temizliğiyle yarışıyor,
  // telefonda ikinci yükleme ve ızgara→liste zıplaması oluyordu).
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  useEffect(() => { setIsPhone(window.matchMedia("(max-width: 639px)").matches); }, []);
  const rawView = searchParams.get("view");
  const explicitView = VIEW_KEYS.includes(rawView as ViewKey) ? (rawView as ViewKey) : null;
  const view: ViewKey | null = explicitView ?? (isPhone === null ? null : isPhone ? "AJANDA" : "GUN");
  const shownView: ViewKey = view ?? "GUN";
  const dateParam = searchParams.get("date");
  const dateKey = fromDateKey(dateParam) ? (dateParam as string) : todayKey;
  const date = useMemo(() => fromDateKey(dateKey) || new Date(), [dateKey]);
  const rawDurum = (searchParams.get("durum") || "").toUpperCase() as AgendaFilter;
  const agendaFilter: AgendaFilter = AGENDA_FILTERS.includes(rawDurum) ? rawDurum : "AKTIF";

  // Doktor rolünde varsayılan kendi takvimi. Oturum kimliği panel kabuğundan
  // (PermissionProvider) gelir: önceden /api/auth/me ayrı istenip yanıtı
  // beklendikten SONRA randevular isteniyordu (doktor açılışında şelale).
  // Kabuk kimliği vermezse eski yol (önbellekli /api/auth/me) yedek kalır.
  const isDoctorRole = role === "DOKTOR";
  const needsViewerFetch = isDoctorRole && !sessionUserId;
  const [fetchedViewerId, setFetchedViewerId] = useState<string | null>(null);
  const [viewerFetchDone, setViewerFetchDone] = useState(false);
  useEffect(() => {
    if (!needsViewerFetch) return;
    let cancelled = false;
    cachedGet<{ id?: string } | null>("/api/auth/me", 60_000)
      .then((me) => { if (!cancelled) setFetchedViewerId(me?.id || null); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setViewerFetchDone(true); });
    return () => { cancelled = true; };
  }, [needsViewerFetch]);
  const viewerId = isDoctorRole ? sessionUserId || fetchedViewerId : null;
  const viewerResolved = !needsViewerFetch || viewerFetchDone;
  const rawDoctorParam = searchParams.get("doctorId") || "";
  const viewerIsDoctor = Boolean(viewerId) && (doctors.length === 0 || doctors.some((doctor) => doctor.id === viewerId));
  const doctorId = rawDoctorParam === ALL_DOCTORS ? "" : rawDoctorParam || (isDoctorRole && viewerIsDoctor && viewerId ? viewerId : "");

  // Yerel geçmiş API'si: adres anında değişir, sunucuya tur atılmaz (önceden
  // her ‹ › ve görünüm tıklaması sunucu yanıtını bekliyordu).
  const updateParams = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [pathname]);

  const setView = (next: ViewKey) => updateParams({ view: next });
  const setDate = (next: Date) => updateParams({ date: toDateKey(next) === todayKey ? null : toDateKey(next) });
  const setDoctorFilter = (id: string) => updateParams({ doctorId: id || (isDoctorRole ? ALL_DOCTORS : null) });
  const setAgendaFilter = (next: AgendaFilter) => updateParams({ durum: next === "AKTIF" ? null : next.toLowerCase() });

  // ── Aralık ───────────────────────────────────────────────────────────────
  const range = useMemo(() => {
    if (shownView === "HAFTA") {
      const start = weekStart(date);
      return { start, end: addDays(start, 6) };
    }
    if (shownView === "AY") return monthGridRange(date);
    return { start: date, end: date };
  }, [date, shownView]);
  const fromKey = toDateKey(range.start);
  const toKey = toDateKey(range.end);

  // ── Veri ─────────────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<DoctorBlock[]>([]);
  const [monthDays, setMonthDays] = useState<Record<string, MonthDaySummary>>({});
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [counts, setCounts] = useState<PendingCounts>({ onlineRequests: 0, waitlist: 0, openPast: 0 });
  const loadSeqRef = useRef(0);
  const lastLoadAtRef = useRef(0);
  // Gezilen gün/haftaların verisi: geri dönünce eldeki veri anında görünür,
  // arkada yenilenir (en çok 12 aralık).
  const cacheRef = useRef(new Map<string, RangeEntry>());
  const ready = view !== null && viewerResolved;
  const dataKind = shownView === "AY" ? "AY" : shownView === "AJANDA" ? "LISTE" : "IZGARA";
  const requestKey = `${dataKind}|${fromKey}|${toKey}|${doctorId}`;

  const applyEntry = useCallback((entry: RangeEntry) => {
    if (entry.kind === "month") {
      setMonthDays(entry.monthDays);
    } else {
      setAppointments(entry.appointments);
      setBlocks(entry.blocks);
    }
    setTruncated(entry.truncated);
  }, []);

  const remember = useCallback((key: string, entry: RangeEntry) => {
    const cache = cacheRef.current;
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }, []);

  const load = useCallback(async () => {
    if (!ready) return;
    const key = requestKey;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      let entry: RangeEntry;
      if (dataKind === "AY") {
        const params = new URLSearchParams({ from: fromKey, to: toKey });
        if (doctorId) params.set("doctorId", doctorId);
        const response = await fetch(`/api/appointments/month-summary?${params.toString()}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (seq !== loadSeqRef.current) return;
        if (!response.ok) throw new Error(data?.message || "Aylık görünüm yüklenemedi.");
        entry = { kind: "month", monthDays: data?.days || {}, truncated: Boolean(data?.truncated) };
      } else {
        const start = fromDateKey(fromKey) || new Date();
        const end = fromDateKey(toKey) || new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
        if (doctorId) params.set("doctorId", doctorId);
        // Randevular ve kapalı zamanlar paralel; Liste görünümü kapalı zamanı göstermez, istemez.
        const [appointmentsResponse, blocksResponse] = await Promise.all([
          fetch(`/api/appointments?${params.toString()}`, { cache: "no-store" }),
          dataKind === "LISTE" ? Promise.resolve(null) : fetch(`/api/doctor-blocks?from=${fromKey}&to=${toKey}`, { cache: "no-store" }),
        ]);
        const [data, blockData] = await Promise.all([
          appointmentsResponse.json().catch(() => null),
          blocksResponse ? blocksResponse.json().catch(() => null) : Promise.resolve(null),
        ]);
        if (seq !== loadSeqRef.current) return;
        if (!appointmentsResponse.ok) throw new Error(data?.message || "Randevular yüklenemedi.");
        entry = {
          kind: "list",
          appointments: Array.isArray(data) ? data : [],
          blocks: blocksResponse?.ok && Array.isArray(blockData) ? blockData : [],
          truncated: appointmentsResponse.headers.get("X-Result-Truncated") === "1",
        };
      }
      remember(key, entry);
      applyEntry(entry);
      setLoadError(null);
      setLoadedKey(key);
      lastLoadAtRef.current = Date.now();
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Randevular yüklenemedi.");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [ready, requestKey, dataKind, fromKey, toKey, doctorId, remember, applyEntry]);

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/today?lite=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return;
      setCounts({ onlineRequests: Number(data.onlineRequests || 0), waitlist: Number(data.waitlist || 0), openPast: Number(data.openPast?.count || 0) });
    } catch {
      // Sayaçlar yardımcı bilgi; hata takvimi engellemez.
    }
  }, []);

  // Aralık değişince: önbellekte varsa hemen göster, arkada yenile. Liste,
  // aynı günün ızgara verisini de kullanabilir (Gün → Liste geçişi beklemez).
  useEffect(() => {
    if (!ready) return;
    const cached = cacheRef.current.get(requestKey)
      || (dataKind === "LISTE" ? cacheRef.current.get(`IZGARA${requestKey.slice("LISTE".length)}`) : undefined);
    if (cached) {
      applyEntry(cached);
      setLoadedKey(requestKey);
    }
    void load();
  }, [ready, requestKey, dataKind, load, applyEntry]);
  useEffect(() => { void loadCounts(); }, [loadCounts]);

  // Kendi değişikliğimizden (kayıt, taşıma, durum, kapalı zaman) sonraki yenileme:
  // ardından gelen kendi gerçek zamanlı yankımız atlanır.
  const ownChangeAtRef = useRef(0);
  const reloadAfterOwnChange = useCallback(() => {
    ownChangeAtRef.current = Date.now();
    void load();
  }, [load]);

  // Gerçek zamanlı değişiklik: 0,8 sn birleştirilir; sekme gizliyken
  // yenilenmez, görünür olunca bir kez yenilenir. Pencereye dönüşte veri
  // eskiyse yenilenir (önceden her odakta ve gizli sekmede de istek atılıyordu).
  useEffect(() => {
    let timer: number | null = null;
    let missed = false;
    const run = () => {
      if (document.hidden) { missed = true; return; }
      void load();
      void loadCounts();
    };
    const schedule = (delay: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, delay);
    };
    const onRealtime = () => {
      if (Date.now() - ownChangeAtRef.current < REALTIME_DEDUPE_MS) return;
      schedule(800);
    };
    // Rol önizlemesi değişince izinler değişir: her zaman yenilenir.
    const onPreviewRole = () => schedule(800);
    const onVisibility = () => {
      if (document.hidden) return;
      setTodayKey(turkeyDateKey());
      if (missed || Date.now() - lastLoadAtRef.current > STALE_MS) { missed = false; schedule(150); }
    };
    const onFocus = () => { if (Date.now() - lastLoadAtRef.current > STALE_MS) schedule(150); };
    window.addEventListener("ks:realtime-sync", onRealtime);
    window.addEventListener("preview-role-change", onPreviewRole);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      window.removeEventListener("preview-role-change", onPreviewRole);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, loadCounts]);

  const hasData = loadedKey !== "";
  const showingStale = loadedKey !== requestKey;

  // Takvim gelince sık açılan iki pencere boşta önceden indirilir.
  useEffect(() => {
    if (!hasData) return;
    const timer = window.setTimeout(() => { void loadFormModal(); void loadDetailModal(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [hasData]);

  // ── Pencereler ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockAction, setBlockAction] = useState<{ block: DoctorBlock; column: GridColumn; minutes: number } | null>(null);
  const [pendingTab, setPendingTab] = useState<PendingTab | null>(null);
  const [unlinked, setUnlinked] = useState<Record<string, string>>({});

  useEffect(() => { setUnlinked(readUnlinked()); }, []);

  const defaultCreateDate = dateKey >= todayKey ? dateKey : todayKey;
  const openCreate = useCallback((initial: AppointmentFormInitial = {}, source: AppointmentSource | null = null) => {
    if (!permissions.canCreate) return;
    setForm({ mode: "create", initial: { dateKey: defaultCreateDate, doctorId: doctorId || undefined, ...initial }, source });
  }, [permissions.canCreate, defaultCreateDate, doctorId]);

  // Tek seferlik adres parametreleri: ?yeni=1, ?patientId=, ?newPatientId= (eski),
  // ?focusAppointmentId=. İşlendikten sonra adresten silinir.
  const oneShotKey = ONE_SHOT_PARAMS.map((key) => `${key}=${searchParams.get(key) || ""}`).join("&");
  const processedOneShotRef = useRef("");
  useEffect(() => {
    const hasAny = ONE_SHOT_PARAMS.some((key) => searchParams.get(key));
    // Parametreler temizlenince işaret de sıfırlanır: aynı bağlantı (üst bar
    // "Yeni › Randevu", zildeki online talep) bu sayfadayken yeniden açılınca
    // da işlensin. Önceden ikinci tıklama hiçbir şey yapmıyordu.
    if (!hasAny) { processedOneShotRef.current = ""; return; }
    if (processedOneShotRef.current === oneShotKey) return;
    processedOneShotRef.current = oneShotKey;
    const patientId = searchParams.get("patientId") || searchParams.get("newPatientId");
    const patientName = searchParams.get("patientName") || searchParams.get("newPatientName");
    const focusId = searchParams.get("focusAppointmentId");
    const requestsTab = searchParams.get("talepler");
    const wantsForm = searchParams.get("yeni") === "1" || Boolean(patientId);

    const cleanup: Record<string, null> = {};
    for (const key of ONE_SHOT_PARAMS) cleanup[key] = null;
    updateParams(cleanup);

    // Önceden bu bağlantılar yalnız takvimi açıyordu; talep listesi ayrıca aranıyordu.
    if (requestsTab && !wantsForm && !focusId) setPendingTab(requestsTab === "bekleme" ? "bekleme" : "online");

    if (wantsForm && permissions.canCreate) {
      const formDate = dateKey >= todayKey ? dateKey : todayKey;
      if (patientId && patientName) {
        openCreate({ patient: { id: patientId, fullName: patientName }, dateKey: formDate });
      } else if (patientId) {
        // Yalnız ad/telefon gerekiyor: hasta arama ucu (tam hasta kaydı ve
        // erişim kaydı yazan /api/patients/:id yerine).
        fetch(`/api/patients?id=${encodeURIComponent(patientId)}&take=1&summary=false`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { patients?: PickedPatient[] } | null) => {
            const patient = data?.patients?.[0];
            openCreate({ patient: patient?.id ? { id: patient.id, fullName: patient.fullName, phone: patient.phone || null, tcNo: patient.tcNo || null } : null, dateKey: formDate });
          })
          .catch(() => openCreate({ dateKey: formDate }));
      } else {
        openCreate({ dateKey: formDate });
      }
    }
    if (focusId) {
      fetch(`/api/appointments/${encodeURIComponent(focusId)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((appointment: Appointment | null) => {
          if (appointment?.id) setDetail(appointment);
          else showToastSafe({ message: "Randevu bulunamadı ya da silinmiş.", type: "error" });
        })
        .catch(() => undefined);
    }
  }, [oneShotKey, searchParams, updateParams, permissions.canCreate, openCreate, dateKey, todayKey]);

  // Kaydedilen/taşınan randevu ekranda hemen görünür (önceden yenileme
  // gelene kadar birkaç saniye eski veri duruyordu — canlı test H9).
  const upsertLocal = useCallback((saved: Appointment) => {
    const savedKey = toDateKey(new Date(saved.startAt));
    const inRange = savedKey >= fromKey && savedKey <= toKey && (!doctorId || saved.doctor?.id === doctorId);
    setAppointments((list) => {
      const exists = list.some((item) => item.id === saved.id);
      if (exists) return inRange ? list.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)) : list.filter((item) => item.id !== saved.id);
      return inRange ? [...list, saved] : list;
    });
  }, [fromKey, toKey, doctorId]);

  // ── Kayıt sonrası ────────────────────────────────────────────────────────
  const reopenPendingFor = (state: FormState) => {
    if (state.source?.type === "online") setPendingTab("online");
    else if (state.source?.type === "waitlist") setPendingTab("bekleme");
  };

  const closeForm = () => {
    const state = form;
    setForm(null);
    if (state) reopenPendingFor(state);
  };

  const afterSaved = async (result: AppointmentFormSaved, state: FormState) => {
    setForm(null);
    const warnings: string[] = [];
    if (state.mode === "create" && state.source?.type === "online") {
      const linked = await linkBookingRequest(state.source.request.id, result.appointment.id);
      if (!linked.ok) {
        const next = { ...unlinked, [state.source.request.id]: result.appointment.id };
        setUnlinked(next);
        writeUnlinked(next);
        warnings.push(`Online talep kapanmadı: ${linked.message} “Talepler”den talebi kapatın.`);
      }
    }
    if (state.mode === "create" && state.source?.type === "waitlist") {
      const linked = await linkWaitlistEntry(state.source.entry.id, result.appointment.id);
      if (!linked.ok) warnings.push(`Bekleme listesi kaydı kapanmadı: ${linked.message}`);
    }
    showToastSafe({
      title: state.mode === "edit" ? "Randevu güncellendi" : "Randevu oluşturuldu",
      message: [result.message, ...warnings].join(" "),
      type: warnings.length ? "info" : result.tone,
      icon: STATUS_ACTION_ICON[state.mode === "edit" ? "appointment-rescheduled" : "appointment-created"],
      duration: warnings.length || result.tone !== "success" ? 7000 : 4000,
    });
    // Takvim yeni randevunun gününe gider ki kullanıcı sonucu görsün.
    const savedKey = toDateKey(new Date(result.appointment.startAt));
    if (shownView !== "AY" && savedKey !== dateKey && !(shownView === "HAFTA" && savedKey >= fromKey && savedKey <= toKey)) {
      // Yeni günün yüklemesini adres değişimi başlatır; kendi kaydımızın yankısı yine atlanır.
      ownChangeAtRef.current = Date.now();
      updateParams({ date: savedKey === todayKey ? null : savedKey });
    } else {
      upsertLocal(result.appointment);
      reloadAfterOwnChange();
    }
    void loadCounts();
    reopenPendingFor(state);
  };

  const resolveUnlinked = (requestId: string) => {
    const next = { ...unlinked };
    delete next[requestId];
    setUnlinked(next);
    writeUnlinked(next);
  };

  const scheduleFromSource = (source: AppointmentSource) => {
    setPendingTab(null);
    if (source.type === "online") {
      const prefKey = preferredDateKeyOf(source.request.preferredFrom);
      openCreate({
        doctorId: source.request.doctor?.id || doctorId || undefined,
        dateKey: prefKey && prefKey >= todayKey ? prefKey : defaultCreateDate,
        minutes: preferredMinutesOf(source.request.preferredFrom),
        note: source.request.note || "",
      }, source);
    } else {
      const prefKey = preferredDateKeyOf(source.entry.preferredFrom);
      openCreate({
        patient: { id: source.entry.patient.id, fullName: source.entry.patient.fullName, phone: source.entry.patient.phone || null },
        doctorId: source.entry.doctor?.id || doctorId || undefined,
        // Tercih yoksa görüntülenen gün (önceden bugüne düşüyordu — canlı test).
        dateKey: prefKey && prefKey >= todayKey ? prefKey : defaultCreateDate,
      }, source);
    }
  };

  // Tamamlanan randevudan "Sonraki randevu": bir hafta sonrası önerilir,
  // hızlı günler +1 hafta / +2 hafta / +1 ay. Gelmeyen/iptal: bugünden.
  const nextAppointmentFor = (appointment: Appointment) => {
    setDetail(null);
    const parsed = parseNoteFull(appointment.note, treatments);
    const followUpVisit = appointment.status === "TAMAMLANDI";
    openCreate({
      patient: appointment.patient ? { id: appointment.patient.id, fullName: appointment.patient.fullName, phone: appointment.patient.phone || null, tcNo: appointment.patient.tcNo || null } : null,
      doctorId: appointment.doctor?.id,
      treatment: parsed.treatment,
      dateKey: followUpVisit ? nextVisitDateKey(settings?.dailySchedules, todayKey) : todayKey,
      quickDates: followUpVisit ? "sonraki" : "yakin",
    });
  };

  // Sürükle-bırak: bırakınca açık onay; metin hastaya mesaj gidip gitmediğini doğru söyler.
  const moveAppointment = async (appointment: Appointment, column: GridColumn, minutes: number) => {
    const targetDoctorId = column.doctorId || appointment.doctor?.id || "";
    const start = dateAtMinutes(column.dateKey, minutes);
    if (!start || !targetDoctorId) return;
    const sameTime = new Date(appointment.startAt).getTime() === start.getTime();
    if (sameTime && targetDoctorId === appointment.doctor?.id) return;
    const end = new Date(start.getTime() + durationMinutes(appointment.startAt, appointment.endAt) * 60_000);
    const targetDoctor = doctors.find((doctor) => doctor.id === targetDoctorId);
    const fromText = `${formatDayShort(new Date(appointment.startAt))} ${formatClock(appointment.startAt)}`;
    const toText = `${formatDayShort(start)} ${timeLabel(minutes)}`;
    const doctorText = targetDoctorId !== appointment.doctor?.id ? ` · Doktor: ${appointment.doctor?.fullName || "—"} → ${targetDoctor?.fullName || "—"}` : "";
    const confirmed = await confirmDialog({
      title: "Randevu taşınsın mı?",
      message: `${appointment.patient?.fullName || "Hasta"}: ${fromText} → ${toText}${doctorText}. ${patientNoticeText("change", appointment, settings, { newStartAt: start })}`,
      confirmText: "Taşı",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    const parsed = parseNoteFull(appointment.note, treatments);
    const color = treatments.find((item) => item.value === parsed.treatment)?.color;
    // Durum gönderilmez: sunucu mevcut durumu korur.
    const result = await saveAppointment(`/api/appointments/${appointment.id}`, "PUT", {
      patientId: appointment.patient?.id || "",
      doctorId: targetDoctorId,
      clinicUnitId: appointment.clinicUnit?.id || null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      type: appointment.type || "STANDART",
      colorCode: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : appointment.colorCode && /^#[0-9a-fA-F]{6}$/.test(appointment.colorCode) ? appointment.colorCode : "#2a9d8f",
      note: appointment.note || "",
    });
    if (!result.ok) {
      if (result.message) showToastSafe({ title: "Randevu taşınamadı", message: result.message, type: "error", duration: 6000 });
      return;
    }
    upsertLocal({ ...appointment, ...result.data, branch: appointment.branch });
    showToastSafe({ title: "Randevu taşındı", message: `${appointment.patient?.fullName || "Hasta"} · ${toText}`, type: "success", icon: STATUS_ACTION_ICON["appointment-rescheduled"] });
    reloadAfterOwnChange();
  };

  // ── Görünüm verileri ─────────────────────────────────────────────────────
  const visibleDoctors = useMemo(() => (doctorId ? doctors.filter((doctor) => doctor.id === doctorId) : doctors), [doctors, doctorId]);
  const selectedDoctorName = doctorId ? doctors.find((doctor) => doctor.id === doctorId)?.fullName || "Seçili doktor" : "Tüm doktorlar";
  const dayHours = settings ? getDayHours(settings.dailySchedules, date, settings.openingTime, settings.closingTime) : null;
  const dayAppointments = useMemo(() => appointments.filter((item) => toDateKey(new Date(item.startAt)) === dateKey), [appointments, dateKey]);

  // Gün görünümünde doktor başlığında o günkü randevu sayısı (doluluk tek bakışta).
  const dayColumns = useMemo<GridColumn[]>(() => visibleDoctors.map((doctor) => {
    const count = dayAppointments.filter((item) => item.doctor?.id === doctor.id && item.status !== "IPTAL").length;
    return {
      key: doctor.id,
      date,
      dateKey,
      doctorId: doctor.id,
      header: (
        <span className="flex items-center justify-center gap-1.5">
          <span className="truncate">{doctor.fullName}</span>
          {count > 0 && <span className="shrink-0 text-xs font-semibold text-slate-500">· {count}</span>}
        </span>
      ),
      headerTitle: `${doctor.fullName}${count > 0 ? ` · ${count} randevu` : ""}`,
      cellLabel: doctor.fullName,
      isToday: dateKey === todayKey,
    };
  }), [visibleDoctors, dayAppointments, date, dateKey, todayKey]);

  const weekColumns = useMemo<GridColumn[]>(() => {
    if (!settings) return [];
    const days = Array.from({ length: 7 }, (_, index) => addDays(range.start, index));
    const visible = days.filter((day) => {
      const key = toDateKey(day);
      return !getDayHours(settings.dailySchedules, day).isHoliday || appointments.some((item) => toDateKey(new Date(item.startAt)) === key);
    });
    return (visible.length > 0 ? visible : days).map((day) => {
      const key = toDateKey(day);
      return {
        key,
        date: day,
        dateKey: key,
        doctorId: doctorId || null,
        header: (
          <span className="flex flex-col items-center leading-tight">
            <span className="text-xs font-bold">{TR_DAYS_SHORT[day.getDay()]} {day.getDate()}</span>
            {key === todayKey && <span className="text-[10px] font-black text-primary">Bugün</span>}
          </span>
        ),
        headerTitle: `${formatDayShort(day)} — gün görünümünü aç`,
        cellLabel: formatDayShort(day),
        isToday: key === todayKey,
        onHeaderClick: () => updateParams({ view: "GUN", date: key === todayKey ? null : key }),
      };
    });
  }, [settings, range.start, appointments, doctorId, todayKey, updateParams]);

  const agendaRows = useMemo(() => {
    if (agendaFilter === "AKTIF") return dayAppointments.filter((item) => item.status !== "IPTAL");
    return dayAppointments.filter((item) => displayStatus(item.status) === agendaFilter);
  }, [dayAppointments, agendaFilter]);
  const agendaCounts = useMemo(() => countByDisplay(dayAppointments), [dayAppointments]);

  const navLabel = shownView === "GUN" || shownView === "AJANDA"
    ? formatDayLong(date)
    : shownView === "HAFTA"
      ? `${range.start.getDate()} ${TR_MONTHS[range.start.getMonth()]} – ${range.end.getDate()} ${TR_MONTHS[range.end.getMonth()]} ${range.end.getFullYear()}`
      : `${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const stepLabel = shownView === "HAFTA" ? "hafta" : shownView === "AY" ? "ay" : "gün";
  const isTodayInRange = shownView === "AY" ? todayKey.slice(0, 7) === dateKey.slice(0, 7) : todayKey >= fromKey && todayKey <= toKey;

  // Gün/Liste: randevusuz kapalı günler atlanır (boş "tatil" ekranına düşmesin).
  // Kapalı günde randevu varsa o gün açılır: önceden Pazar'daki randevular
  // takvimde gezinerek hiç görünmüyordu (canlı test H6). Sayı tek bir hafif
  // gün özeti isteğiyle öğrenilir; öğrenilemezse sıradaki gün yine açılır.
  const stepBusyRef = useRef(false);
  const stepDate = async (direction: -1 | 1) => {
    if (shownView === "HAFTA") return setDate(addDays(date, 7 * direction));
    if (shownView === "AY") return setDate(new Date(date.getFullYear(), date.getMonth() + direction, 1, 12));
    const first = addDays(date, direction);
    if (!settings || !getDayHours(settings.dailySchedules, first).isHoliday) return setDate(first);
    if (stepBusyRef.current) return;
    const closedDays: Date[] = [];
    let nextOpen = first;
    for (let guard = 0; guard < 14 && getDayHours(settings.dailySchedules, nextOpen).isHoliday; guard += 1) {
      closedDays.push(nextOpen);
      nextOpen = addDays(nextOpen, direction);
    }
    const keys = closedDays.map((day) => toDateKey(day));
    const params = new URLSearchParams({ from: keys.reduce((a, b) => (a < b ? a : b)), to: keys.reduce((a, b) => (a > b ? a : b)) });
    if (doctorId) params.set("doctorId", doctorId);
    stepBusyRef.current = true;
    try {
      const response = await fetch(`/api/appointments/month-summary?${params.toString()}`, { cache: "no-store" });
      const data = response.ok ? await response.json().catch(() => null) : null;
      const days: Record<string, { total?: number }> | null = data?.days && typeof data.days === "object" ? data.days : null;
      if (!days) { setDate(first); return; }
      const withAppointments = closedDays.find((day) => Number(days[toDateKey(day)]?.total || 0) > 0);
      setDate(withAppointments || nextOpen);
    } catch {
      setDate(first);
    } finally {
      stepBusyRef.current = false;
    }
  };

  // ── Dışa aktarma ─────────────────────────────────────────────────────────
  const exportMeta = (): ExportMeta => ({
    clinicName: settings?.institutionName || "",
    title: shownView === "HAFTA" ? `Haftalık randevu çizelgesi · ${navLabel}` : `Günlük randevu çizelgesi · ${formatDayLong(date)}`,
    doctorName: selectedDoctorName,
    fileDateKey: fromKey,
    fileKind: shownView === "HAFTA" ? "haftalik" : "gunluk",
  });
  const exportRows = shownView === "HAFTA" ? appointments : dayAppointments;
  const canExport = shownView !== "AY" && !showingStale && hasData;
  const printFailed = () => showToastSafe({ message: "Yazdırma penceresi açılamadı. Tarayıcının açılır pencere iznini kontrol edin.", type: "error" });
  const exportUnavailable = "Gün, hafta ya da liste görünümünde";
  // Araç çubuğundaki "…" menüsü: kapalı zaman (yönetici) ve dışa aktarım. Ay
  // görünümünde dışa aktarım pasif ve nedenini söyler (önceden "Dışa aktar" düğmesi).
  const exportReason = canExport ? undefined : exportUnavailable;
  const calendarMenuItems: ActionMenuItem[] = [
    ...(permissions.canManageBlocks ? [{
      key: "block",
      label: "Zaman kapat",
      description: "Bu aralıkta doktora randevu verilemez (izin, toplantı…)",
      icon: Lock,
      onSelect: () => setBlockModalOpen(true),
    }] : []),
    {
      key: "print",
      label: "Çizelgeyi yazdır",
      icon: Printer,
      separatorBefore: permissions.canManageBlocks,
      disabled: !canExport,
      disabledReason: exportReason,
      onSelect: () => { if (!printSchedule(exportRows, treatments, exportMeta())) printFailed(); },
    },
    {
      key: "excel",
      label: "Excel olarak indir",
      icon: FileSpreadsheet,
      disabled: !canExport,
      disabledReason: exportReason,
      onSelect: () => downloadExcel(exportRows, treatments, exportMeta()),
    },
    {
      key: "room",
      label: "Oda listesi yazdır",
      description: "Odalara asılacak sade liste (doktor başına sayfa)",
      icon: Rows3,
      disabled: !canExport || shownView === "HAFTA",
      disabledReason: canExport ? "Gün ya da liste görünümünde" : exportReason,
      onSelect: () => { if (!printRoomList(dayAppointments, treatments, exportMeta())) printFailed(); },
    },
  ];

  const pendingTotal = counts.onlineRequests + counts.waitlist;
  // Kapalı gün ama randevu var (ör. Pazar'a verilmiş randevular): takvim
  // gösterilir, üstte uyarı çıkar.
  const closedDayCount = (shownView === "GUN" || shownView === "AJANDA") && dayHours?.isHoliday && !showingStale
    ? dayAppointments.filter((item) => item.status !== "IPTAL").length
    : 0;

  // ── İçerik ───────────────────────────────────────────────────────────────
  const staleNotice = loadError && hasData && !showingStale ? (
    <Callout tone="warning" compact action={<Button size="sm" variant="secondary" onClick={() => void load()}>Yeniden dene</Button>}>
      Takvim yenilenemedi: {loadError}
    </Callout>
  ) : null;

  const renderContent = () => {
    if (settingsError && !settings) {
      return <LoadErrorState message={`${settingsError} Takvim açılamadı.`} onRetry={() => void reloadSettings()} />;
    }
    if (!settings || !ready || (!hasData && !loadError)) {
      // Doktorlar henüz yüklenmediyse rota iskeletiyle (loading.tsx) aynı 3 sütun:
      // önceden 3 → 1 → gerçek sütun sayısı arasında zıplıyordu.
      return shownView === "AJANDA" || isPhone ? <TableSkeleton rows={6} columns={5} /> : <CalendarSkeleton columns={Math.min(visibleDoctors.length || 3, 4)} />;
    }
    if (loadError && (!hasData || showingStale)) {
      return <LoadErrorState message={loadError} onRetry={() => void load()} />;
    }
    if (shownView === "AY") {
      return (
        <MonthGrid
          date={date}
          days={monthDays}
          settings={settings}
          loading={loading}
          canCreate={permissions.canCreate}
          onOpenDay={(day) => updateParams({ view: "GUN", date: toDateKey(day) === todayKey ? null : toDateKey(day) })}
          onCreate={(day) => openCreate({ dateKey: toDateKey(day) })}
        />
      );
    }
    if (shownView === "AJANDA") {
      return (
        <AgendaList
          appointments={showingStale ? [] : agendaRows}
          treatments={treatments}
          loading={loading && showingStale}
          error={null}
          staleError={loadError && hasData && !showingStale ? loadError : null}
          onRetry={() => void load()}
          canCreate={permissions.canCreate}
          canSeePhone={permissions.canSeePhone}
          hideDoctor={Boolean(doctorId)}
          onOpen={setDetail}
          onChanged={(updated) => { setAppointments((list) => list.map((item) => (item.id === updated.id ? updated : item))); void loadCounts(); }}
          emptyText={agendaFilter === "AKTIF" ? "Bu gün randevu yok" : "Bu durumda randevu yok"}
          emptyAction={permissions.canCreate && dateKey >= todayKey && agendaFilter === "AKTIF" ? <Button size="sm" icon={Plus} onClick={() => openCreate()}>Yeni randevu</Button> : undefined}
          header={(
            // Telefonda durum süzgeci tek satırda yana kayar (üç satıra sarılmasın).
            <div className="overflow-x-auto border-b border-slate-100 px-4 py-2.5 [&_[role=radio]]:shrink-0 [&_[role=radiogroup]]:flex-nowrap sm:[&_[role=radiogroup]]:flex-wrap">
              <ChoiceCards
                label="Duruma göre süz"
                labelHidden
                variant="pills"
                value={agendaFilter}
                onChange={setAgendaFilter}
                options={[
                  { value: "AKTIF", label: "Tümü", count: showingStale ? undefined : dayAppointments.length - agendaCounts.IPTAL },
                  { value: "PLANLANDI", label: "Planlandı", count: showingStale ? undefined : agendaCounts.PLANLANDI },
                  // Satırdaki rozetle aynı ad: hasta geldi, bekleme salonunda.
                  { value: "BEKLIYOR", label: "Geldi (bekliyor)", count: showingStale ? undefined : agendaCounts.BEKLIYOR, countTone: "warning" },
                  { value: "TAMAMLANDI", label: "Tamamlandı", count: showingStale ? undefined : agendaCounts.TAMAMLANDI },
                  { value: "GELMEDI", label: "Gelmedi", count: showingStale ? undefined : agendaCounts.GELMEDI },
                  { value: "IPTAL", label: "İptal", count: showingStale ? undefined : agendaCounts.IPTAL },
                ]}
              />
            </div>
          )}
        />
      );
    }
    if (doctors.length === 0) {
      return (
        <EmptyState
          title="Randevu verilebilecek doktor yok"
          description="Personel ekranında bir doktor ekleyin ya da yöneticinin “Doktor olarak gizle” ayarını kapatın."
          action={canStaffWrite ? <Button size="sm" variant="secondary" href="/personel">Personele git</Button> : undefined}
        />
      );
    }
    if (shownView === "GUN" && dayHours?.isHoliday && dayAppointments.length === 0 && !showingStale) {
      return (
        <EmptyState
          icon={CalendarOff}
          title={`${formatDayLong(date)}: klinik kapalı`}
          description="Çalışma günleri Ayarlar › Çalışma saatleri bölümünden değiştirilir."
          // Randevusu olan kapalı gün de atlanmaz (üstte uyarıyla açılır); ad bu yüzden "açık gün" demez.
          action={<Button size="sm" variant="secondary" onClick={() => void stepDate(1)}>Sonraki güne git</Button>}
        />
      );
    }
    const columns = shownView === "GUN" ? dayColumns : weekColumns;
    return (
      <div className={showingStale ? "opacity-60 transition-opacity" : ""} aria-busy={loading || undefined}>
        <TimeGrid
          columns={columns}
          appointments={showingStale ? [] : appointments}
          blocks={showingStale ? [] : blocks}
          settings={settings}
          doctors={doctors}
          treatments={treatments}
          slotInterval={slotInterval}
          showDoctorOnCard={shownView === "HAFTA" && !doctorId}
          canCreate={permissions.canCreate}
          onOpen={setDetail}
          onCreate={(column, minutes) => openCreate({ dateKey: column.dateKey, doctorId: column.doctorId || doctorId || undefined, minutes })}
          onBlockClick={permissions.canManageBlocks ? (block, column, minutes) => setBlockAction({ block, column, minutes }) : undefined}
          onMove={permissions.canCreate ? (appointment, column, minutes) => void moveAppointment(appointment, column, minutes) : undefined}
        />
      </div>
    );
  };

  return (
    <section className="randevu-page space-y-3">
      <PageHeader
        icon="calendar"
        title="Randevular"
        actions={(
          <>
            {/* Online talebi onaylayamayan rol (ör. doktor) için düğme yalnız
                bekleme listesidir: işlem yapamayacağı talepler sayılmaz. */}
            {canApprove ? (
              <Button
                variant="secondary"
                icon={Inbox}
                count={pendingTotal}
                countTone="warning"
                countLabel="bekleyen talep"
                onClick={() => setPendingTab(counts.onlineRequests > 0 || counts.waitlist === 0 ? "online" : "bekleme")}
              >
                Talepler
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={ListChecks}
                count={counts.waitlist}
                countLabel="bekleme listesindeki hasta"
                onClick={() => setPendingTab("bekleme")}
              >
                Bekleme listesi
              </Button>
            )}
            {permissions.canCreate && <Button icon={Plus} onClick={() => openCreate()}>Yeni randevu</Button>}
          </>
        )}
      />

      {/* Takvim araç çubuğu sayfa zemininde, çerçevesiz (önceden ayrı bir kartta
          beş kontrol yan yanaydı): tarih gezinmesi, görünüm, doktor; seyrek
          işler (Zaman kapat, yazdırma, Excel) satır sonundaki "…" menüsünde. */}
      <Toolbar
        bare
        filters={(
          <DoctorSelect
            size="sm"
            value={doctorId}
            doctors={doctors}
            emptyLabel="Tüm doktorlar"
            aria-label="Doktora göre süz"
            className="sm:w-52"
            onChange={(id) => setDoctorFilter(id)}
          />
        )}
        filterCount={doctorId ? 1 : 0}
        actions={(
          <>
            {/* Önceki günlerden açık kalan randevular: araç çubuğunda sabit yerde
                (önceden sayaç gelince takvimin üstüne bant ekleniyor, ekran bir
                bant boyu aşağı kayıyordu — R4). Telefonda yalnız ikon + sayı. */}
            {counts.openPast > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={ClipboardCheck}
                href="/anasayfa#acik-kalanlar"
                count={counts.openPast}
                countTone="warning"
                countLabel="randevunun durumu işaretlenmedi"
                title={`Önceki günlerden ${counts.openPast} randevunun durumu işaretlenmedi. Durumlarını işaretleyin.`}
              >
                <span className="max-sm:sr-only">Açık kalanlar</span>
              </Button>
            )}
            <ActionMenu label="Takvim işlemleri" items={calendarMenuItems} />
          </>
        )}
      >
        <DateNav date={date} label={navLabel} onStep={(direction) => void stepDate(direction)} onPick={setDate} onToday={() => updateParams({ date: null })} isToday={isTodayInRange} stepLabel={stepLabel} />
        <Tabs
          ariaLabel="Takvim görünümü"
          size="sm"
          value={shownView}
          onChange={setView}
          items={[
            { key: "GUN", label: "Gün" },
            { key: "HAFTA", label: "Hafta" },
            { key: "AY", label: "Ay" },
            { key: "AJANDA", label: "Liste" },
          ]}
        />
      </Toolbar>

      {truncated && !showingStale && (
        <Callout tone="info" compact>Bu aralıkta çok fazla randevu var; liste kısaltıldı. Doktor seçin ya da günü açın.</Callout>
      )}
      {closedDayCount > 0 && (
        <Callout tone="warning" compact>Klinik bu gün kapalı — {closedDayCount} randevu var.</Callout>
      )}
      {shownView !== "AJANDA" && staleNotice}

      {renderContent()}

      {form && (
        <AppointmentFormModal
          mode={form.mode}
          appointment={form.appointment}
          initial={form.initial}
          source={form.source}
          settings={settings}
          doctors={doctors}
          treatments={treatments}
          clinicUnits={clinicUnits}
          slotInterval={slotInterval}
          canSeePhone={permissions.canSeePhone}
          onClose={closeForm}
          onSaved={(result) => void afterSaved(result, form)}
        />
      )}

      {detail && (
        <AppointmentDetailModal
          key={detail.id}
          appointment={detail}
          treatments={treatments}
          permissions={permissions}
          multiBranch={Boolean(settings?.multiBranch)}
          settings={settings}
          waitlistCount={counts.waitlist}
          onOpenWaitlist={() => { setDetail(null); setPendingTab("bekleme"); }}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            if (updated) setAppointments((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            reloadAfterOwnChange();
            void loadCounts();
          }}
          onEdit={(appointment) => { setDetail(null); setForm({ mode: "edit", appointment }); }}
          onNextAppointment={nextAppointmentFor}
        />
      )}

      {blockModalOpen && (
        <BlockTimeModal
          settings={settings}
          doctors={doctors}
          initialDateKey={dateKey}
          initialDoctorId={doctorId}
          slotInterval={slotInterval}
          onClose={() => setBlockModalOpen(false)}
          onChanged={reloadAfterOwnChange}
        />
      )}

      {blockAction && permissions.canManageBlocks && (
        <BlockActionModal
          block={blockAction.block}
          doctorName={doctors.find((doctor) => doctor.id === blockAction.block.doctorId)?.fullName || blockAction.block.doctor?.fullName || "Doktor"}
          slotMinutes={blockAction.minutes}
          slotInterval={slotInterval}
          onClose={() => setBlockAction(null)}
          onChanged={reloadAfterOwnChange}
        />
      )}

      {pendingTab && (
        <PendingRequestsModal
          initialTab={pendingTab}
          doctors={doctors}
          permissions={permissions}
          unlinkedRequests={unlinked}
          onUnlinkedResolved={resolveUnlinked}
          onClose={() => setPendingTab(null)}
          onSchedule={scheduleFromSource}
          onCountsChanged={() => void loadCounts()}
        />
      )}
    </section>
  );
}
