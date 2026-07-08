"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  type AppointmentTreatmentKey,
  type FollowUpKey,
  APPOINTMENT_TREATMENT_OPTIONS,
  FOLLOW_UP_OPTIONS,
  buildAppointmentNote,
  getFollowUpMeta,
  getTreatmentMeta,
  parseAppointmentNote,
} from "@/lib/appointment-follow-up";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  type: "STANDART" | "KONTROL" | "ACIL";
  status: string;
  note?: string | null;
  colorCode?: string;
  patient?: { id: string; fullName: string };
  doctor?: { id: string; fullName: string };
};

type Staff = { id: string; fullName: string; role: string };
type Patient = { id: string; fullName: string; tcNo?: string; phone?: string };
type UpcomingAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patient?: { id: string; fullName: string; phone?: string | null; tcNo?: string | null };
  doctor?: { id: string; fullName: string };
};

const STATUS_COLORS: Record<string, string> = {
  BEKLIYOR: "bg-yellow-50 border-l-4 border-yellow-400",
  GELDI: "bg-green-50 border-l-4 border-green-500",
  GELMEDI: "bg-red-50 border-l-4 border-red-500",
  IPTAL: "bg-gray-100 border-l-4 border-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor", GELDI: "Geldi", GELMEDI: "Gelmedi", IPTAL: "İptal"
};

function toLocalInput(date: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + z(date.getMonth() + 1) + "-" + z(date.getDate()) + "T" + z(date.getHours()) + ":" + z(date.getMinutes());
}

const TR_DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const TR_DAYS_BY_JS_INDEX = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const HOLIDAY_DAY_TO_INDEX: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  sali: 2,
  "salı": 2,
  carsamba: 3,
  "çarşamba": 3,
  persembe: 4,
  "perşembe": 4,
  cuma: 5,
  cumartesi: 6,
};

function parseTimeToMinutes(value: string, fallback: number): number {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return Math.min(23 * 60 + 59, Math.max(0, h * 60 + m));
}

function toSlotLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

type DaySchedule = {
  day: string;
  isHoliday: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

const SCHEDULE_IDX_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0] as const;

type CalendarSettings = {
  openingTime: string;
  closingTime: string;
  appointmentDuration: number;
  holidayDays: string[];
  dailySchedules: DaySchedule[];
};

  type DoctorBlock = { id: string; doctorId: string; date: string; startTime: string; endTime: string; reason?: string | null; doctor?: { id: string; fullName: string } };

const APPOINTMENT_CREATOR_ROLES = new Set(["DOKTOR", "YONETICI", "ADMIN", "SUPERADMIN"]);

type RandevuCache = {
  appointments?: Appointment[];
  doctorBlocks?: DoctorBlock[];
  staff?: Staff[];
  role?: string;
  canCreate?: boolean;
  settings?: CalendarSettings;
};

function getRandevuCacheKey(rangeFrom: Date, rangeTo: Date, doctorId: string, roleKey: string) {
  return `randevu:data:${roleKey || "anon"}:${rangeFrom.toISOString()}:${rangeTo.toISOString()}:${doctorId || "all"}`;
}

function readRandevuCache(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(cacheKey);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as RandevuCache;
    return {
      appointments: Array.isArray(cached.appointments) ? cached.appointments : [],
      doctorBlocks: Array.isArray(cached.doctorBlocks) ? cached.doctorBlocks : [],
      staff: Array.isArray(cached.staff) ? cached.staff : [],
      role: cached.role || "",
      canCreate: typeof cached.canCreate === "boolean" ? cached.canCreate : false,
      settings: cached.settings || null,
    };
  } catch {
    return null;
  }
}

