"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarOff, FileSpreadsheet, Inbox, Lock, Plus, Printer, Rows3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { STATUS_ACTION_ICON } from "@/lib/status-actions";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { ActionMenu, type ActionMenuItem } from "@/components/randevu/ActionMenu";
import { DateNav } from "@/components/randevu/DateNav";
import { TimeGrid, type GridColumn } from "@/components/randevu/TimeGrid";
import { MonthGrid, monthGridRange, type MonthDaySummary } from "@/components/randevu/MonthGrid";
import { AgendaList } from "@/components/randevu/AgendaList";
import { AppointmentFormModal, type AppointmentFormInitial, type AppointmentFormSaved } from "@/components/randevu/AppointmentFormModal";
import { AppointmentDetailModal } from "@/components/randevu/AppointmentDetailModal";
import { BlockTimeModal } from "@/components/randevu/BlockTimeModal";
import { BlockActionModal } from "@/components/randevu/BlockActionModal";
import { PendingRequestsModal, type PendingTab } from "@/components/randevu/PendingRequestsModal";
import { useCalendarSettings } from "@/components/randevu/useCalendarSettings";
import { linkBookingRequest, linkWaitlistEntry, saveAppointment } from "@/components/randevu/appointment-api";
import { downloadExcel, printRoomList, printSchedule, type ExportMeta } from "@/components/randevu/randevu-export";
import {
  TR_DAYS_SHORT,
  TR_MONTHS,
  activeCount,
  addDays,
  countByDisplay,
  dateAtMinutes,
  durationMinutes,
  formatClock,
  formatDayLong,
  formatDayShort,
  fromDateKey,
  getDayHours,
  initialsOf,
  parseNoteFull,
  preferredDateKeyOf,
  preferredMinutesOf,
  timeLabel,
  toDateKey,
  type Appointment,
  type AppointmentPermissions,
  type AppointmentSource,
  type DoctorBlock,
} from "@/components/randevu/appointment-utils";

type ViewKey = "GUN" | "HAFTA" | "AY" | "AJANDA";
const VIEW_KEYS: readonly ViewKey[] = ["GUN", "HAFTA", "AY", "AJANDA"];
const ONE_SHOT_PARAMS = ["yeni", "patientId", "patientName", "newPatientId", "newPatientName", "focusAppointmentId"];
const UNLINKED_STORAGE_KEY = "randevu:unlinked-online-requests";

type AgendaFilter = "AKTIF" | "PLANLANDI" | "BEKLIYOR" | "TAMAMLANDI" | "GELMEDI" | "IPTAL";

type FormState = {
  mode: "create" | "edit";
  appointment?: Appointment | null;
  initial?: AppointmentFormInitial;
  source?: AppointmentSource | null;
};