export default function RandevuPage() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"GUN" | "HAFTA" | "AY" | "AJANDA">("HAFTA");
  const [date, setDate] = useState(() => new Date());
  const [doctorId, setDoctorId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [canCreateAppointments, setCanCreateAppointments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hasta arama (combobox)
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);

  const [newDoctorId, setNewDoctorId] = useState("");
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60000)));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [treatmentKey, setTreatmentKey] = useState<AppointmentTreatmentKey>("MUAYENE");
  const [treatmentQuery, setTreatmentQuery] = useState(getTreatmentMeta("MUAYENE").label);
  const [note, setNote] = useState("");
  const [smsInfo, setSmsInfo] = useState(true);
  const [smsReminder, setSmsReminder] = useState(false);
  const [smsSurvey, setSmsSurvey] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [conflictSuggestions, setConflictSuggestions] = useState<string[]>([]);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpKey>("YOK");
  const [followUpNote, setFollowUpNote] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<"ALL" | "BEKLIYOR" | "GELDI" | "GELMEDI" | "IPTAL">("ALL");
  const [upcomingSearch, setUpcomingSearch] = useState("");
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingResults, setUpcomingResults] = useState<UpcomingAppointment[]>([]);
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [treatmentDropdownOpen, setTreatmentDropdownOpen] = useState(false);
  // Edit modal state
  const [editMode, setEditMode] = useState(false);
  const [editPatientId, setEditPatientId] = useState("");
  const [editPatientSearch, setEditPatientSearch] = useState("");
  const [editPatientResults, setEditPatientResults] = useState<Patient[]>([]);
  const [editPatientLoading, setEditPatientLoading] = useState(false);
  const [editPatientDropdownOpen, setEditPatientDropdownOpen] = useState(false);
  const [editDoctorId, setEditDoctorId] = useState("");
  const [editDoctorQuery, setEditDoctorQuery] = useState("");
  const [editDoctorDropdownOpen, setEditDoctorDropdownOpen] = useState(false);
  const [editStartAt, setEditStartAt] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState(30);
  const [editSaving, setEditSaving] = useState(false);
  // Drag-drop state
  const [draggedApptId, setDraggedApptId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Doctor Block state
  const [doctorBlocks, setDoctorBlocks] = useState<DoctorBlock[]>([]);
  const [focusAppointmentId, setFocusAppointmentId] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockDoctorId, setBlockDoctorId] = useState("");
  const [blockDate, setBlockDate] = useState(() => { const d = new Date(); return d.toISOString().slice(0, 10); });
  const [blockStartTime, setBlockStartTime] = useState("13:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>({
    openingTime: "08:30",
    closingTime: "23:59",
    appointmentDuration: 15,
    holidayDays: ["Pazar"],
    dailySchedules: [],
  });

  const currentRange = useMemo(() => {
    const from = new Date(date);
    const to = new Date(date);
    if (view === "HAFTA") {
      const day = from.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      from.setDate(from.getDate() + diff);
      to.setDate(from.getDate() + 6);
      to.setHours(23, 59, 59, 999);
    } else if (view === "AY") {
      from.setDate(1);
      to.setMonth(from.getMonth() + 1, 0);
      to.setHours(23, 59, 59, 999);
    } else {
      to.setHours(23, 59, 59, 999);
    }
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, [date, view]);

  const initialRandevuCache = useMemo(() => readRandevuCache(getRandevuCacheKey(currentRange.from, currentRange.to, doctorId, currentUserRole)), [currentRange.from, currentRange.to, doctorId, currentUserRole]);

  const isBookableDoctor = useCallback((person: Staff & { profile?: { hideAsDoctor?: boolean } | null; isActive?: boolean }) => {
    if (person.isActive === false) return false;
    if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(person.role)) return true;
    if (person.role === "YONETICI") return !Boolean(person.profile?.hideAsDoctor);
    return false;
  }, []);

  const selectedTreatmentMeta = useMemo(() => getTreatmentMeta(treatmentKey), [treatmentKey]);
  const filteredTreatmentOptions = useMemo(() => {
    const q = treatmentQuery.trim().toLowerCase();
    if (!q) return APPOINTMENT_TREATMENT_OPTIONS;
    return APPOINTMENT_TREATMENT_OPTIONS.filter((item) => item.label.toLowerCase().includes(q));
  }, [treatmentQuery]);

  const filteredDoctorOptions = useMemo(() => {
    const q = doctorQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((item) => item.fullName.toLowerCase().includes(q));
  }, [doctorQuery, staff]);

  const filteredEditDoctorOptions = useMemo(() => {
    const q = editDoctorQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((item) => item.fullName.toLowerCase().includes(q));
  }, [editDoctorQuery, staff]);

  const slotInterval = useMemo(() => {
    const raw = Number(calendarSettings.appointmentDuration) || 15;
    return Math.max(5, Math.min(120, raw));
  }, [calendarSettings.appointmentDuration]);

  // dailySchedules'tan gelen per-day saat bilgilerini JS day index'e göre map'le
  const scheduleByJsDay = useMemo(() => {
    const map = new Map<number, DaySchedule>();
    calendarSettings.dailySchedules.forEach((ds, i) => {
      if (i < SCHEDULE_IDX_TO_JS_DAY.length) map.set(SCHEDULE_IDX_TO_JS_DAY[i], ds);
    });
    return map;
  }, [calendarSettings.dailySchedules]);

  const slotTimes = useMemo(() => {
    let opening: number;
    let closing: number;
    if (scheduleByJsDay.size > 0) {
      // Tatil olmayan günlerin en erken açılışı / en geç kapanışı (HAFTA/AY view için tam aralık)
      const opens: number[] = [];
      const closes: number[] = [];
      scheduleByJsDay.forEach((ds) => {
        if (!ds.isHoliday) {
          opens.push(parseTimeToMinutes(ds.open, 8 * 60 + 30));
          closes.push(parseTimeToMinutes(ds.close, 18 * 60));
        }
      });
      opening = opens.length > 0 ? Math.min(...opens) : parseTimeToMinutes(calendarSettings.openingTime, 8 * 60 + 30);
      closing = closes.length > 0 ? Math.max(...closes) : parseTimeToMinutes(calendarSettings.closingTime, 23 * 60 + 59);
    } else {
      opening = parseTimeToMinutes(calendarSettings.openingTime, 8 * 60 + 30);
      closing = parseTimeToMinutes(calendarSettings.closingTime, 23 * 60 + 59);
    }
    if (closing <= opening) return [toSlotLabel(opening)];
    const slots: string[] = [];
    for (let cursor = opening; cursor + slotInterval <= closing; cursor += slotInterval) {
      slots.push(toSlotLabel(cursor));
    }
    return slots.length > 0 ? slots : [toSlotLabel(opening)];
  }, [scheduleByJsDay, calendarSettings.openingTime, calendarSettings.closingTime, slotInterval]);

  // Gün görünümü: sadece seçili günün çalışma saatlerindeki slotlar
  const gunSlotTimes = useMemo(() => {
    const jsDay = date.getDay();
    const ds = scheduleByJsDay.get(jsDay);
    if (!ds || ds.isHoliday) return slotTimes;
    const opening = parseTimeToMinutes(ds.open, 8 * 60 + 30);
    const closing = parseTimeToMinutes(ds.close, 18 * 60);
    if (closing <= opening) return [toSlotLabel(opening)];
    const slots: string[] = [];
    for (let cursor = opening; cursor + slotInterval <= closing; cursor += slotInterval) {
      slots.push(toSlotLabel(cursor));
    }
    return slots.length > 0 ? slots : [toSlotLabel(opening)];
  }, [date, scheduleByJsDay, slotTimes, slotInterval]);

  const durationOptions = useMemo(() => {
    const candidates = [1, 2, 3, 4, 6, 8]
      .map((multiplier) => multiplier * slotInterval)
      .filter((value) => value <= 240);
    if (!candidates.includes(durationMinutes)) candidates.push(durationMinutes);
    return Array.from(new Set(candidates)).sort((a, b) => a - b);
  }, [durationMinutes, slotInterval]);

  const workingDayIndexes = useMemo(() => {
    if (scheduleByJsDay.size > 0) {
      const active = new Set<number>();
      scheduleByJsDay.forEach((ds, jsDay) => { if (!ds.isHoliday) active.add(jsDay); });
      return active.size > 0 ? active : new Set([1, 2, 3, 4, 5]);
    }
    // eski holidayDays fallback
    const holidaySet = new Set(
      (calendarSettings.holidayDays || [])
        .map((day) => HOLIDAY_DAY_TO_INDEX[String(day).toLocaleLowerCase("tr-TR")])
        .filter((v): v is number => typeof v === "number")
    );
    const active = new Set([0, 1, 2, 3, 4, 5, 6].filter((idx) => !holidaySet.has(idx)));
    return active.size > 0 ? active : new Set([1, 2, 3, 4, 5, 6]);
  }, [scheduleByJsDay, calendarSettings.holidayDays]);

  const resolveTreatmentKey = useCallback((query: string): AppointmentTreatmentKey => {
    const q = query.trim().toLowerCase();
    if (!q) return "MUAYENE";
    const exact = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase() === q);
    if (exact) return exact.value;
    const included = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase().includes(q));
    return included?.value || "DIGER";
  }, []);

  const getEffectiveRole = useCallback(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("dev-preview-role") || "";
  }, []);

  useEffect(() => {
    const qpView = searchParams.get("view");
    if ((qpView === "GUN" || qpView === "HAFTA" || qpView === "AY" || qpView === "AJANDA") && qpView !== view) {
      setView(qpView);
    }

    const qpDate = searchParams.get("date");
    if (qpDate && /^\d{4}-\d{2}-\d{2}$/.test(qpDate)) {
      const [y, m, d] = qpDate.split("-").map(Number);
      const local = new Date(y, m - 1, d, 12, 0, 0, 0);
      if (!Number.isNaN(local.getTime()) && local.getTime() !== date.getTime()) setDate(local);
    }

    const qpDoctorId = searchParams.get("doctorId");
    if (qpDoctorId && qpDoctorId !== doctorId) setDoctorId(qpDoctorId);

    const qpFocusAppointmentId = searchParams.get("focusAppointmentId");
    if (qpFocusAppointmentId && qpFocusAppointmentId !== focusAppointmentId) setFocusAppointmentId(qpFocusAppointmentId);
  }, [searchParams, view, date, doctorId, focusAppointmentId]);

  useEffect(() => {
    if (initialRandevuCache) {
      setAppointments(initialRandevuCache.appointments);
      setDoctorBlocks(initialRandevuCache.doctorBlocks);
      setStaff(initialRandevuCache.staff);
      if (initialRandevuCache.settings) {
        setCalendarSettings(initialRandevuCache.settings);
      }
      setLoading(false);
    }
  }, [initialRandevuCache]);

  // Hasta arama debounce
  useEffect(() => {
    if (patientSearch.trim().length < 2) { setPatientResults([]); return; }
    const t = setTimeout(async () => {
      setPatientSearchLoading(true);
      try {
        const res = await fetch("/api/patients?q=" + encodeURIComponent(patientSearch.trim()) + "&take=10");
        const data = await res.json();
        setPatientResults(Array.isArray(data.patients) ? data.patients : []);
      } finally { setPatientSearchLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [patientSearch]);

  useEffect(() => {
    if (upcomingSearch.trim().length < 2) {
      setUpcomingResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setUpcomingLoading(true);
      try {
        const res = await fetch("/api/appointments/upcoming?q=" + encodeURIComponent(upcomingSearch.trim()) + "&take=20", { cache: "no-store" });
        const json = await res.json();
        setUpcomingResults(Array.isArray(json?.appointments) ? json.appointments : []);
      } catch {
        setUpcomingResults([]);
      } finally {
        setUpcomingLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [upcomingSearch]);

  useEffect(() => {
    if (editPatientSearch.trim().length < 2) { setEditPatientResults([]); return; }
    const t = setTimeout(async () => {
      setEditPatientLoading(true);
      try {
        const res = await fetch("/api/patients?q=" + encodeURIComponent(editPatientSearch.trim()) + "&take=10");
        const data = await res.json();
        setEditPatientResults(Array.isArray(data.patients) ? data.patients : []);
      } finally { setEditPatientLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [editPatientSearch]);

  const load = useCallback(async () => {
    const cacheKey = getRandevuCacheKey(currentRange.from, currentRange.to, doctorId, currentUserRole);
    let hadCached = false;
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        try {
          const cached = JSON.parse(raw) as {
            appointments?: Appointment[];
            doctorBlocks?: DoctorBlock[];
            staff?: Staff[];
            role?: string;
            canCreate?: boolean;
            settings?: CalendarSettings;
          };
          if (Array.isArray(cached.appointments)) {
            setAppointments(cached.appointments);
            hadCached = true;
          }
          if (Array.isArray(cached.doctorBlocks)) setDoctorBlocks(cached.doctorBlocks);
          if (Array.isArray(cached.staff) && cached.staff.length > 0) setStaff(cached.staff);
          if (cached.role) setCurrentUserRole(cached.role);
          if (typeof cached.canCreate === "boolean") setCanCreateAppointments(cached.canCreate);
          if (cached.settings) setCalendarSettings(cached.settings);
        } catch {}
      }
    }

    setLoading(!hadCached); setError(null);
    try {
      const params = new URLSearchParams({ from: currentRange.from.toISOString(), to: currentRange.to.toISOString() });
      if (doctorId) params.set("doctorId", doctorId);
      // Format range dates as YYYY-MM-DD for doctor-blocks
      const fromDate = currentRange.from.toISOString().slice(0, 10);
      const toDate = currentRange.to.toISOString().slice(0, 10);

      const [appointmentsRes, meRes] = await Promise.all([
        fetch("/api/appointments?" + params.toString(), { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      const [aJson, meJson] = await Promise.all([appointmentsRes.json(), meRes.json()]);
      const resolvedAppointments = Array.isArray(aJson) ? aJson : [];
      setAppointments(resolvedAppointments);

      const role = getEffectiveRole() || meJson?.role || "";
      setCurrentUserRole(role);
      setCanCreateAppointments(APPOINTMENT_CREATOR_ROLES.has(role));

      void Promise.allSettled([
        fetch("/api/staff?booking=1", { cache: "no-store" })
          .then((r) => r.json())
          .then((sJson) => {
            const staffList = Array.isArray(sJson) ? sJson : (sJson?.staff || []);
            const filteredStaff = staffList.filter((x: Staff & { profile?: { hideAsDoctor?: boolean } | null; isActive?: boolean }) => isBookableDoctor(x));
            setStaff(filteredStaff);
          })
          .catch(() => {}),
        fetch("/api/settings", { cache: "no-store" })
          .then((r) => r.json())
          .then((settingsJson) => {
            const parsedHolidayDays = (() => {
              const raw = settingsJson?.holidayDays;
              if (Array.isArray(raw)) return raw;
              if (typeof raw === "string") {
                try {
                  const parsed = JSON.parse(raw);
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              }
              return [];
            })();

            const parsedDailySchedules = (() => {
              const raw = settingsJson?.dailySchedules;
              if (Array.isArray(raw)) return raw as DaySchedule[];
              if (typeof raw === "string") {
                try { const p = JSON.parse(raw); return Array.isArray(p) ? p as DaySchedule[] : []; } catch { return []; }
              }
              return [];
            })();

            const resolvedSettings: CalendarSettings = {
              openingTime: settingsJson?.openingTime || "08:30",
              closingTime: settingsJson?.closingTime || "23:59",
              appointmentDuration: Number(settingsJson?.appointmentDuration || settingsJson?.appointmentDurationMin || 15),
              holidayDays: parsedHolidayDays,
              dailySchedules: parsedDailySchedules,
            };
            setCalendarSettings(resolvedSettings);
          })
          .catch(() => {}),
        fetch(`/api/doctor-blocks?from=${fromDate}&to=${toDate}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((blocksJson) => {
            const resolvedBlocks = Array.isArray(blocksJson) ? blocksJson : [];
            setDoctorBlocks(resolvedBlocks);
          })
          .catch(() => {}),
      ]);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally { setLoading(false); }
  }, [currentUserRole, doctorId, isBookableDoctor, currentRange.from, currentRange.to]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const syncPreviewRole = () => {
      const activeRole = getEffectiveRole();
      if (activeRole) setCurrentUserRole(activeRole);
      void load();
    };

    window.addEventListener("preview-role-change", syncPreviewRole);
    return () => window.removeEventListener("preview-role-change", syncPreviewRole);
  }, [getEffectiveRole, load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 300);
    };

    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [load]);

  useEffect(() => {
    if (!focusAppointmentId) return;
    const found = appointments.find((a) => a.id === focusAppointmentId);
    if (found) {
      setSelectedAppt(found);
      setFocusAppointmentId(null);
    }
  }, [appointments, focusAppointmentId]);

  useEffect(() => {
    if (!selectedAppt) return;
    const parsed = parseAppointmentNote(selectedAppt.note);
    setFollowUpStatus(parsed.followUp);
    setFollowUpNote(parsed.detail);
  }, [selectedAppt]);

  useEffect(() => { setEditMode(false); setError(null); }, [selectedAppt?.id]);

  useEffect(() => {
    if (!newDoctorId) return;
    const selectedDoctor = staff.find((item) => item.id === newDoctorId);
    if (selectedDoctor) setDoctorQuery(selectedDoctor.fullName);
  }, [newDoctorId, staff]);

  const resetForm = () => {
    setPatientId(""); setPatientSearch(""); setPatientResults([]); setPatientDropdownOpen(false);
    setNewDoctorId(""); setNote(""); setConflictWarning(null); setConflictSuggestions([]); setTreatmentKey("MUAYENE");
    setTreatmentQuery(getTreatmentMeta("MUAYENE").label);
    setDoctorQuery(""); setDoctorDropdownOpen(false); setTreatmentDropdownOpen(false);
    setDurationMinutes(slotInterval);
  };

  const closeAppointmentModal = useCallback(() => {
    setEditMode(false);
    setError(null);
    setFollowUpStatus("YOK");
    setFollowUpNote("");
    setEditPatientResults([]);
    setEditPatientDropdownOpen(false);
    setEditDoctorDropdownOpen(false);
    setSelectedAppt(null);
  }, []);

  const createAppointment = async () => {
    if (!canCreateAppointments) {
      setError("Bu görünümde randevu oluşturma yetkiniz yok.");
      return;
    }
    if (!patientId || !newDoctorId) return setError("Hasta ve doktor seçin");
    const resolvedTreatmentKey = resolveTreatmentKey(treatmentQuery);
    const resolvedTreatmentMeta = getTreatmentMeta(resolvedTreatmentKey);
    setTreatmentKey(resolvedTreatmentKey);
    setTreatmentQuery(resolvedTreatmentMeta.label);
    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) {
      setError("Başlangıç tarih ve saatini doğru girin");
      return;
    }
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);
    setSaving(true); setError(null);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        doctorId: newDoctorId,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        type: "STANDART",
        colorCode: resolvedTreatmentMeta.color,
        note: buildAppointmentNote("YOK", note, resolvedTreatmentKey),
        smsInfo,
        smsReminder,
        smsSurvey,
      })
    });
    setSaving(false);
    if (!res.ok) { const b = await res.json().catch(() => ({ message: "Kaydedilemedi" })); setError(b.message || "Kaydedilemedi"); return; }
    setShowForm(false); resetForm();
    await load();
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch("/api/appointments/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Durum güncellenemedi" }));
      setError(body.message || "Durum güncellenemedi");
      return;
    }
    setSelectedAppt(prev => prev && prev.id === id ? { ...prev, status } : prev);
    await load();
  };

  const saveAppointmentFollowUp = async () => {
    if (!selectedAppt) return;
    setDetailSaving(true);
    const parsed = parseAppointmentNote(selectedAppt.note);
    const nextNote = buildAppointmentNote(followUpStatus, followUpNote, parsed.treatment);
    const res = await fetch("/api/appointments/" + selectedAppt.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: nextNote })
    });
    setDetailSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Randevu notu kaydedilemedi" }));
      setError(body.message || "Randevu notu kaydedilemedi");
      return;
    }
    setSelectedAppt(prev => prev ? { ...prev, note: nextNote } : prev);
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Randevu silinsin mi?")) return;
    const res = await fetch("/api/appointments/" + id, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Randevu silinemedi" }));
      setError(body.message || "Randevu silinemedi");
      return;
    }
    setSelectedAppt(null);
    await load();
  };

  const openEditMode = () => {
    if (!selectedAppt) return;
    setEditPatientId(selectedAppt.patient?.id || "");
    setEditPatientSearch(selectedAppt.patient?.fullName || "");
    setEditPatientResults([]);
    setEditPatientDropdownOpen(false);
    setEditDoctorId(selectedAppt.doctor?.id || "");
    setEditDoctorQuery(selectedAppt.doctor?.fullName || "");
    setEditDoctorDropdownOpen(false);
    const startDate = new Date(selectedAppt.startAt);
    const endDate = new Date(selectedAppt.endAt);
    const dur = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    setEditStartAt(toLocalInput(startDate));
    setEditDurationMinutes(dur > 0 ? dur : slotInterval);
    setEditMode(true);
  };

  const updateAppointment = async () => {
    if (!selectedAppt || !editPatientId || !editDoctorId) {
      setError("Hasta ve doktor zorunludur.");
      return;
    }
    const startDate = new Date(editStartAt);
    if (Number.isNaN(startDate.getTime())) { setError("Geçerli bir başlangıç tarihi/saati girin."); return; }
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + editDurationMinutes);
    const parsed = parseAppointmentNote(selectedAppt.note);
    const treatmentMeta = getTreatmentMeta(parsed.treatment);
    setEditSaving(true); setError(null);
    const res = await fetch("/api/appointments/" + selectedAppt.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: editPatientId,
        doctorId: editDoctorId,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        type: selectedAppt.type,
        status: selectedAppt.status,
        colorCode: treatmentMeta.color || selectedAppt.colorCode || "#2a9d8f",
        note: selectedAppt.note || "",
        smsInfo: false,
        smsReminder: false,
        smsSurvey: false,
      })
    });
    setEditSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Güncelleme başarısız" }));
      setError(body.message || "Güncelleme başarısız");
      return;
    }
    setEditMode(false);
    setSelectedAppt(null);
    await load();
  };

  const handleDropOnSlot = async (newDate: Date, slotTime: string, newDocId?: string) => {
    if (!draggedApptId) return;
    const appt = appointments.find(a => a.id === draggedApptId);
    if (!appt) return;
    const [h, m] = slotTime.split(":").map(Number);
    const newStart = new Date(newDate);
    newStart.setHours(h, m, 0, 0);
    const origStart = new Date(appt.startAt);
    const origEnd = new Date(appt.endAt);
    if (newStart.getTime() === origStart.getTime() && (!newDocId || newDocId === appt.doctor?.id)) {
      setDraggedApptId(null); setDragOverKey(null); return;
    }
    const dur = Math.round((origEnd.getTime() - origStart.getTime()) / 60000) || slotInterval;
    const newEnd = new Date(newStart);
    newEnd.setMinutes(newEnd.getMinutes() + dur);
    const parsed = parseAppointmentNote(appt.note);
    const treatmentMeta = getTreatmentMeta(parsed.treatment);
    const res = await fetch("/api/appointments/" + draggedApptId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: appt.patient?.id || "",
        doctorId: newDocId || appt.doctor?.id || "",
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        type: appt.type,
        status: appt.status,
        colorCode: treatmentMeta.color || appt.colorCode || "#2a9d8f",
        note: appt.note || "",
        smsInfo: false,
        smsReminder: false,
        smsSurvey: false,
      })
    });
    setDraggedApptId(null); setDragOverKey(null);
    if (res.ok) await load();
    else { const body = await res.json().catch(() => ({ message: "Güncelleme başarısız" })); setError(body.message || "Güncelleme başarısız"); }
  };

  const weekDays = useMemo(() => {
    if (view !== "HAFTA") return [];
    const allDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentRange.from);
      d.setDate(currentRange.from.getDate() + i);
      return d;
    });
    const visible = allDays.filter((d) => workingDayIndexes.has(d.getDay()));
    return visible.length > 0 ? visible : allDays;
  }, [view, currentRange.from, workingDayIndexes]);

  const monthDays = useMemo(() => {
    if (view !== "AY") return [];
    const days: Date[] = [];
    const cur = new Date(currentRange.from);
    while (cur <= currentRange.to) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
  }, [view, currentRange.from, currentRange.to]);

  const getApptForSlot = (docId: string | null, slotTime: string, forDate?: Date) => {
    return appointments.filter(a => {
      if (a.status === "IPTAL") return false;
      if (docId && a.doctor?.id !== docId) return false;
      const d = new Date(a.startAt);
      if (forDate && (d.getFullYear() !== forDate.getFullYear() || d.getMonth() !== forDate.getMonth() || d.getDate() !== forDate.getDate())) return false;
      return (String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0")) === slotTime;
    });
  };

  const getApptForDay = (d: Date) => appointments.filter(a => {
    if (a.status === "IPTAL") return false;
    const ad = new Date(a.startAt);
    return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth() && ad.getDate() === d.getDate();
  });

  const navLabel = () => {
    if (view === "GUN") return date.getDate() + " " + TR_MONTHS[date.getMonth()] + " " + date.getFullYear();
    if (view === "HAFTA") { const e = new Date(currentRange.from); e.setDate(e.getDate() + 6); return currentRange.from.getDate() + " " + TR_MONTHS[currentRange.from.getMonth()] + " - " + e.getDate() + " " + TR_MONTHS[e.getMonth()] + " " + date.getFullYear(); }
    return TR_MONTHS[date.getMonth()] + " " + date.getFullYear();
  };

  const nav = (dir: number) => {
    const d = new Date(date);
    if (view === "GUN" || view === "AJANDA") d.setDate(d.getDate() + dir);
    else if (view === "HAFTA") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setDate(d);
  };

  const buildConflictInfo = useCallback((targetStartAt: string, targetDoctorId: string, targetDurationMinutes: number) => {
    if (!targetDoctorId || !targetStartAt) return { warning: null as string | null, suggestions: [] as string[] };
    const start = new Date(targetStartAt);
    if (Number.isNaN(start.getTime())) return { warning: null as string | null, suggestions: [] as string[] };
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + targetDurationMinutes);

    const dayAppointments = appointments.filter((appt) => {
      if (appt.doctor?.id !== targetDoctorId) return false;
      if (appt.status === "IPTAL" || appt.status === "GELMEDI") return false;
      const ad = new Date(appt.startAt);
      return ad.getFullYear() === start.getFullYear() && ad.getMonth() === start.getMonth() && ad.getDate() === start.getDate();
    });

    const overlaps = dayAppointments.filter((appt) => {
      const apptStart = new Date(appt.startAt);
      const apptEnd = new Date(appt.endAt);
      return apptStart < end && apptEnd > start;
    });

    const slotTime = String(start.getHours()).padStart(2, "0") + ":" + String(start.getMinutes()).padStart(2, "0");
    const warning = overlaps.length > 0
      ? `Bu aralıkta (${slotTime}, ${targetDurationMinutes} dk) ${overlaps.length} çakışan randevu var: ${overlaps.map((a) => a.patient?.fullName || "Hasta").join(", ")}.`
      : null;

    const candidates: { slot: string; distance: number }[] = [];
    slotTimes.forEach((slot) => {
      const [h, m] = slot.split(":").map(Number);
      const candidateStart = new Date(start);
      candidateStart.setHours(h, m, 0, 0);
      const candidateEnd = new Date(candidateStart);
      candidateEnd.setMinutes(candidateEnd.getMinutes() + targetDurationMinutes);

      const occupied = dayAppointments.some((appt) => {
        const apptStart = new Date(appt.startAt);
        const apptEnd = new Date(appt.endAt);
        return apptStart < candidateEnd && apptEnd > candidateStart;
      });

      if (!occupied) {
        const distance = Math.abs(candidateStart.getTime() - start.getTime()) / (1000 * 60);
        candidates.push({ slot, distance });
      }
    });

    candidates.sort((a, b) => a.distance - b.distance);
    const suggestions = candidates.slice(0, 3).map(c => c.slot);

    return { warning, suggestions };
  }, [appointments, slotTimes]);

  const openQuickCreate = (slotTime: string, forDate: Date, slotDoctorId?: string) => {
    if (!canCreateAppointments) return;
    const [h, m] = slotTime.split(":").map(Number);
    const start = new Date(forDate);
    start.setHours(h, m, 0, 0);
    const docId = slotDoctorId || doctorId || null;
    const conflict = buildConflictInfo(start.toISOString(), docId || "", slotInterval);
    setConflictWarning(conflict.warning ? `${conflict.warning} Yine de ekleyebilirsiniz.` : null);
    setConflictSuggestions(conflict.suggestions);

    setStartAt(toLocalInput(start));
    setDurationMinutes(slotInterval);
    setNewDoctorId(docId || "");
    const quickDoctor = staff.find((item) => item.id === (docId || ""));
    setDoctorQuery(quickDoctor?.fullName || "");
    setDoctorDropdownOpen(false);
    setShowForm(true);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showForm || !newDoctorId || !startAt) return;
    const conflict = buildConflictInfo(new Date(startAt).toISOString(), newDoctorId, durationMinutes);
    setConflictWarning(conflict.warning ? `${conflict.warning} Yine de ekleyebilirsiniz.` : null);
    setConflictSuggestions(conflict.suggestions);
  }, [showForm, startAt, newDoctorId, durationMinutes, appointments]);

  const doctors = doctorId ? staff.filter(s => s.id === doctorId) : staff;

  const canExportOrPrint = view === "GUN" || view === "HAFTA";
  const reportTitle = view === "GUN"
    ? `Gunluk Randevu Cizelgesi - ${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : (() => {
        const end = new Date(currentRange.from);
        end.setDate(end.getDate() + 6);
        return `Haftalik Randevu Cizelgesi - ${currentRange.from.getDate()} ${TR_MONTHS[currentRange.from.getMonth()]} - ${end.getDate()} ${TR_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
      })();

  const reportRows = useMemo(() => {
    return [...appointments]
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .map((a) => {
        const parsed = parseAppointmentNote(a.note);
        const treatment = getTreatmentMeta(parsed.treatment).label;
        const start = new Date(a.startAt);
        const end = new Date(a.endAt);
        const duration = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
        return {
          tarih: start.toLocaleDateString("tr-TR"),
          saat: start.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
          sure: `${duration} dk`,
          hasta: a.patient?.fullName || "-",
          doktor: a.doctor?.fullName || "-",
          tedavi: treatment,
          durum: STATUS_LABELS[a.status] || a.status,
          not: parsed.detail || "",
        };
      });
  }, [appointments]);

  const downloadExcelReport = () => {
    if (!canExportOrPrint) {
      setError("Excel dışa aktarma sadece Gün veya Hafta görünümünde kullanılabilir.");
      return;
    }
    const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

    const statusStyle: Record<string, string> = {
      BEKLIYOR: "background:#FEF3C7;color:#92400E;font-weight:600;",
      GELDI:    "background:#D1FAE5;color:#065F46;font-weight:600;",
      GELMEDI:  "background:#FEE2E2;color:#991B1B;font-weight:600;",
      IPTAL:    "background:#F1F5F9;color:#475569;font-weight:600;",
    };

    const now = new Date();
    const statusCounts = { BEKLIYOR: 0, GELDI: 0, GELMEDI: 0, IPTAL: 0 };
    appointments.forEach((a) => { if (a.status in statusCounts) (statusCounts as Record<string, number>)[a.status]++; });

    const doctor = doctorId ? (staff.find((s) => s.id === doctorId)?.fullName || "Tüm Doktorlar") : "Tüm Doktorlar";

    const dataRows = reportRows.map((r, i) => {
      const rawStatus = appointments.find(
        (a) => a.patient?.fullName === r.hasta &&
               new Date(a.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) === r.saat
      )?.status || "";
      const sStyle = statusStyle[rawStatus] || "";
      const rowBg = i % 2 === 0 ? "background:#F8FAFC;" : "background:#FFFFFF;";
      return `<tr style="${rowBg}font-size:12px;">
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#374151;">${esc(r.tarih)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#374151;font-weight:600;">${esc(r.saat)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#6B7280;text-align:center;">${esc(r.sure)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#111827;font-weight:600;">${esc(r.hasta)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#374151;">${esc(r.doktor)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#374151;">${esc(r.tedavi)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;${sStyle}">${esc(r.durum)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;color:#6B7280;font-size:11px;">${esc(r.not)}</td>
      </tr>`;
    }).join("");

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; }
  td, th { mso-number-format: "@"; }
</style>
</head>
<body>
<table style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;">
  <tr>
    <td colspan="8" style="background:#1E3A5F;color:#FFFFFF;font-size:18px;font-weight:700;padding:14px 16px;border:none;letter-spacing:0.5px;">
      KlinikModern — Randevu Çizelgesi
    </td>
  </tr>
  <tr>
    <td colspan="4" style="background:#F0F4F8;padding:8px 16px;font-size:12px;color:#374151;border:1px solid #E2E8F0;">
      <b>Rapor:</b> ${esc(reportTitle)}
    </td>
    <td colspan="2" style="background:#F0F4F8;padding:8px 16px;font-size:12px;color:#374151;border:1px solid #E2E8F0;">
      <b>Doktor:</b> ${esc(doctor)}
    </td>
    <td colspan="2" style="background:#F0F4F8;padding:8px 16px;font-size:12px;color:#374151;border:1px solid #E2E8F0;">
      <b>Oluşturma:</b> ${now.toLocaleString("tr-TR")}
    </td>
  </tr>
  <tr>
    <td colspan="2" style="background:#EEF2FF;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#3730A3;">
      Toplam: <b>${reportRows.length}</b>
    </td>
    <td colspan="2" style="background:#FEF3C7;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#92400E;">
      Bekliyor: <b>${statusCounts.BEKLIYOR}</b>
    </td>
    <td colspan="2" style="background:#D1FAE5;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#065F46;">
      Geldi: <b>${statusCounts.GELDI}</b>
    </td>
    <td style="background:#FEE2E2;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#991B1B;">
      Gelmedi: <b>${statusCounts.GELMEDI}</b>
    </td>
    <td style="background:#F1F5F9;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#475569;">
      İptal: <b>${statusCounts.IPTAL}</b>
    </td>
  </tr>
  <tr style="height:8px;"><td colspan="8" style="border:none;background:#FFFFFF;"></td></tr>
  <tr style="background:#1E3A5F;">
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Tarih</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Saat</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:center;white-space:nowrap;">Süre</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Hasta</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Doktor</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Tedavi</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Durum</th>
    <th style="border:1px solid #2D4F7C;padding:9px 12px;color:#FFFFFF;font-size:12px;font-weight:700;text-align:left;white-space:nowrap;">Not</th>
  </tr>
  ${dataRows || `<tr><td colspan="8" style="text-align:center;padding:16px;color:#6B7280;font-style:italic;">Kayıt bulunamadı</td></tr>`}
  <tr style="height:12px;"><td colspan="8" style="border:none;background:#FFFFFF;"></td></tr>
  <tr>
    <td colspan="8" style="padding:8px 16px;font-size:11px;color:#9CA3AF;font-style:italic;border-top:2px solid #E2E8F0;">
      Bu çizelge KlinikModern üzerinden ${now.toLocaleString("tr-TR")} tarihinde oluşturulmuştur.
    </td>
  </tr>
</table>
</body>
</html>`;

    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const dy = String(now.getDate()).padStart(2, "0");
    anchor.href = url;
    anchor.download = `randevu-${view === "GUN" ? "gunluk" : "haftalik"}-${y}${mo}${dy}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!canExportOrPrint) {
      setError("Yazdırma sadece Gün veya Hafta görünümünde kullanılabilir.");
      return;
    }
    const esc = (v: string) =>
      v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

    const now = new Date();
    const doctor = doctorId ? (staff.find((s) => s.id === doctorId)?.fullName || "Tüm Doktorlar") : "Tüm Doktorlar";

    const statusStyle: Record<string, string> = {
      BEKLIYOR: "background:#FEF3C7;color:#92400E;",
      GELDI:    "background:#D1FAE5;color:#065F46;",
      GELMEDI:  "background:#FEE2E2;color:#991B1B;",
      IPTAL:    "background:#F1F5F9;color:#475569;",
    };

    const statusCounts = { BEKLIYOR: 0, GELDI: 0, GELMEDI: 0, IPTAL: 0 };
    appointments.forEach((a) => { if (a.status in statusCounts) (statusCounts as Record<string, number>)[a.status]++; });

    const rowsHtml = reportRows.length
      ? reportRows.map((r, i) => {
          const rawStatus = appointments.find(
            (a) => a.patient?.fullName === r.hasta &&
                   new Date(a.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) === r.saat
          )?.status || "";
          const sStyle = statusStyle[rawStatus] || "";
          const rowBg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
          return `<tr style="background:${rowBg};">
            <td class="td">${esc(r.tarih)}</td>
            <td class="td td-bold">${esc(r.saat)}</td>
            <td class="td td-center">${esc(r.sure)}</td>
            <td class="td td-name">${esc(r.hasta)}</td>
            <td class="td">${esc(r.doktor)}</td>
            <td class="td">${esc(r.tedavi)}</td>
            <td class="td"><span class="badge" style="${sStyle}">${esc(r.durum)}</span></td>
            <td class="td td-note">${esc(r.not)}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="8" class="empty-row">Kayıt bulunamadı</td></tr>`;

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      setError("Yazdırma penceresi açılamadı. Tarayıcı popup iznini kontrol edin.");
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${esc(reportTitle)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #0F172A; font-size: 12px; }
    .page { padding: 20mm 18mm 16mm 18mm; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1E3A5F; margin-bottom: 14px; }
    .logo-area { display: flex; flex-direction: column; }
    .logo-name { font-size: 22px; font-weight: 800; color: #1E3A5F; letter-spacing: -0.5px; }
    .logo-sub { font-size: 11px; color: #64748B; margin-top: 2px; }
    .header-right { text-align: right; }
    .report-title { font-size: 14px; font-weight: 700; color: #1E3A5F; }
    .report-meta { font-size: 11px; color: #64748B; margin-top: 4px; line-height: 1.6; }
    /* Stats */
    .stats { display: flex; gap: 10px; margin-bottom: 14px; }
    .stat-box { flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid; }
    .stat-total { background: #EEF2FF; border-color: #C7D2FE; color: #3730A3; }
    .stat-bek   { background: #FEF3C7; border-color: #FDE68A; color: #92400E; }
    .stat-gel   { background: #D1FAE5; border-color: #A7F3D0; color: #065F46; }
    .stat-gel2  { background: #FEE2E2; border-color: #FECACA; color: #991B1B; }
    .stat-iptal { background: #F1F5F9; border-color: #CBD5E1; color: #475569; }
    .stat-num  { font-size: 20px; font-weight: 800; }
    .stat-lbl  { font-size: 10px; margin-top: 1px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    /* Table */
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    thead tr { background: #1E3A5F; color: #FFFFFF; }
    th { padding: 9px 10px; text-align: left; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; border: 1px solid #2D4F7C; white-space: nowrap; }
    .td { border: 1px solid #E2E8F0; padding: 7px 10px; vertical-align: middle; color: #374151; }
    .td-bold { font-weight: 700; color: #111827; }
    .td-center { text-align: center; color: #6B7280; }
    .td-name { font-weight: 600; color: #111827; }
    .td-note { color: #6B7280; font-size: 11px; max-width: 160px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; }
    .empty-row { text-align: center; padding: 24px; color: #94A3B8; font-style: italic; border: 1px solid #E2E8F0; }
    /* Footer */
    .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; }
    @media print {
      .page { padding: 10mm 12mm; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-area">
      <div class="logo-name">KlinikModern</div>
      <div class="logo-sub">Randevu Çizelgesi</div>
    </div>
    <div class="header-right">
      <div class="report-title">${esc(reportTitle)}</div>
      <div class="report-meta">
        Doktor: <b>${esc(doctor)}</b><br>
        Oluşturma: ${now.toLocaleString("tr-TR")}
      </div>
    </div>
  </div>

  <div class="stats">
    <div class="stat-box stat-total">
      <div class="stat-num">${reportRows.length}</div>
      <div class="stat-lbl">Toplam</div>
    </div>
    <div class="stat-box stat-bek">
      <div class="stat-num">${statusCounts.BEKLIYOR}</div>
      <div class="stat-lbl">Bekliyor</div>
    </div>
    <div class="stat-box stat-gel">
      <div class="stat-num">${statusCounts.GELDI}</div>
      <div class="stat-lbl">Geldi</div>
    </div>
    <div class="stat-box stat-gel2">
      <div class="stat-num">${statusCounts.GELMEDI}</div>
      <div class="stat-lbl">Gelmedi</div>
    </div>
    <div class="stat-box stat-iptal">
      <div class="stat-num">${statusCounts.IPTAL}</div>
      <div class="stat-lbl">İptal</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Tarih</th>
        <th>Saat</th>
        <th style="text-align:center;">Süre</th>
        <th>Hasta</th>
        <th>Doktor</th>
        <th>Tedavi</th>
        <th>Durum</th>
        <th>Not</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    <span>Bu çıktı KlinikModern randevu çizelgesinden üretilmiştir.</span>
    <span>${now.toLocaleString("tr-TR")}</span>
  </div>
</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
  };

  const filteredAgendaAppointments = useMemo(() => {
    if (agendaStatusFilter === "ALL") return appointments.filter(a => a.status !== "IPTAL");
    return appointments.filter(a => a.status === agendaStatusFilter);
  }, [appointments, agendaStatusFilter]);

  // DoctorBlock helpers
  const isSlotBlocked = useCallback((docId: string, dateStr: string, slotTime: string): boolean => {
    return doctorBlocks.some(b => {
      if (b.doctorId !== docId) return false;
      if (b.date !== dateStr) return false;
      return slotTime >= b.startTime && slotTime < b.endTime;
    });
  }, [doctorBlocks]);

  const getBlockForSlot = useCallback((docId: string, dateStr: string, slotTime: string) => {
    return doctorBlocks.find(b => {
      if (b.doctorId !== docId) return false;
      if (b.date !== dateStr) return false;
      return slotTime >= b.startTime && slotTime < b.endTime;
    }) || null;
  }, [doctorBlocks]);

  const deleteBlock = async (id: string) => {
    if (!window.confirm("Bu bloke zaman silinsin mi?")) return;
    const res = await fetch("/api/doctor-blocks?id=" + id, { method: "DELETE" });
    if (!res.ok) {
      setError("Bloke zaman silinemedi");
      return;
    }
    await load();
  };

  const saveBlock = async () => {
    if (!blockDoctorId || !blockDate || !blockStartTime || !blockEndTime) return;
    setBlockSaving(true);
    const res = await fetch("/api/doctor-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: blockDoctorId, date: blockDate, startTime: blockStartTime, endTime: blockEndTime, reason: blockReason || null }),
    });
    setBlockSaving(false);
    if (res.ok) {
      setShowBlockModal(false);
      setBlockReason("");
      await load();
    } else {
      const body = await res.json().catch(() => ({ message: "Blok eklenemedi" }));
      setError(body.message || "Blok eklenemedi");
    }
  };

  const apptBlock = (a: Appointment, enableDrag = false) => (
    (() => {
      const parsed = parseAppointmentNote(a.note);
      const meta = getFollowUpMeta(parsed.followUp);
      const treatmentMeta = getTreatmentMeta(parsed.treatment);
      return (
    <div key={a.id}
      draggable={enableDrag}
      onDragStart={enableDrag ? (e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; setDraggedApptId(a.id); } : undefined}
      onDragEnd={enableDrag ? () => { setDraggedApptId(null); setDragOverKey(null); } : undefined}
      onClick={() => setSelectedAppt(a)}
      title={`${a.patient?.fullName || "-"} - ${new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}`}
      className={"mb-1 cursor-pointer rounded px-1.5 py-1 " + (enableDrag ? "cursor-grab active:cursor-grabbing " : "") + (STATUS_COLORS[a.status] || "bg-blue-50 border-l-4 border-blue-400")}>
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: treatmentMeta.color }} />
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-800">{a.patient?.fullName || "-"}</p>
        {parsed.followUp !== "YOK" && (
          <span className={"inline-flex rounded-full px-1 py-0.5 text-[9px] font-semibold " + meta.badge}>T</span>
        )}
      </div>
      <p className="mt-0.5 truncate pl-3 text-[9px] leading-tight text-gray-500">{treatmentMeta.label}</p>
    </div>
      );
    })()
  );

  return (
    <section className="space-y-4">
      <div className="sticky top-[72px] z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[170px]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black leading-tight text-slate-900">Randevular</h1>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                {appointments.length} kayıt
              </span>
              {doctorBlocks.length > 0 && (
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">
                  {doctorBlocks.length} blokaj
                </span>
              )}
            </div>
          </div>

          <div className="relative min-w-[260px] flex-1">
            <input
              value={upcomingSearch}
              onChange={(e) => setUpcomingSearch(e.target.value)}
              placeholder="Hasta adıyla yaklaşan randevu ara"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {upcomingLoading && <span className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin rounded-full border border-slate-300 border-t-primary" aria-hidden="true" />}
            {upcomingSearch.trim().length >= 2 && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {upcomingResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">Yaklaşan randevu bulunamadı.</p>
                ) : (
                  upcomingResults.map((appt) => (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={() => {
                        const localDate = new Date(appt.startAt);
                        setDate(localDate);
                        setView("HAFTA");
                        setSelectedAppt(
                          appointments.find((a) => a.id === appt.id) || {
                            id: appt.id,
                            startAt: appt.startAt,
                            endAt: appt.endAt,
                            status: appt.status,
                            type: "STANDART",
                            note: "",
                            patient: appt.patient ? { id: appt.patient.id, fullName: appt.patient.fullName } : undefined,
                            doctor: appt.doctor ? { id: appt.doctor.id, fullName: appt.doctor.fullName } : undefined,
                          }
                        );
                      }}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <span className="font-semibold text-slate-800">{appt.patient?.fullName || "-"}</span>
                      <span className="text-xs text-slate-600">
                        {new Date(appt.startAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {appt.doctor?.fullName || "Doktor yok"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
            <option value="">Tüm Doktorlar</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => nav(-1)} aria-label="Önceki tarih aralığı" className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg leading-none hover:bg-gray-100">‹</button>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-gray-800">{navLabel()}</span>
            <button onClick={() => nav(1)} aria-label="Sonraki tarih aralığı" className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg leading-none hover:bg-gray-100">›</button>
            {(["GUN","HAFTA","AY","AJANDA"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={"rounded-lg px-3 py-2 text-sm font-semibold transition-colors " + (view === mode ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
              >
                {mode === "GUN" ? "Gün" : mode === "HAFTA" ? "Hafta" : mode === "AY" ? "Ay" : "Ajanda"}
              </button>
            ))}
            <button onClick={() => setShowForm(!showForm)} disabled={!canCreateAppointments} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Yeni Randevu</button>
            {canCreateAppointments && (
              <button onClick={() => setShowBlockModal(true)} className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100">Doktor Blokajı</button>
            )}
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Diğer
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  onClick={printReport}
                  disabled={!canExportOrPrint}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Randevu çizelgesini yazdır"}
                >
                  Yazdır
                </button>
                <button
                  onClick={downloadExcelReport}
                  disabled={!canExportOrPrint}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Excel olarak dışa aktar"}
                >
                  Excel
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border bg-white p-4 shadow-xl">
          <h3 className="mb-3 font-bold text-gray-700">Yeni Randevu</h3>
          {conflictWarning && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-yellow-500" aria-hidden="true" />
              <span>{conflictWarning}</span>
            </div>
          )}
          {conflictSuggestions.length > 0 && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <p className="font-semibold">Önerilen uygun saatler:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {conflictSuggestions.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      const d = new Date(startAt);
                      const [h, m] = slot.split(":").map(Number);
                      d.setHours(h, m, 0, 0);
                      setStartAt(toLocalInput(d));
                      setDurationMinutes(slotInterval);
                    }}
                    className="rounded-md border border-blue-300 bg-white px-2 py-0.5 font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="mb-2 text-red-600 text-sm">{error}</p>}
          <div className="grid gap-2 md:grid-cols-3">
            {/* Hasta Arama Combobox */}
            <div className="relative">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                <span className="text-slate-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder={patientId ? undefined : "Hasta adı, TC veya telefon ile ara..."}
                  value={patientId ? patientSearch : patientSearch}
                  onChange={e => {
                    setPatientSearch(e.target.value);
                    setPatientDropdownOpen(true);
                    if (!e.target.value) { setPatientId(""); }
                  }}
                  onFocus={() => patientSearch.trim().length >= 2 && setPatientDropdownOpen(true)}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                {patientId && (
                  <button type="button" onClick={() => { setPatientId(""); setPatientSearch(""); setPatientResults([]); }}
                    className="text-slate-400 hover:text-red-500 text-base leading-none">
                    ×
                  </button>
                )}
                {patientSearchLoading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />}
              </div>
              {patientDropdownOpen && (patientResults.length > 0 || (patientSearch.trim().length >= 2 && !patientSearchLoading)) && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {patientResults.length === 0
                    ? <p className="px-4 py-3 text-sm text-slate-400">Sonuç bulunamadı</p>
                    : patientResults.map(p => (
                      <button key={p.id} type="button"
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-primary/5 transition"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setPatientId(p.id);
                          setPatientSearch(p.fullName);
                          setPatientResults([]);
                          setPatientDropdownOpen(false);
                        }}>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {p.fullName.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-semibold text-slate-800">{p.fullName}</span>
                          {p.tcNo && <span className="text-[11px] text-slate-400">TC: {p.tcNo}</span>}
                        </span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Doktor ara veya seç"
                value={doctorQuery}
                onChange={(e) => {
                  setDoctorQuery(e.target.value);
                  setNewDoctorId("");
                  setDoctorDropdownOpen(true);
                }}
                onFocus={() => setDoctorDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDoctorDropdownOpen(false), 120)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              {doctorDropdownOpen && (
                <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filteredDoctorOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">Doktor bulunamadı</p>
                  ) : (
                    filteredDoctorOptions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewDoctorId(item.id);
                          setDoctorQuery(item.fullName);
                          setDoctorDropdownOpen(false);
                        }}
                        className={"w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50 " + (newDoctorId === item.id ? "bg-primary/5 text-primary" : "text-slate-700")}
                      >
                        {item.fullName}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Tedavi ara veya seç"
                value={treatmentQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setTreatmentQuery(value);
                  setTreatmentDropdownOpen(true);
                  const exact = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase() === value.trim().toLowerCase());
                  if (exact) setTreatmentKey(exact.value);
                }}
                onFocus={() => setTreatmentDropdownOpen(true)}
                onBlur={() => {
                  setTimeout(() => setTreatmentDropdownOpen(false), 120);
                  const resolved = resolveTreatmentKey(treatmentQuery);
                  const meta = getTreatmentMeta(resolved);
                  setTreatmentKey(resolved);
                  setTreatmentQuery(meta.label);
                }}
              />
              {treatmentDropdownOpen && (
                <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filteredTreatmentOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">Tedavi bulunamadı</p>
                  ) : (
                    filteredTreatmentOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTreatmentKey(item.value);
                          setTreatmentQuery(item.label);
                          setTreatmentDropdownOpen(false);
                        }}
                        className={"flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50 " + (treatmentKey === item.value ? "bg-primary/5 text-primary" : "text-slate-700")}
                      >
                        <span>{item.label}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={e => setStartAt(e.target.value)} />
            <select className="rounded-lg border px-3 py-2 text-sm" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}>
              {durationOptions.map((option) => (
                <option key={option} value={option}>{option} dk</option>
              ))}
            </select>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">Tedavi rengi:</span>
              <span className="inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: selectedTreatmentMeta.color }}>
                <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                {selectedTreatmentMeta.label}
              </span>
            </div>
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" rows={2} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="mt-2 flex flex-wrap gap-4">
            {[["smsInfo","Bilgilendirme SMS",smsInfo,setSmsInfo],["smsReminder","Hatırlatma SMS",smsReminder,setSmsReminder],["smsSurvey","Değerlendirme SMS",smsSurvey,setSmsSurvey]].map(([k,lbl,val,set]:any) => (
              <label key={k} className="flex items-center gap-1 text-sm cursor-pointer">
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="accent-primary" />{lbl}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={createAppointment} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Kaydediliyor..." : "Randevu Ekle"}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">İptal</button>
          </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}
      {loading && (
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Randevular yükleniyor…
        </div>
      )}
      <div aria-busy={loading}>
      {view === "GUN" && workingDayIndexes.has(date.getDay()) && (
        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-2 text-left text-gray-500 w-16">Saat</th>
                {doctors.length === 0 ? <th className="border px-2 py-2 text-gray-400">Doktor bulunamadı</th> :
                  doctors.map(d => <th key={d.id} className="border px-2 py-2 text-center text-gray-700 font-semibold min-w-36">{d.fullName}</th>)}
              </tr>
            </thead>
            <tbody>
              {gunSlotTimes.map(slot => (
                <tr key={slot} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-gray-400 font-mono align-top whitespace-nowrap">{slot}</td>
                  {doctors.map(d => {
                    const slotAppts = getApptForSlot(d.id, slot);
                    const dropKey = `g-${d.id}-${slot}`;
                    const dateStr = date.toISOString().slice(0, 10);
                    const blocked = isSlotBlocked(d.id, dateStr, slot);
                    const blockInfo = blocked ? getBlockForSlot(d.id, dateStr, slot) : null;
                    return (
                      <td
                        key={d.id}
                        className={"group border p-1 align-top min-h-9 transition-colors " + (blocked ? "bg-orange-50" : dragOverKey === dropKey ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "")}
                        onDragOver={(e) => { if (draggedApptId && !blocked) { e.preventDefault(); setDragOverKey(dropKey); } }}
                        onDragLeave={() => setDragOverKey(prev => prev === dropKey ? null : prev)}
                        onDrop={(e) => { if (!blocked) { e.preventDefault(); void handleDropOnSlot(date, slot, d.id); } }}
                      >
                        {blocked ? (
                          <div className="flex items-center gap-1 rounded bg-orange-100 border border-orange-200 px-1 py-0.5 text-[10px] text-orange-700">
                            <span>⊘</span>
                            <span className="truncate">{blockInfo?.reason || "Bloke"}</span>
                            {canCreateAppointments && <button onClick={() => blockInfo && deleteBlock(blockInfo.id)} aria-label="Bloke zamanı sil" title="Bloke zamanı sil" className="ml-auto text-red-400 hover:text-red-600">✕</button>}
                          </div>
                        ) : (
                          <>
                            {slotAppts.map(a => apptBlock(a, canCreateAppointments))}
                            {slotAppts.length === 0 ? (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, date, d.id)}
                                  className="w-full rounded border border-dashed border-gray-300 px-1 py-1 text-[11px] text-gray-500 transition hover:border-primary hover:text-primary"
                                >
                                  + Randevu Oluştur
                                </button>
                              ) : <div className="h-7" />
                            ) : (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, date, d.id)}
                                  className="mt-0.5 w-full rounded border border-dashed border-yellow-300 px-1 py-0.5 text-[10px] text-yellow-600 transition hover:border-yellow-500 hover:bg-yellow-50"
                                >
                                  + Ekle
                                </button>
                              ) : null
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "GUN" && !workingDayIndexes.has(date.getDay()) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Seçili gün klinik için tatil günü olarak tanımlı. Randevu çizelgesi gösterilmiyor.
        </div>
      )}

      {view === "HAFTA" && (
        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-100">
                <tr>
                <th className="border px-2 py-2 text-left text-gray-500 w-16">Saat</th>
                {weekDays.map((d, i) => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <th key={i} onClick={() => { setDate(d); setView("GUN"); }}
                      className={"border px-2 py-2 text-center cursor-pointer hover:bg-primary/10 min-w-28 " + (isToday ? "bg-primary/20 text-primary font-bold" : "text-gray-700")}>
                      {TR_DAYS_BY_JS_INDEX[d.getDay()]}<br /><span className="text-sm">{d.getDate()}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slotTimes.map(slot => (
                <tr key={slot} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-gray-400 font-mono align-top whitespace-nowrap">{slot}</td>
                  {weekDays.map((d, i) => {
                    const slotAppts = getApptForSlot(doctorId || null, slot, d);
                    const dropKey = `h-${d.toDateString()}-${slot}`;
                    const dateStr = d.toISOString().slice(0, 10);
                    // Hafta görünümünde belirli bir doktor seçiliyse blok kontrolü yap
                    const blocked = doctorId ? isSlotBlocked(doctorId, dateStr, slot) : false;
                    const blockInfo = blocked && doctorId ? getBlockForSlot(doctorId, dateStr, slot) : null;
                    // Per-day mesai saati kontrolü
                    const haftaDayDs = scheduleByJsDay.get(d.getDay());
                    const haftaSlotMins = parseTimeToMinutes(slot, 0);
                    const haftaOutOfHours = haftaDayDs && !haftaDayDs.isHoliday
                      ? (haftaSlotMins < parseTimeToMinutes(haftaDayDs.open, 0) || haftaSlotMins >= parseTimeToMinutes(haftaDayDs.close, 23 * 60 + 59))
                      : false;
                    return (
                      <td
                        key={i}
                        className={"group border p-1 align-top min-h-9 transition-colors " + (haftaOutOfHours ? "bg-slate-50 " : "") + (blocked ? "bg-orange-50" : dragOverKey === dropKey ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "")}
                        onDragOver={(e) => { if (draggedApptId && !blocked && !haftaOutOfHours) { e.preventDefault(); setDragOverKey(dropKey); } }}
                        onDragLeave={() => setDragOverKey(prev => prev === dropKey ? null : prev)}
                        onDrop={(e) => { if (!blocked && !haftaOutOfHours) { e.preventDefault(); void handleDropOnSlot(d, slot); } }}
                      >
                        {haftaOutOfHours ? (
                          <div className="h-7" />
                        ) : blocked ? (
                          <div className="flex items-center gap-1 rounded bg-orange-100 border border-orange-200 px-1 py-0.5 text-[10px] text-orange-700">
                            <span>⊘</span>
                            <span className="truncate">{blockInfo?.reason || "Bloke"}</span>
                            {canCreateAppointments && <button onClick={() => blockInfo && deleteBlock(blockInfo.id)} aria-label="Bloke zamanı sil" title="Bloke zamanı sil" className="ml-auto text-red-400 hover:text-red-600">✕</button>}
                          </div>
                        ) : (
                          <>
                            {slotAppts.map(a => apptBlock(a, canCreateAppointments))}
                            {slotAppts.length === 0 ? (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                                  className="w-full rounded border border-dashed border-gray-300 px-1 py-1 text-[11px] text-gray-500 transition hover:border-primary hover:text-primary"
                                >
                                  + Randevu Oluştur
                                </button>
                              ) : <div className="h-7" />
                            ) : (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                                  className="mt-0.5 w-full rounded border border-dashed border-yellow-300 px-1 py-0.5 text-[10px] text-yellow-600 transition hover:border-yellow-500 hover:bg-yellow-50"
                                >
                                  + Ekle
                                </button>
                              ) : null
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "AY" && (
        <div className="rounded-xl border bg-white p-2">
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {TR_DAYS.map(d => <div key={d} className="bg-gray-100 text-center text-xs font-semibold py-2 text-gray-600">{d}</div>)}
            {(() => {
              const firstDay = currentRange.from.getDay();
              const offset = firstDay === 0 ? 6 : firstDay - 1;
              return Array.from({length: offset}, (_, i) => <div key={"e"+i} className="bg-white min-h-20" />);
            })()}
            {monthDays.map((d, i) => {
              const dayAppts = getApptForDay(d);
              const isToday = d.toDateString() === new Date().toDateString();
              const isWorkday = workingDayIndexes.has(d.getDay());
              return (
                <div key={i} onClick={() => { setDate(d); setView("GUN"); }}
                  className={"bg-white min-h-20 p-1 cursor-pointer hover:bg-blue-50 " + (isToday ? "ring-2 ring-inset ring-primary" : "") + (isWorkday ? "" : " opacity-70") }>
                  <div className="mb-1 flex items-center justify-between">
                    <div className={"text-xs font-bold " + (isToday ? "text-primary" : "text-gray-700")}>{d.getDate()}</div>
                    {canCreateAppointments && isWorkday ? (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openQuickCreate(slotTimes[0], d, doctorId || undefined);
                        }}
                        className="rounded border border-dashed border-gray-300 px-1 text-[10px] text-gray-500 hover:border-primary hover:text-primary"
                      >
                        +
                      </button>
                    ) : <span className="w-3" />}
                  </div>
                  {dayAppts.slice(0,3).map(a => (
                    <div key={a.id} style={{background: a.colorCode || getTreatmentMeta(parseAppointmentNote(a.note).treatment).color}}
                      className="rounded text-white text-xs px-1 mb-0.5 truncate"
                      onClick={e => { e.stopPropagation(); setSelectedAppt(a); }}>
                      {new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})} {a.patient?.fullName}
                    </div>
                  ))}
                  {dayAppts.length > 3 && <div className="text-xs text-gray-400">+{dayAppts.length-3} daha</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "AJANDA" && (
        <div className="space-y-1">
          <div className="mb-2 flex flex-wrap gap-1">
            {[
              { key: "ALL", label: "Tümü" },
              { key: "BEKLIYOR", label: "Bekliyor" },
              { key: "GELDI", label: "Geldi" },
              { key: "GELMEDI", label: "Gelmedi" },
              { key: "IPTAL", label: "İptal" },
            ].map((chip) => (
              <button
                key={chip.key}
                onClick={() => setAgendaStatusFilter(chip.key as "ALL" | "BEKLIYOR" | "GELDI" | "GELMEDI" | "IPTAL")}
                className={"rounded-full px-3 py-1 text-xs font-semibold " + (agendaStatusFilter === chip.key ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {filteredAgendaAppointments.length === 0 && <p className="py-8 text-center text-gray-400">Seçilen filtrede randevu yok</p>}
          {filteredAgendaAppointments.map(a => (
            (() => {
              const parsed = parseAppointmentNote(a.note);
              const meta = getFollowUpMeta(parsed.followUp);
              const treatmentMeta = getTreatmentMeta(parsed.treatment);
              return (
            <div key={a.id} onClick={() => setSelectedAppt(a)}
              className={"flex items-center gap-3 rounded-lg border bg-white p-3 cursor-pointer hover:shadow-sm " + (STATUS_COLORS[a.status] || "")}>
              <div className="flex flex-col items-center min-w-16 text-center">
                <span className="text-xs text-gray-500">{new Date(a.startAt).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}</span>
                <span className="text-sm font-bold text-primary">{new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{a.patient?.fullName}</p>
                <p className="text-xs text-gray-500">{a.doctor?.fullName}</p>
                <p className={"mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " + treatmentMeta.badge}>{treatmentMeta.label}</p>
                {parsed.detail && <p className="text-xs text-gray-400 mt-0.5">{parsed.detail}</p>}
                {parsed.followUp !== "YOK" && <p className={"mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " + meta.badge}>{meta.label}</p>}
              </div>
              <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (a.status==="GELDI"?"bg-green-100 text-green-700":a.status==="GELMEDI"?"bg-red-100 text-red-700":a.status==="IPTAL"?"bg-gray-200 text-gray-600":"bg-yellow-100 text-yellow-700")}>
                {STATUS_LABELS[a.status] || a.status}
              </span>
            </div>
              );
            })()
          ))}
        </div>
      )}
      </div>

      {/* DOKTOR BLOK EKLEME MODALI */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Doktor Zaman Blokajı Ekle</h2>
              <button onClick={() => setShowBlockModal(false)} aria-label="Kapat" title="Kapat" className="rounded-lg p-1 hover:bg-slate-100 text-slate-400">✕</button>
            </div>
            <p className="mb-4 text-xs text-slate-500">Seçili zaman aralığında doktor randevuya kapalı olarak işaretlenir. Mevcut randevular etkilenmez.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Doktor</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={blockDoctorId} onChange={e => setBlockDoctorId(e.target.value)}>
                  <option value="">— Doktor Seçin —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tarih</label>
                <input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Başlangıç</label>
                  <input type="time" value={blockStartTime} onChange={e => setBlockStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Bitiş</label>
                  <input type="time" value={blockEndTime} onChange={e => setBlockEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Neden (isteğe bağlı)</label>
                <input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)}
                  placeholder="Öğle arası, toplantı, izin..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>

            {/* Mevcut bloklar bu doktor için */}
            {blockDoctorId && blockDate && (
              <div className="mt-4">
                <h3 className="text-xs font-bold text-slate-700 mb-2">Bu güne ait mevcut bloklar</h3>
                {doctorBlocks.filter(b => b.doctorId === blockDoctorId && b.date === blockDate).length === 0 ? (
                  <p className="text-xs text-slate-400">Bu tarihte blok yok</p>
                ) : (
                  <div className="space-y-1">
                    {doctorBlocks.filter(b => b.doctorId === blockDoctorId && b.date === blockDate).map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs">
                        <span className="font-semibold text-orange-800">{b.startTime} – {b.endTime}</span>
                        <span className="text-orange-600">{b.reason || ""}</span>
                        <button onClick={() => deleteBlock(b.id)} aria-label="Bloke zamanı sil" title="Bloke zamanı sil" className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={saveBlock} disabled={blockSaving || !blockDoctorId || !blockDate || !blockStartTime || !blockEndTime}
                className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                {blockSaving ? "Kaydediliyor…" : "Blok Ekle"}
              </button>
              <button onClick={() => setShowBlockModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAppt && (
        (() => {
          const parsed = parseAppointmentNote(selectedAppt.note);
          const meta = getFollowUpMeta(parsed.followUp);
          const treatmentMeta = getTreatmentMeta(parsed.treatment);
          return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeAppointmentModal}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">{editMode ? "Randevuyu Düzenle" : "Randevu Detayı"}</h3>
              <button onClick={closeAppointmentModal} aria-label="Kapat" title="Kapat" className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {editMode ? (
              <div className="space-y-3">
                {error && <p className="text-red-600 text-sm">{error}</p>}
                {/* Hasta */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Hasta</label>
                  <div className="relative">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                      <span className="text-slate-400 text-sm">🔍</span>
                      <input type="text" placeholder="Hasta adı, TC veya telefon..."
                        value={editPatientSearch}
                        onChange={e => { setEditPatientSearch(e.target.value); setEditPatientDropdownOpen(true); if (!e.target.value) setEditPatientId(""); }}
                        onFocus={() => editPatientSearch.trim().length >= 2 && setEditPatientDropdownOpen(true)}
                        className="flex-1 bg-transparent text-sm outline-none" />
                      {editPatientId && <button type="button" onClick={() => { setEditPatientId(""); setEditPatientSearch(""); setEditPatientResults([]); }} aria-label="Hasta seçimini temizle" title="Hasta seçimini temizle" className="text-slate-400 hover:text-red-500 text-base leading-none">×</button>}
                      {editPatientLoading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />}
                    </div>
                    {editPatientDropdownOpen && (editPatientResults.length > 0 || (editPatientSearch.trim().length >= 2 && !editPatientLoading)) && (
                      <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        {editPatientResults.length === 0
                          ? <p className="px-4 py-3 text-sm text-slate-400">Sonuç bulunamadı</p>
                          : editPatientResults.map(p => (
                            <button key={p.id} type="button"
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-primary/5 transition"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setEditPatientId(p.id); setEditPatientSearch(p.fullName); setEditPatientResults([]); setEditPatientDropdownOpen(false); }}>
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{p.fullName.charAt(0).toUpperCase()}</span>
                              <span className="flex flex-col"><span className="font-semibold text-slate-800">{p.fullName}</span>{p.tcNo && <span className="text-[11px] text-slate-400">TC: {p.tcNo}</span>}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                </div>
                {/* Doktor */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Doktor</label>
                  <div className="relative">
                    <input type="text" placeholder="Doktor ara veya seç" value={editDoctorQuery}
                      onChange={e => { setEditDoctorQuery(e.target.value); setEditDoctorId(""); setEditDoctorDropdownOpen(true); }}
                      onFocus={() => setEditDoctorDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setEditDoctorDropdownOpen(false), 120)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" />
                    {editDoctorDropdownOpen && (
                      <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filteredEditDoctorOptions.length === 0
                          ? <p className="px-3 py-2 text-sm text-slate-500">Doktor bulunamadı</p>
                          : filteredEditDoctorOptions.map(item => (
                            <button key={item.id} type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setEditDoctorId(item.id); setEditDoctorQuery(item.fullName); setEditDoctorDropdownOpen(false); }}
                              className={"w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50 " + (editDoctorId === item.id ? "bg-primary/5 text-primary" : "text-slate-700")}>
                              {item.fullName}
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                </div>
                {/* Başlangıç & Süre */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Başlangıç</label>
                    <input type="datetime-local" className="w-full rounded-lg border px-3 py-2 text-sm" value={editStartAt} onChange={e => setEditStartAt(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Süre</label>
                    <select className="w-full rounded-lg border px-3 py-2 text-sm" value={editDurationMinutes} onChange={e => setEditDurationMinutes(Number(e.target.value))}>
                      {durationOptions.map(opt => <option key={opt} value={opt}>{opt} dk</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={updateAppointment} disabled={editSaving || !editPatientId || !editDoctorId}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {editSaving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button onClick={() => { setEditMode(false); setError(null); }} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">İptal</button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Hasta:</span><span className="font-semibold">{selectedAppt.patient?.fullName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Doktor:</span><span>{selectedAppt.doctor?.fullName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Başlangıç:</span><span>{new Date(selectedAppt.startAt).toLocaleString("tr-TR")}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Bitiş:</span><span>{new Date(selectedAppt.endAt).toLocaleString("tr-TR")}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tedavi:</span><span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + treatmentMeta.badge}>{treatmentMeta.label}</span></div>
                  {parsed.detail && <div className="flex justify-between gap-3"><span className="text-gray-500">Not:</span><span className="max-w-xs text-right">{parsed.detail}</span></div>}
                  {parsed.followUp !== "YOK" && <div className="flex justify-between"><span className="text-gray-500">Takip:</span><span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + meta.badge}>{meta.label}</span></div>}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-2 font-semibold">Durum Güncelle:</p>
                  <div className="flex flex-wrap gap-2">
                    {[{v:"BEKLIYOR",l:"Bekliyor",c:"bg-yellow-100 text-yellow-700"},{v:"GELDI",l:"Geldi",c:"bg-green-100 text-green-700"},{v:"GELMEDI",l:"Gelmedi",c:"bg-red-100 text-red-700"},{v:"IPTAL",l:"İptal",c:"bg-gray-200 text-gray-700"}].map(s => (
                      <button key={s.v} onClick={() => updateStatus(selectedAppt.id, s.v)}
                        className={"rounded-full px-3 py-1 text-sm font-semibold " + s.c + (selectedAppt.status===s.v?" ring-2 ring-gray-400":"")}>
                        {s.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Takip Notu</p>
                  <select value={followUpStatus} onChange={(e) => setFollowUpStatus(e.target.value as FollowUpKey)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    {FOLLOW_UP_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} rows={3}
                    placeholder="Örn: Hasta gelmedi, 2 kez arandı ulaşılmadı. Yarın tekrar aranacak."
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <div className="mt-2 flex justify-end">
                    <button onClick={saveAppointmentFollowUp} disabled={detailSaving} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {detailSaving ? "Kaydediliyor..." : "Takip Notunu Kaydet"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <a href={"/hasta-detay?id=" + selectedAppt.patient?.id} className="rounded-lg bg-primary px-3 py-2 text-sm text-white">Hasta Detayı</a>
                  <button onClick={openEditMode} className="rounded-lg bg-slate-600 px-3 py-2 text-sm text-white">Düzenle</button>
                  <button onClick={() => remove(selectedAppt.id)} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Sil</button>
                  <button onClick={closeAppointmentModal} className="ml-auto rounded-lg border px-3 py-2 text-sm text-gray-600">Kapat</button>
                </div>
              </>
            )}
          </div>
        </div>
          );
        })()
      )}
    </section>
  );
}