type PendingCounts = { onlineRequests: number; waitlist: number; openPast: number };

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, role } = usePermissions();

  const permissions = useMemo<AppointmentPermissions>(() => ({
    canCreate: can("appointments:write"),
    canDelete: can("appointments:delete"),
    canApprove: can("appointments:approve"),
    canSeePhone: can("patients:phone"),
    canManageBlocks: can("appointments:write") && (role === "YONETICI" || role === "SUPERADMIN"),
  }), [can, role]);

  const { settings, doctors, treatments, clinicUnits, slotInterval, error: settingsError, reload: reloadSettings } = useCalendarSettings();

  // ── Adres çubuğu: görünüm, tarih ve doktor tek gerçek kaynak ────────────
  // Önceden adres yalnız bir kez okunuyor ama değişikliklerde güncellenmiyordu;
  // anasayfadan ?date= ile gelinen takvimde ‹ › okları tarihi geri sarıyordu.
  const rawView = searchParams.get("view");
  const view: ViewKey = VIEW_KEYS.includes(rawView as ViewKey) ? (rawView as ViewKey) : "GUN";
  const dateParam = searchParams.get("date");
  const date = useMemo(() => fromDateKey(dateParam) || fromDateKey(toDateKey(new Date())) || new Date(), [dateParam]);
  const dateKey = toDateKey(date);
  const doctorId = searchParams.get("doctorId") || "";
  const todayKey = toDateKey(new Date());

  const updateParams = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Telefonda varsayılan görünüm liste (ızgara 390 px'e sığmıyor).
  const mobileDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (mobileDefaultAppliedRef.current) return;
    mobileDefaultAppliedRef.current = true;
    if (!rawView && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      updateParams({ view: "AJANDA" });
    }
  }, [rawView, updateParams]);

  const setView = (next: ViewKey) => updateParams({ view: next });
  const setDate = (next: Date) => updateParams({ date: toDateKey(next) === todayKey ? null : toDateKey(next) });
  const setDoctorFilter = (id: string) => updateParams({ doctorId: id || null });

  // ── Aralık ───────────────────────────────────────────────────────────────
  const range = useMemo(() => {
    if (view === "HAFTA") {
      const start = weekStart(date);
      return { start, end: addDays(start, 6) };
    }
    if (view === "AY") return monthGridRange(date);
    return { start: date, end: date };
  }, [date, view]);
  const fromKey = toDateKey(range.start);
  const toKey = toDateKey(range.end);

  // ── Veri ─────────────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<DoctorBlock[]>([]);
  const [monthDays, setMonthDays] = useState<Record<string, MonthDaySummary>>({});
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [counts, setCounts] = useState<PendingCounts>({ onlineRequests: 0, waitlist: 0, openPast: 0 });
  const loadSeqRef = useRef(0);
  const requestKey = `${view === "AY" ? "AY" : "LIST"}|${fromKey}|${toKey}|${doctorId}`;

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      if (view === "AY") {
        const params = new URLSearchParams({ from: fromKey, to: toKey });
        if (doctorId) params.set("doctorId", doctorId);
        const response = await fetch(`/api/appointments/month-summary?${params.toString()}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (seq !== loadSeqRef.current) return;
        if (!response.ok) throw new Error(data?.message || "Aylık görünüm yüklenemedi.");
        setMonthDays(data?.days || {});
        setTruncated(Boolean(data?.truncated));
      } else {
        const start = fromDateKey(fromKey) || new Date();
        const end = fromDateKey(toKey) || new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
        if (doctorId) params.set("doctorId", doctorId);
        const [appointmentsResponse, blocksResponse] = await Promise.all([
          fetch(`/api/appointments?${params.toString()}`, { cache: "no-store" }),
          view === "AJANDA" ? Promise.resolve(null) : fetch(`/api/doctor-blocks?from=${fromKey}&to=${toKey}`, { cache: "no-store" }),
        ]);
        const data = await appointmentsResponse.json().catch(() => null);
        if (seq !== loadSeqRef.current) return;
        if (!appointmentsResponse.ok) throw new Error(data?.message || "Randevular yüklenemedi.");
        setAppointments(Array.isArray(data) ? data : []);
        setTruncated(appointmentsResponse.headers.get("X-Result-Truncated") === "1");
        if (blocksResponse) {
          const blockData = await blocksResponse.json().catch(() => null);
          if (seq !== loadSeqRef.current) return;
          setBlocks(blocksResponse.ok && Array.isArray(blockData) ? blockData : []);
        }
      }
      setLoadError(null);
      setLoadedKey(requestKey);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Randevular yüklenemedi.");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [view, fromKey, toKey, doctorId, requestKey]);

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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadCounts(); }, [loadCounts]);

  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); void loadCounts(); }, 300);
    };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    window.addEventListener("ks:realtime-sync", refresh);
    window.addEventListener("preview-role-change", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      window.removeEventListener("preview-role-change", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, loadCounts]);

  const showingStale = loadedKey !== requestKey;
  const firstLoad = loading && loadedKey === "";

  // ── Pencereler ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockAction, setBlockAction] = useState<{ block: DoctorBlock; column: GridColumn; minutes: number } | null>(null);
  const [pendingTab, setPendingTab] = useState<PendingTab | null>(null);
  const [unlinked, setUnlinked] = useState<Record<string, string>>({});
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>("AKTIF");

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
    if (!hasAny || processedOneShotRef.current === oneShotKey) return;
    processedOneShotRef.current = oneShotKey;
    const patientId = searchParams.get("patientId") || searchParams.get("newPatientId");
    const patientName = searchParams.get("patientName") || searchParams.get("newPatientName");
    const focusId = searchParams.get("focusAppointmentId");
    const wantsForm = searchParams.get("yeni") === "1" || Boolean(patientId);

    const cleanup: Record<string, null> = {};
    for (const key of ONE_SHOT_PARAMS) cleanup[key] = null;
    updateParams(cleanup);

    if (wantsForm && permissions.canCreate) {
      const formDate = dateKey >= todayKey ? dateKey : todayKey;
      if (patientId && patientName) {
        openCreate({ patient: { id: patientId, fullName: patientName }, dateKey: formDate });
      } else if (patientId) {
        fetch(`/api/patients/${encodeURIComponent(patientId)}`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((patient: PickedPatient | null) => {
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
          else showToastSafe({ message: "Randevu bulunamadı; silinmiş veya başka şubeye ait olabilir.", type: "error" });
        })
        .catch(() => undefined);
    }
  }, [oneShotKey, searchParams, updateParams, permissions.canCreate, openCreate, dateKey, todayKey]);

  // ── Kayıt sonrası ────────────────────────────────────────────────────────
  const afterSaved = async (result: AppointmentFormSaved, state: FormState) => {
    setForm(null);
    const warnings: string[] = [];
    if (state.mode === "create" && state.source?.type === "online") {
      const linked = await linkBookingRequest(state.source.request.id, result.appointment.id);
      if (!linked.ok) {
        const next = { ...unlinked, [state.source.request.id]: result.appointment.id };
        setUnlinked(next);
        writeUnlinked(next);
        warnings.push(`Online talep kapanmadı: ${linked.message} “Bekleyenler”den talebi kapatın.`);
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
      duration: warnings.length ? 7000 : 4000,
    });
    // Takvim yeni randevunun gününe gider ki kullanıcı sonucu görsün.
    const savedKey = toDateKey(new Date(result.appointment.startAt));
    if (view !== "AY" && savedKey !== dateKey && !(view === "HAFTA" && savedKey >= fromKey && savedKey <= toKey)) {
      updateParams({ date: savedKey === todayKey ? null : savedKey });
    } else {
      void load();
    }
    void loadCounts();
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
        dateKey: prefKey && prefKey >= todayKey ? prefKey : todayKey,
        minutes: preferredMinutesOf(source.request.preferredFrom),
        note: source.request.note || "",
      }, source);
    } else {
      const prefKey = preferredDateKeyOf(source.entry.preferredFrom);
      openCreate({
        patient: { id: source.entry.patient.id, fullName: source.entry.patient.fullName, phone: source.entry.patient.phone || null },
        doctorId: source.entry.doctor?.id || doctorId || undefined,
        dateKey: prefKey && prefKey >= todayKey ? prefKey : todayKey,
      }, source);
    }
  };

  const nextAppointmentFor = (appointment: Appointment) => {
    setDetail(null);
    const parsed = parseNoteFull(appointment.note, treatments);
    openCreate({
      patient: appointment.patient ? { id: appointment.patient.id, fullName: appointment.patient.fullName, phone: appointment.patient.phone || null, tcNo: appointment.patient.tcNo || null } : null,
      doctorId: appointment.doctor?.id,
      treatment: parsed.treatment,
      dateKey: todayKey,
    });
  };

  // Sürükle-bırak: bırakınca açık onay (önceden saat/doktor sessizce değişiyordu).
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
      message: `${appointment.patient?.fullName || "Hasta"}: ${fromText} → ${toText}${doctorText}. Hastaya otomatik mesaj gitmez.`,
      confirmText: "Taşı",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    const parsed = parseNoteFull(appointment.note, treatments);
    const color = treatments.find((item) => item.value === parsed.treatment)?.color;
    const result = await saveAppointment(`/api/appointments/${appointment.id}`, "PUT", {
      patientId: appointment.patient?.id || "",
      doctorId: targetDoctorId,
      clinicUnitId: appointment.clinicUnit?.id || null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      type: appointment.type || "STANDART",
      status: appointment.status,
      colorCode: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : appointment.colorCode && /^#[0-9a-fA-F]{6}$/.test(appointment.colorCode) ? appointment.colorCode : "#2a9d8f",
      note: appointment.note || "",
    });
    if (!result.ok) {
      if (result.message) showToastSafe({ title: "Randevu taşınamadı", message: result.message, type: "error", duration: 6000 });
      return;
    }
    showToastSafe({ title: "Randevu taşındı", message: `${appointment.patient?.fullName || "Hasta"} · ${toText}`, type: "success", icon: STATUS_ACTION_ICON["appointment-rescheduled"] });
    void load();
  };

  // ── Görünüm verileri ─────────────────────────────────────────────────────
  const visibleDoctors = useMemo(() => (doctorId ? doctors.filter((doctor) => doctor.id === doctorId) : doctors), [doctors, doctorId]);
  const selectedDoctorName = doctorId ? doctors.find((doctor) => doctor.id === doctorId)?.fullName || "Seçili doktor" : "Tüm doktorlar";
  const dayHours = settings ? getDayHours(settings.dailySchedules, date, settings.openingTime, settings.closingTime) : null;
  const dayAppointments = useMemo(() => appointments.filter((item) => toDateKey(new Date(item.startAt)) === dateKey), [appointments, dateKey]);

  const dayColumns = useMemo<GridColumn[]>(() => visibleDoctors.map((doctor) => ({
    key: doctor.id,
    date,
    dateKey,
    doctorId: doctor.id,
    header: (
      <span className="flex items-center justify-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-black text-primary" aria-hidden="true">{initialsOf(doctor.fullName)}</span>
        <span className="truncate">{doctor.fullName}</span>
      </span>
    ),
    headerTitle: doctor.fullName,
    isToday: dateKey === todayKey,
  })), [visibleDoctors, date, dateKey, todayKey]);

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
        isToday: key === todayKey,
        onHeaderClick: () => updateParams({ view: "GUN", date: key === todayKey ? null : key }),
      };
    });
  }, [settings, range.start, appointments, doctorId, todayKey, updateParams]);

  const agendaRows = useMemo(() => {
    if (agendaFilter === "AKTIF") return dayAppointments.filter((item) => item.status !== "IPTAL");
    return dayAppointments.filter((item) => {
      const raw = item.status;
      const display = raw === "GELDI" ? "BEKLIYOR" : raw === "BEKLIYOR" || raw === "ONAYLANDI" ? "PLANLANDI" : raw;
      return display === agendaFilter;
    });
  }, [dayAppointments, agendaFilter]);
  const agendaCounts = useMemo(() => countByDisplay(dayAppointments), [dayAppointments]);

  const rangeAppointments = view === "AY" ? [] : appointments;
  const totalActive = view === "AY"
    ? Object.values(monthDays).reduce((sum, day) => sum + (day.total || 0), 0)
    : activeCount(rangeAppointments);
  const totalCancelled = view === "AY"
    ? Object.values(monthDays).reduce((sum, day) => sum + (day.cancelled || 0), 0)
    : rangeAppointments.length - activeCount(rangeAppointments);

  const navLabel = view === "GUN" || view === "AJANDA"
    ? formatDayLong(date)
    : view === "HAFTA"
      ? `${range.start.getDate()} ${TR_MONTHS[range.start.getMonth()]} – ${range.end.getDate()} ${TR_MONTHS[range.end.getMonth()]} ${range.end.getFullYear()}`
      : `${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const stepLabel = view === "HAFTA" ? "hafta" : view === "AY" ? "ay" : "gün";
  const isTodayInRange = view === "AY"
    ? date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear()
    : todayKey >= fromKey && todayKey <= toKey;

  const stepDate = (direction: -1 | 1) => {
    if (view === "HAFTA") return setDate(addDays(date, 7 * direction));
    if (view === "AY") return setDate(new Date(date.getFullYear(), date.getMonth() + direction, 1, 12));
    // Gün/Liste: kapalı günleri atla (boş "tatil" ekranına düşmesin).
    let next = addDays(date, direction);
    if (settings) {
      for (let guard = 0; guard < 14 && getDayHours(settings.dailySchedules, next).isHoliday; guard += 1) next = addDays(next, direction);
    }
    setDate(next);
  };

  // ── Dışa aktarma ─────────────────────────────────────────────────────────
  const exportMeta = (): ExportMeta => ({
    clinicName: settings?.institutionName || "",
    title: view === "HAFTA" ? `Haftalık randevu çizelgesi · ${navLabel}` : `Günlük randevu çizelgesi · ${formatDayLong(date)}`,
    doctorName: selectedDoctorName,
    fileDateKey: fromKey,
    fileKind: view === "HAFTA" ? "haftalik" : "gunluk",
  });
  const exportRows = view === "HAFTA" ? appointments : dayAppointments;
  const canExport = view !== "AY" && !showingStale;
  const printFailed = () => showToastSafe({ message: "Yazdırma penceresi açılamadı. Tarayıcının açılır pencere iznini kontrol edin.", type: "error" });

  const menuItems: ActionMenuItem[] = [
    ...(permissions.canManageBlocks ? [{ key: "block", label: "Doktorun zamanını kapat", icon: Lock, hint: "İzin, toplantı vb. için randevuyu kapatır", onSelect: () => setBlockModalOpen(true) }] : []),
    { key: "print", label: "Çizelgeyi yazdır", icon: Printer, disabled: !canExport, hint: canExport ? undefined : "Gün, Hafta veya Liste görünümünde", onSelect: () => { if (!printSchedule(exportRows, treatments, exportMeta())) printFailed(); } },
    { key: "excel", label: "Excel olarak indir", icon: FileSpreadsheet, disabled: !canExport, hint: canExport ? undefined : "Gün, Hafta veya Liste görünümünde", onSelect: () => downloadExcel(exportRows, treatments, exportMeta()) },
    { key: "room", label: "Oda listesi yazdır", icon: Rows3, disabled: !(view === "GUN" || view === "AJANDA") || showingStale, hint: "Odalara asılacak sade liste (doktor başına sayfa)", onSelect: () => { if (!printRoomList(dayAppointments, treatments, exportMeta())) printFailed(); } },
  ];

  const pendingTotal = counts.onlineRequests + counts.waitlist;

  // ── İçerik ───────────────────────────────────────────────────────────────
  const renderContent = () => {
    if (settingsError && !settings) {
      return <LoadErrorState message={`${settingsError} Takvim açılamadı.`} onRetry={() => void reloadSettings()} />;
    }
    if (!settings || firstLoad) {
      return <div className="h-[420px] animate-pulse rounded-lg border border-slate-200 bg-slate-50" aria-label="Takvim yükleniyor" role="status" />;
    }
    if (loadError && !loading) {
      return <LoadErrorState message={loadError} onRetry={() => void load()} />;
    }
    if (view === "AY") {
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
    if (view === "AJANDA") {
      return (
        <AgendaList
          appointments={agendaRows}
          treatments={treatments}
          loading={loading && showingStale}
          error={null}
          onRetry={() => void load()}
          canCreate={permissions.canCreate}
          canSeePhone={permissions.canSeePhone}
          hideDoctor={Boolean(doctorId)}
          onOpen={setDetail}
          onChanged={(updated) => { setAppointments((list) => list.map((item) => (item.id === updated.id ? updated : item))); void loadCounts(); }}
          emptyAction={permissions.canCreate && dateKey >= todayKey ? <Button size="sm" icon={Plus} onClick={() => openCreate()}>Yeni randevu</Button> : undefined}
        />
      );
    }
    if (doctors.length === 0) {
      return (
        <EmptyState
          title="Randevu verilebilecek doktor yok"
          description="Personel ekranında bir doktor ekleyin ya da yöneticinin “Doktor olarak gizle” ayarını kapatın."
          action={can("staff:write") ? <Button size="sm" variant="secondary" href="/personel">Personele git</Button> : undefined}
        />
      );
    }
    if (view === "GUN" && dayHours?.isHoliday && dayAppointments.length === 0) {
      return (
        <EmptyState
          icon={CalendarOff}
          title={`${formatDayLong(date)}: klinik kapalı`}
          description="Çalışma günleri Ayarlar > Çalışma saatleri bölümünden değiştirilir."
          action={<Button size="sm" variant="secondary" onClick={() => stepDate(1)}>Sonraki açık güne git</Button>}
        />
      );
    }
    const columns = view === "GUN" ? dayColumns : weekColumns;
    return (
      <div className={showingStale ? "opacity-60 transition-opacity" : ""} aria-busy={loading || undefined}>
        <TimeGrid
          columns={columns}
          appointments={appointments}
          blocks={blocks}
          settings={settings}
          doctors={doctors}
          treatments={treatments}
          slotInterval={slotInterval}
          showDoctorOnCard={view === "HAFTA" && !doctorId}
          canCreate={permissions.canCreate}
          onOpen={setDetail}
          onCreate={(column, minutes) => openCreate({ dateKey: column.dateKey, doctorId: column.doctorId || doctorId || undefined, minutes })}
          onBlockClick={(block, column, minutes) => setBlockAction({ block, column, minutes })}
          onMove={permissions.canCreate ? (appointment, column, minutes) => void moveAppointment(appointment, column, minutes) : undefined}
        />
      </div>
    );
  };

  const stats = loadedKey && !loadError
    ? [
        { label: view === "AY" ? "Bu ay randevu" : view === "HAFTA" ? "Bu hafta randevu" : "Randevu", value: totalActive },
        ...(totalCancelled > 0 ? [{ label: "İptal", value: totalCancelled, color: "text-slate-500" }] : []),
      ]
    : undefined;

  return (
    <section className="randevu-page space-y-3">
      <PageHeader
        icon="calendar"
        title="Randevular"
        stats={stats}
        actions={(
          <>
            <Button variant="secondary" icon={Inbox} onClick={() => setPendingTab(counts.onlineRequests > 0 || counts.waitlist === 0 ? "online" : "bekleme")}>
              Bekleyenler
              {pendingTotal > 0 && <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{pendingTotal}</span>}
            </Button>
            {permissions.canCreate && <Button icon={Plus} onClick={() => openCreate()}>Yeni randevu</Button>}
          </>
        )}
      />

      <Toolbar actions={<ActionMenu label="Diğer" items={menuItems} />}>
        <DateNav date={date} label={navLabel} onStep={stepDate} onPick={setDate} isToday={isTodayInRange} stepLabel={stepLabel} />
        <Tabs
          ariaLabel="Takvim görünümü"
          size="sm"
          value={view}
          onChange={setView}
          items={[
            { key: "GUN", label: "Gün" },
            { key: "HAFTA", label: "Hafta" },
            { key: "AY", label: "Ay" },
            { key: "AJANDA", label: "Liste" },
          ]}
        />
        <DoctorSelect
          size="sm"
          value={doctorId}
          doctors={doctors}
          emptyLabel="Tüm doktorlar"
          aria-label="Doktora göre süz"
          className="sm:w-52"
          onChange={(id) => setDoctorFilter(id)}
        />
        {view === "AJANDA" && (
          <Select size="sm" aria-label="Duruma göre süz" value={agendaFilter} onChange={(event) => setAgendaFilter(event.target.value as AgendaFilter)} className="sm:w-48">
            <option value="AKTIF">Tümü (iptal hariç) · {dayAppointments.length - agendaCounts.IPTAL}</option>
            <option value="PLANLANDI">Planlandı · {agendaCounts.PLANLANDI}</option>
            <option value="BEKLIYOR">Bekliyor (geldi) · {agendaCounts.BEKLIYOR}</option>
            <option value="TAMAMLANDI">Tamamlandı · {agendaCounts.TAMAMLANDI}</option>
            <option value="GELMEDI">Gelmedi · {agendaCounts.GELMEDI}</option>
            <option value="IPTAL">İptal · {agendaCounts.IPTAL}</option>
          </Select>
        )}
      </Toolbar>

      {counts.openPast > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Önceki günlerden durumu işaretlenmemiş {counts.openPast} randevu var (Planlandı/Bekliyor kalmış).
          </span>
          <Button size="sm" variant="secondary" href="/anasayfa#acik-kalanlar">Anasayfada kapat</Button>
        </div>
      )}
      {truncated && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Bu aralıkta çok fazla randevu var; liste kısaltıldı. Doktor seçin ya da günü açın.
        </p>
      )}
      {view === "HAFTA" && !doctorId && (
        <p className="text-xs text-slate-500">Kapalı zamanları ve doktor mesaisini görmek için doktor seçin. Kartlardaki harfler doktorun baş harfleridir.</p>
      )}

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
          onClose={() => setForm(null)}
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
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            if (updated) setAppointments((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            void load();
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
          onChanged={() => void load()}
        />
      )}

      {blockAction && (
        <BlockActionModal
          block={blockAction.block}
          doctorName={doctors.find((doctor) => doctor.id === blockAction.block.doctorId)?.fullName || blockAction.block.doctor?.fullName || "Doktor"}
          slotMinutes={blockAction.minutes}
          slotInterval={slotInterval}
          canManage={permissions.canManageBlocks}
          onClose={() => setBlockAction(null)}
          onChanged={() => void load()}
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
