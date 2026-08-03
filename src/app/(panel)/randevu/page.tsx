"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet } from "@/lib/client-cache";
import { canMarkNoShow, getDisplayAppointmentStatus, isStaleWaitingAppointment } from "@/lib/appointment-status";
import { Modal, DIRTY_CONFIRM_MESSAGE, DIRTY_CONFIRM_CANCEL_TEXT, DIRTY_CONFIRM_CONFIRM_TEXT } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { CalendarClock, CheckCircle2, Clock, XCircle, Ban } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { STATUS_ACTION_ICON } from "@/lib/status-actions";

const AgendaEmptyIcon = createSceneIllustration("randevu");
import {
  buildScheduleByJsDay,
  checkDoctorLocalHoursInterval,
  checkDoctorWorkingHoursInterval,
  checkLocalWorkingHoursInterval,
  checkWorkingHoursInterval,
  FALLBACK_DAILY_SCHEDULES,
  normalizeDailySchedules,
  type DaySchedule,
} from "@/lib/working-hours-core";
import {
  type AppointmentTreatmentKey,
  type FollowUpKey,
  type TreatmentOption,
  APPOINTMENT_TREATMENT_OPTIONS,
  FOLLOW_UP_OPTIONS,
  buildAppointmentNote,
  getFollowUpMeta,
  getTreatmentMeta as getTreatmentMetaBase,
  parseAppointmentNote as parseAppointmentNoteBase,
} from "@/lib/appointment-follow-up";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  type: "STANDART" | "KONTROL" | "ACIL";
  status: string;
  note?: string | null;
  colorCode?: string;
  patient?: { id: string; fullName: string; hasContagiousDisease?: boolean; contagiousDiseaseNote?: string | null };
  doctor?: { id: string; fullName: string };
  clinicUnit?: { id: string; name: string; code?: string | null } | null;
};

type Staff = { id: string; fullName: string; role: string; profile?: { workStart?: string | null; workEnd?: string | null; hideAsDoctor?: boolean } | null };
type Patient = { id: string; fullName: string; tcNo?: string; phone?: string };
type ClinicUnit = { id: string; name: string; code?: string | null; isActive: boolean };
type UpcomingAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patient?: { id: string; fullName: string; phone?: string | null; tcNo?: string | null };
  doctor?: { id: string; fullName: string };
};

const STATUS_COLORS: Record<string, string> = {
  PLANLANDI: "bg-sky-50 border-l-4 border-sky-400",
  BEKLIYOR: "bg-yellow-50 border-l-4 border-yellow-400",
  TAMAMLANDI: "bg-green-50 border-l-4 border-green-500",
  GELMEDI: "bg-red-50 border-l-4 border-red-500",
  IPTAL: "bg-gray-100 border-l-4 border-gray-400",
};

const STATUS_BADGE: Record<string, { icon: typeof Clock; tone: "info" | "warning" | "success" | "critical" | "neutral" }> = {
  PLANLANDI: { icon: CalendarClock, tone: "info" },
  BEKLIYOR: { icon: Clock, tone: "warning" },
  TAMAMLANDI: { icon: CheckCircle2, tone: "success" },
  GELMEDI: { icon: XCircle, tone: "critical" },
  IPTAL: { icon: Ban, tone: "neutral" },
};

const STATUS_LABELS: Record<string, string> = {
  PLANLANDI: "Planlandı", BEKLIYOR: "Bekliyor", TAMAMLANDI: "Tamamlandı", GELMEDI: "Gelmedi", IPTAL: "İptal"
};

// Durumlar yalnız arka plan rengiyle ayrılmasın diye (renk körü kullanıcılar
// için) her durumun ayrıca kısa bir sembolü + STATUS_LABELS metni var —
// randevu kartında bu sembol görünür, tam etiket title/tooltip'te.
const STATUS_ICON: Record<string, string> = {
  PLANLANDI: "◐", BEKLIYOR: "◔", TAMAMLANDI: "✓", GELMEDI: "✕", IPTAL: "⊘",
};

function toLocalInput(date: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + z(date.getMonth() + 1) + "-" + z(date.getDate()) + "T" + z(date.getHours()) + ":" + z(date.getMinutes());
}

function toLocalDateKey(date: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

// Doktor çakışması artık sert bir engel değil — aynı doktor aynı saatte başka
// bir hastaya da atanabilir (ör. koltuklar arası geçiş). Sunucu 409 +
// requiresConfirmation döndürdüğünde personele sorulur; onaylarsa
// overrideConflict:true ile aynı istek tekrar gönderilir. Tedavi alanı/hasta
// çakışmaları fiziksel olarak imkânsız olduğu için hâlâ kesin engellenir ve
// bu akışa hiç girmez (bkz. src/app/api/appointments).
async function submitAppointmentWithConflictConfirm(
  url: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<Response> {
  const send = (payload: Record<string, unknown>) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

  const res = await send(body);
  if (res.status !== 409) return res;

  const data = await res.clone().json().catch(() => null);
  if (!data?.requiresConfirmation) return res;

  const confirmed = await confirmDialog({
    message: data.message || "Bu doktorun aynı saatte başka bir randevusu var. Yine de devam edilsin mi?",
    confirmText: "Yine de Devam Et",
  });
  if (!confirmed) return res;

  return send({ ...body, overrideConflict: true });
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

type CalendarSettings = {
  openingTime: string;
  closingTime: string;
  appointmentDuration: number;
  holidayDays: string[];
  dailySchedules: DaySchedule[];
};

  type DoctorBlock = { id: string; doctorId: string; date: string; startTime: string; endTime: string; reason?: string | null; doctor?: { id: string; fullName: string } };

type BookingRequestEntry = {
  id: string;
  fullName: string;
  phone: string;
  tcNo?: string | null;
  doctor?: { id: string; fullName: string } | null;
  preferredFrom: string;
  note?: string | null;
  status: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI" | "IPTAL";
  createdAt: string;
};

type WaitlistEntry = {
  id: string;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor?: { id: string; fullName: string } | null;
  preferredFrom?: string | null;
  preferredTo?: string | null;
  note?: string | null;
  status: "BEKLIYOR" | "ARANDI" | "YERLESTIRILDI" | "IPTAL";
  createdAt: string;
};

const APPOINTMENT_CREATOR_ROLES = new Set(["DOKTOR", "YONETICI", "ASISTAN", "BANKO", "ADMIN", "SUPERADMIN"]);

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"GUN" | "HAFTA" | "AY" | "AJANDA">("GUN");
  const [date, setDate] = useState(() => new Date());
  const [doctorId, setDoctorId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clinicUnits, setClinicUnits] = useState<ClinicUnit[]>([]);
  const [treatmentOptions, setTreatmentOptions] = useState<TreatmentOption[]>(APPOINTMENT_TREATMENT_OPTIONS);
  const getTreatmentMeta = useCallback((key: AppointmentTreatmentKey) => getTreatmentMetaBase(key, treatmentOptions), [treatmentOptions]);
  const parseAppointmentNote = useCallback((note?: string | null) => parseAppointmentNoteBase(note, treatmentOptions), [treatmentOptions]);
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
  const [newClinicUnitId, setNewClinicUnitId] = useState("");
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
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<"ALL" | "BEKLIYOR" | "GELDI" | "TAMAMLANDI" | "GELMEDI" | "IPTAL">("ALL");
  const [upcomingSearch, setUpcomingSearch] = useState("");
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingResults, setUpcomingResults] = useState<UpcomingAppointment[]>([]);
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [treatmentDropdownOpen, setTreatmentDropdownOpen] = useState(false);
  // Edit modal state
  const [editMode, setEditMode] = useState(false);
  const editSnapshotRef = useRef("");
  const [editPatientId, setEditPatientId] = useState("");
  const [editPatientSearch, setEditPatientSearch] = useState("");
  const [editPatientResults, setEditPatientResults] = useState<Patient[]>([]);
  const [editPatientLoading, setEditPatientLoading] = useState(false);
  const [editPatientDropdownOpen, setEditPatientDropdownOpen] = useState(false);
  const [editDoctorId, setEditDoctorId] = useState("");
  const [editDoctorQuery, setEditDoctorQuery] = useState("");
  const [editDoctorDropdownOpen, setEditDoctorDropdownOpen] = useState(false);
  const [editClinicUnitId, setEditClinicUnitId] = useState("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState(30);
  const [editSaving, setEditSaving] = useState(false);
  // Drag-drop state
  const [draggedApptId, setDraggedApptId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverInvalid, setDragOverInvalid] = useState<string | null>(null);
  const [justMovedApptId, setJustMovedApptId] = useState<string | null>(null);
  const [dropRejectedApptId, setDropRejectedApptId] = useState<string | null>(null);

  // Doctor Block state
  const [doctorBlocks, setDoctorBlocks] = useState<DoctorBlock[]>([]);
  const [focusAppointmentId, setFocusAppointmentId] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockDoctorId, setBlockDoctorId] = useState("");
  const [blockDate, setBlockDate] = useState(() => toLocalDateKey(new Date()));
  const [blockStartTime, setBlockStartTime] = useState("13:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockSubmitError, setBlockSubmitError] = useState<string | null>(null);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>({
    openingTime: "08:30",
    closingTime: "23:59",
    appointmentDuration: 15,
    holidayDays: ["Pazar"],
    dailySchedules: [],
  });

  // Bekleme Listesi state
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [wlPatientSearch, setWlPatientSearch] = useState("");
  const [wlPatientResults, setWlPatientResults] = useState<Patient[]>([]);
  const [wlSelectedPatient, setWlSelectedPatient] = useState<Patient | null>(null);
  const [wlDoctorId, setWlDoctorId] = useState("");
  const [wlFrom, setWlFrom] = useState("");
  const [wlTo, setWlTo] = useState("");
  const [wlNote, setWlNote] = useState("");
  const [wlSaving, setWlSaving] = useState(false);

  const loadWaitlist = useCallback(async () => {
    try {
      const res = await fetch("/api/waitlist", { cache: "no-store" });
      if (!res.ok) { setError("Bekleme listesi yüklenemedi."); setWaitlist([]); return; }
      const json = await res.json().catch(() => []);
      setWaitlist(Array.isArray(json) ? json : []);
    } catch {
      setWaitlist([]);
    }
  }, []);

  useEffect(() => {
    if (showWaitlistModal) void loadWaitlist();
  }, [showWaitlistModal, loadWaitlist]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      if (!showWaitlistModal) return;
      timer = setTimeout(() => void loadWaitlist(), 300);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [loadWaitlist, showWaitlistModal]);

  useEffect(() => {
    if (wlPatientSearch.trim().length < 2) { setWlPatientResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/patients?q=" + encodeURIComponent(wlPatientSearch.trim()) + "&take=10&summary=false");
        const data = await res.json();
        setWlPatientResults(Array.isArray(data.patients) ? data.patients : (Array.isArray(data) ? data : []));
      } catch { setWlPatientResults([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [wlPatientSearch]);

  const resetWaitlistForm = () => {
    setWlPatientSearch("");
    setWlPatientResults([]);
    setWlSelectedPatient(null);
    setWlDoctorId("");
    setWlFrom("");
    setWlTo("");
    setWlNote("");
  };

  // Bekleme Listesi modalının içindeki "Listeye Ekle" mini-formu — tüm
  // alanlar boş varsayılanla başlar, bu yüzden herhangi biri doluysa dirty.
  const waitlistFormDirty = Boolean(
    wlSelectedPatient || wlPatientSearch.trim() || wlDoctorId || wlFrom || wlTo || wlNote.trim()
  );

  async function requestCloseWaitlistModal() {
    if (waitlistFormDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setShowWaitlistModal(false);
  }

  const submitWaitlist = async () => {
    if (!wlSelectedPatient) { showToastSafe({ title: "Hata", message: "Lütfen bir hasta seçin", type: "error" }); return; }
    setWlSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: wlSelectedPatient.id,
          doctorId: wlDoctorId || null,
          preferredFrom: wlFrom ? new Date(wlFrom).toISOString() : null,
          preferredTo: wlTo ? new Date(wlTo).toISOString() : null,
          note: wlNote || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: json?.error || "Bekleme listesine eklenemedi", type: "error" });
        return;
      }
      setWaitlist((prev) => [...prev, json as WaitlistEntry]);
      resetWaitlistForm();
      showToastSafe({ title: "Eklendi", message: "Hasta bekleme listesine eklendi.", type: "success" });
    } finally {
      setWlSaving(false);
    }
  };

  const updateWaitlistStatus = async (entryId: string, status: WaitlistEntry["status"]) => {
    if (status === "YERLESTIRILDI") {
      // "Yerleştirildi" = fiilen randevu oluşturma. Durum, randevu formu
      // başarıyla kaydedilene kadar değişmez (bkz. createAppointment).
      const entry = waitlist.find((w) => w.id === entryId);
      if (!entry) return;
      setShowWaitlistModal(false);
      resetForm();
      setPatientId(entry.patient.id);
      setPatientSearch(entry.patient.fullName);
      setNote(entry.note ? `Bekleme listesinden: ${entry.note}` : "Bekleme listesinden yerleştirildi");
      const preferred = entry.preferredFrom ? new Date(entry.preferredFrom) : new Date();
      setStartAt(toLocalInput(preferred));
      setDurationMinutes(slotInterval);
      if (entry.doctor?.id) {
        setNewDoctorId(entry.doctor.id);
        setDoctorQuery(entry.doctor.fullName);
      }
      setPendingWaitlistId(entryId);
      setShowForm(true);
      showToastSafe({ title: "Randevu oluşturun", message: "Randevuyu kaydedince bekleme listesi otomatik güncellenecek.", type: "success" });
      return;
    }

    const res = await fetch(`/api/waitlist/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { showToastSafe({ title: "Hata", message: "Güncellenemedi", type: "error" }); return; }
    const json = await res.json();
    setWaitlist((prev) => prev.map((w) => (w.id === entryId ? json : w)));
  };

  const removeWaitlistEntry = async (entryId: string) => {
    if (!(await confirmDialog({ message: "Bu kayıt bekleme listesinden kaldırılsın mı?", danger: true, confirmText: "Kaldır" }))) return;
    const res = await fetch(`/api/waitlist/${entryId}`, { method: "DELETE" });
    if (!res.ok) { showToastSafe({ title: "Hata", message: "Kaldırılamadı", type: "error" }); return; }
    setWaitlist((prev) => prev.filter((w) => w.id !== entryId));
  };

  const activeWaitlist = useMemo(() => waitlist.filter((w) => w.status === "BEKLIYOR" || w.status === "ARANDI"), [waitlist]);

  // Online randevu talepleri
  const [bookingRequests, setBookingRequests] = useState<BookingRequestEntry[]>([]);
  const [showBookingRequestsModal, setShowBookingRequestsModal] = useState(false);
  // Onaylanan talep, randevu gerçekten oluşturulana kadar burada bekler —
  // önceden "Onayla" tek başına durumu ONAYLANDI yapıyor, hiçbir randevu
  // oluşturulmasını gerektirmiyordu (bkz. denetim raporu Tema 4).
  const [pendingBookingRequestId, setPendingBookingRequestId] = useState<string | null>(null);
  const [pendingWaitlistId, setPendingWaitlistId] = useState<string | null>(null);

  const loadBookingRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/booking-requests", { cache: "no-store" });
      if (!res.ok) { setError("Online randevu talepleri yüklenemedi."); setBookingRequests([]); return; }
      const json = await res.json().catch(() => []);
      setBookingRequests(Array.isArray(json) ? json : []);
    } catch {
      setBookingRequests([]);
    }
  }, []);

  useEffect(() => {
    if (showBookingRequestsModal) void loadBookingRequests();
  }, [showBookingRequestsModal, loadBookingRequests]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      if (!showBookingRequestsModal) return;
      timer = setTimeout(() => void loadBookingRequests(), 300);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [loadBookingRequests, showBookingRequestsModal]);

  const respondBookingRequest = async (requestId: string, status: "ONAYLANDI" | "REDDEDILDI") => {
    if (status === "REDDEDILDI") {
      if (!(await confirmDialog({ message: "Bu online randevu talebi reddedilsin mi? Hasta tekrar talep göndermeniz gerekir.", danger: true, confirmText: "Reddet" }))) return;
      const res = await fetch(`/api/booking-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { showToastSafe({ title: "Hata", message: "Güncellenemedi", type: "error" }); return; }
      setBookingRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToastSafe({ title: "Reddedildi", message: "Talep güncellendi.", type: "success" });
      return;
    }

    // Onaylama = fiilen randevu oluşturma. Talep durumu, randevu formu
    // başarıyla kaydedilene kadar BEKLIYOR'da kalır (bkz. createAppointment).
    const request = bookingRequests.find((r) => r.id === requestId);
    if (!request) return;
    setShowBookingRequestsModal(false);
    resetForm();
    setPatientSearch(request.fullName || "");
    setNote(`Online talep: ${request.fullName} (${request.phone}${request.tcNo ? `, TC ${request.tcNo}` : ""})${request.note ? ` — ${request.note}` : ""}`);
    const preferred = request.preferredFrom ? new Date(request.preferredFrom) : new Date();
    setStartAt(toLocalInput(preferred));
    setDurationMinutes(slotInterval);
    if (request.doctor?.id) {
      setNewDoctorId(request.doctor.id);
      setDoctorQuery(request.doctor.fullName);
    }
    setPendingBookingRequestId(requestId);
    setShowForm(true);
    showToastSafe({ title: "Randevu oluşturun", message: "Hastayı seçip randevuyu kaydedince talep otomatik onaylanacak.", type: "success" });
  };

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
    if (person.role === "DOKTOR") return true;
    if (person.role === "YONETICI") return !Boolean(person.profile?.hideAsDoctor);
    return false;
  }, []);

  const selectedTreatmentMeta = useMemo(() => getTreatmentMeta(treatmentKey), [treatmentKey]);
  const filteredTreatmentOptions = useMemo(() => {
    const q = treatmentQuery.trim().toLowerCase();
    if (!q) return treatmentOptions;
    return treatmentOptions.filter((item) => item.label.toLowerCase().includes(q));
  }, [treatmentQuery, treatmentOptions]);

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
    return buildScheduleByJsDay(calendarSettings.dailySchedules);
  }, [calendarSettings.dailySchedules]);

  const blockValidationError = useMemo(() => {
    if (!blockDate || !blockStartTime || !blockEndTime) return null;
    const clinicHoursError = checkLocalWorkingHoursInterval({
      date: blockDate,
      startTime: blockStartTime,
      endTime: blockEndTime,
      dailySchedules: calendarSettings.dailySchedules,
      actionLabel: "Zaman kapatma kaydı",
    });
    if (clinicHoursError) return clinicHoursError;
    const doctor = staff.find((item) => item.id === blockDoctorId);
    return checkDoctorLocalHoursInterval(
      blockStartTime,
      blockEndTime,
      doctor?.profile?.workStart,
      doctor?.profile?.workEnd,
      doctor?.fullName
    );
  }, [blockDate, blockStartTime, blockEndTime, blockDoctorId, calendarSettings.dailySchedules, staff]);

  // Yeni randevu formundaki tarih/saat/doktor seçimi mesai/tatil dışına
  // düşüyorsa, "Zamanı Kapat" modalindeki gibi kaydetmeden önce anlık uyarı
  // gösterir — kullanıcı formu doldurup göndermeden önce sorunu görür.
  const newAppointmentValidationError = useMemo(() => {
    if (!startAt || !newDoctorId) return null;
    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) return null;
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);
    const workingHoursError = checkWorkingHoursInterval(startDate, endDate, calendarSettings.dailySchedules);
    if (workingHoursError) return workingHoursError;
    const selectedDoctor = staff.find((item) => item.id === newDoctorId);
    return checkDoctorWorkingHoursInterval(
      startDate,
      endDate,
      selectedDoctor?.profile?.workStart,
      selectedDoctor?.profile?.workEnd,
      selectedDoctor?.fullName
    );
  }, [startAt, newDoctorId, durationMinutes, calendarSettings.dailySchedules, staff]);

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
    const exact = treatmentOptions.find((item) => item.label.toLowerCase() === q);
    if (exact) return exact.value;
    const included = treatmentOptions.find((item) => item.label.toLowerCase().includes(q));
    return included?.value || treatmentOptions[0]?.value || "DIGER";
  }, [treatmentOptions]);

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

    // Hasta listesi/hasta detayından "Randevu Oluştur" ile gelindiğinde hasta
    // ikinci kez aranmasın diye form önceden dolu açılır (bkz. ürün denetimi
    // — hasta bağlamından randevu oluşturma daha önce tamamen kopuktu).
    const qpNewPatientId = searchParams.get("newPatientId");
    const qpNewPatientName = searchParams.get("newPatientName");
    if (qpNewPatientId && canCreateAppointments) {
      setPatientId(qpNewPatientId);
      setPatientSearch(qpNewPatientName || "");
      setShowForm(true);
      const next = new URLSearchParams(Array.from(searchParams.entries()));
      next.delete("newPatientId");
      next.delete("newPatientName");
      router.replace(`?${next.toString()}`, { scroll: false });
    }
  }, [searchParams, view, date, doctorId, focusAppointmentId, canCreateAppointments, router]);

  // Tek doktorlu klinikte her yeni randevuda ayrıca doktor aratmak gereksiz
  // bir adımdı (bkz. ürün denetimi) — tek bir hekim varsa form açılınca
  // otomatik seçili gelir, kullanıcı yine de değiştirebilir.
  useEffect(() => {
    if (showForm && staff.length === 1 && !newDoctorId) {
      setNewDoctorId(staff[0].id);
      setDoctorQuery(staff[0].fullName);
    }
  }, [showForm, staff, newDoctorId]);

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
        const res = await fetch("/api/patients?q=" + encodeURIComponent(patientSearch.trim()) + "&take=10&summary=false");
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
        const res = await fetch("/api/patients?q=" + encodeURIComponent(editPatientSearch.trim()) + "&take=10&summary=false");
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
      const fromDate = toLocalDateKey(currentRange.from);
      const toDate = toLocalDateKey(currentRange.to);

      // /api/auth/me burada kasıtlı olarak önbelleklenmiyor: canCreateAppointments
      // randevu oluşturma butonunu gösterip gizleyen bir yetki kontrolü — 60sn'lik
      // önbellek, yetkisi az önce alınan bir kullanıcıya bir dakikaya kadar
      // "randevu oluştur" butonunu yanlışlıkla göstermeye devam edebilirdi.
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
        cachedGet<any>("/api/staff", 60_000)
          .then((sJson) => {
            const staffList = Array.isArray(sJson) ? sJson : (sJson?.staff || []);
            const filteredStaff = staffList.filter((x: Staff & { profile?: { hideAsDoctor?: boolean } | null; isActive?: boolean }) => isBookableDoctor(x));
            setStaff(filteredStaff);
          })
          .catch(() => {}),
        cachedGet<any>("/api/settings", 60_000)
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
              if (Array.isArray(raw) && raw.length > 0) {
                return normalizeDailySchedules(raw, settingsJson?.lunchStart || "", settingsJson?.lunchEnd || "");
              }
              if (typeof raw === "string") {
                try {
                  const parsed = JSON.parse(raw);
                  return normalizeDailySchedules(parsed, settingsJson?.lunchStart || "", settingsJson?.lunchEnd || "");
                } catch {
                  return normalizeDailySchedules(FALLBACK_DAILY_SCHEDULES, settingsJson?.lunchStart || "", settingsJson?.lunchEnd || "");
                }
              }
              return normalizeDailySchedules(FALLBACK_DAILY_SCHEDULES, settingsJson?.lunchStart || "", settingsJson?.lunchEnd || "");
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
          .then(async (r) => {
            if (!r.ok) {
              // Kapalı zaman listesi yüklenemezse çakışma kontrolü eksik kalır.
              // bir saate randevu yazılmasına yol açabilir, o yüzden görünür şekilde uyar.
              setError("Doktorun kapalı zamanları yüklenemedi. Çakışma kontrolü için sayfayı yenileyin.");
              setDoctorBlocks([]);
              return;
            }
            const blocksJson = await r.json();
            setDoctorBlocks(Array.isArray(blocksJson) ? blocksJson : []);
          })
          .catch(() => {
            setError("Doktorun kapalı zamanları yüklenemedi. Çakışma kontrolü için sayfayı yenileyin.");
            setDoctorBlocks([]);
          }),
        fetch("/api/treatment-types", { cache: "no-store" })
          .then((r) => r.json())
          .then((typesJson) => {
            const list = Array.isArray(typesJson) ? typesJson : [];
            const active = list.filter((t: { isActive?: boolean }) => t.isActive !== false);
            if (active.length > 0) {
              setTreatmentOptions(active.map((t: { value: string; label: string; color: string }) => ({
                value: t.value,
                label: t.label,
                color: t.color,
                badge: "",
              })));
            }
          })
          .catch(() => {}),
        cachedGet<ClinicUnit[]>("/api/clinic-units", 60_000)
          // Pasife alınmış bir ünite eski randevudan sessizce düşmemeli. Yeni
          // randevularda yalnızca aktif üniteler gösterilir; düzenlemede mevcut
          // atama korunarak geçmiş takibi kesintisiz kalır.
          .then((items) => setClinicUnits(Array.isArray(items) ? items : []))
          .catch(() => setClinicUnits([])),
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

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!focusAppointmentId) return;
    const found = appointments.find((a) => a.id === focusAppointmentId);
    if (found) {
      setSelectedAppt(found);
      setFocusAppointmentId(null);
      // URL'deki focusAppointmentId temizlenmezse, bir sonraki render'da yukarıdaki
      // searchParams senkron effect'i onu tekrar okuyup modalı sonsuz döngüde
      // yeniden açıyordu (kapat butonu bu yüzden işe yaramıyormuş gibi görünüyordu).
      if (typeof window !== "undefined") {
        const next = new URLSearchParams(window.location.search);
        next.delete("focusAppointmentId");
        const qs = next.toString();
        router.replace(`/randevu${qs ? `?${qs}` : ""}`, { scroll: false });
      }
    }
  }, [appointments, focusAppointmentId, router]);

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

  // "Yeni Randevu" formu gerçek veri girişi içerir — ESC/dış tıklama ile
  // yanlışlıkla kapatılırsa girilen hasta/hekim/not bilgileri sessizce
  // kaybolmamalı (bkz. src/components/ui/Modal.tsx isDirty sözleşmesi).
  // startAt/durationMinutes dahil EDİLMEZ: bunlar tıklanan takvim hücresinden
  // otomatik dolduruluyor, kullanıcı hiçbir şey yazmasa bile her zaman
  // değerli olur — dirty sayılırsa modal her açılışta "kirli" görünürdü.
  const newAppointmentDirty = Boolean(
    patientId || patientSearch.trim() || newDoctorId || note.trim() || treatmentKey !== "MUAYENE"
  );

  async function requestCloseNewAppointment() {
    if (newAppointmentDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setShowForm(false);
    resetForm();
  }

  const resetForm = () => {
    setPatientId(""); setPatientSearch(""); setPatientResults([]); setPatientDropdownOpen(false);
    setNewDoctorId(""); setNewClinicUnitId(""); setNote(""); setConflictWarning(null); setConflictSuggestions([]); setTreatmentKey("MUAYENE");
    setTreatmentQuery(getTreatmentMeta("MUAYENE").label);
    setDoctorQuery(""); setDoctorDropdownOpen(false); setTreatmentDropdownOpen(false);
    setDurationMinutes(slotInterval);
    setPendingBookingRequestId(null);
    setPendingWaitlistId(null);
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

  // Yalnızca düzenleme modundayken (salt görüntüleme/durum güncelleme
  // görünümünde değil) ve gerçekten bir alan değiştiyse dirty sayılır.
  const editAppointmentDirty = editMode && JSON.stringify({
    patientId: editPatientId,
    doctorId: editDoctorId,
    clinicUnitId: editClinicUnitId,
    startAt: editStartAt,
    durationMinutes: editDurationMinutes,
  }) !== editSnapshotRef.current;

  async function requestCloseAppointmentModal() {
    if (editAppointmentDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    closeAppointmentModal();
  }

  async function requestCancelEdit() {
    if (editAppointmentDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setEditMode(false);
    setError(null);
  }

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
    const workingHoursError = checkWorkingHoursInterval(
      startDate,
      endDate,
      calendarSettings.dailySchedules
    );
    if (workingHoursError) {
      setError(workingHoursError);
      return;
    }
    const selectedDoctor = staff.find((item) => item.id === newDoctorId);
    const doctorHoursError = checkDoctorWorkingHoursInterval(
      startDate,
      endDate,
      selectedDoctor?.profile?.workStart,
      selectedDoctor?.profile?.workEnd,
      selectedDoctor?.fullName
    );
    if (doctorHoursError) {
      setError(doctorHoursError);
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await submitAppointmentWithConflictConfirm("/api/appointments", "POST", {
        patientId,
        doctorId: newDoctorId,
        clinicUnitId: newClinicUnitId || null,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        type: "STANDART",
        colorCode: resolvedTreatmentMeta.color,
        note: buildAppointmentNote("YOK", note, resolvedTreatmentKey),
        smsInfo,
        smsReminder,
        smsSurvey,
      });
      const responseBody = await res.json().catch(() => ({ message: "Kaydedilemedi" }));
      if (!res.ok) {
        if (!responseBody.requiresConfirmation) setError(responseBody.message || "Kaydedilemedi");
        return;
      }

      if (pendingBookingRequestId) {
        const requestId = pendingBookingRequestId;
        setPendingBookingRequestId(null);
        await fetch(`/api/booking-requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ONAYLANDI", appointmentId: responseBody.id }),
        }).catch(() => {});
        setBookingRequests((prev) => prev.filter((r) => r.id !== requestId));
      }

      if (pendingWaitlistId) {
        const waitlistId = pendingWaitlistId;
        setPendingWaitlistId(null);
        await fetch(`/api/waitlist/${waitlistId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "YERLESTIRILDI", appointmentId: responseBody.id }),
        }).catch(() => {});
        setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));
      }

      setShowForm(false); resetForm();
      const smsStatus = responseBody.smsStatus;
      const smsMessages = [
        smsStatus?.infoMessage,
        smsStatus?.reminderMessage,
        smsStatus?.surveyMessage,
      ].filter(Boolean).join(" ");
      showToastSafe({
        title: "Randevu oluşturuldu",
        message: smsMessages || "Randevu takvime eklendi.",
        type: smsStatus?.info === "failed" ? "error" : "success",
        icon: STATUS_ACTION_ICON["appointment-created"],
      });
      await load();
    } catch {
      setError("Bağlantı hatası — randevu kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (status === "IPTAL" && !(await confirmDialog({ message: "Randevu iptal edilsin mi?", danger: true, confirmText: "İptal Et" }))) return;

    const res = await fetch("/api/appointments/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Durum güncellenemedi" }));
      setError(body.message || "Durum güncellenemedi");
      return;
    }
    setSelectedAppt(null);
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
    // DELETE uç noktası veriyi silmez, durumu İPTAL yapar (bkz. api/appointments/[id]/route.ts) —
    // diyalog metni de bunu yansıtır, aksi halde "Sil" gerçekten kalıcı silme sanılırdı.
    if (!(await confirmDialog({ message: "Randevu iptal edilsin mi? Kayıt silinmez, geçmişte görünmeye devam eder.", danger: true, confirmText: "İptal Et" }))) return;
    const res = await fetch("/api/appointments/" + id, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Randevu iptal edilemedi" }));
      setError(body.message || "Randevu iptal edilemedi");
      return;
    }
    setSelectedAppt(null);
    await load();
  };

  const openEditMode = () => {
    if (!selectedAppt) return;
    const nextEditPatientId = selectedAppt.patient?.id || "";
    const nextEditDoctorId = selectedAppt.doctor?.id || "";
    const nextEditClinicUnitId = selectedAppt.clinicUnit?.id || "";
    const startDate = new Date(selectedAppt.startAt);
    const endDate = new Date(selectedAppt.endAt);
    const dur = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    const nextEditStartAt = toLocalInput(startDate);
    const nextEditDurationMinutes = dur > 0 ? dur : slotInterval;

    setEditPatientId(nextEditPatientId);
    setEditPatientSearch(selectedAppt.patient?.fullName || "");
    setEditPatientResults([]);
    setEditPatientDropdownOpen(false);
    setEditDoctorId(nextEditDoctorId);
    setEditDoctorQuery(selectedAppt.doctor?.fullName || "");
    setEditDoctorDropdownOpen(false);
    setEditClinicUnitId(nextEditClinicUnitId);
    setEditStartAt(nextEditStartAt);
    setEditDurationMinutes(nextEditDurationMinutes);
    setEditMode(true);
    // API'den gelen ilk değerler yanlışlıkla dirty sayılmamalı — düzenleme
    // moduna girildiği andaki değerler "temiz başlangıç" olarak saklanır.
    editSnapshotRef.current = JSON.stringify({
      patientId: nextEditPatientId,
      doctorId: nextEditDoctorId,
      clinicUnitId: nextEditClinicUnitId,
      startAt: nextEditStartAt,
      durationMinutes: nextEditDurationMinutes,
    });
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
    const workingHoursError = checkWorkingHoursInterval(
      startDate,
      endDate,
      calendarSettings.dailySchedules
    );
    if (workingHoursError) {
      setError(workingHoursError);
      return;
    }
    const selectedDoctor = staff.find((item) => item.id === editDoctorId);
    const doctorHoursError = checkDoctorWorkingHoursInterval(
      startDate,
      endDate,
      selectedDoctor?.profile?.workStart,
      selectedDoctor?.profile?.workEnd,
      selectedDoctor?.fullName
    );
    if (doctorHoursError) {
      setError(doctorHoursError);
      return;
    }
    const parsed = parseAppointmentNote(selectedAppt.note);
    const treatmentMeta = getTreatmentMeta(parsed.treatment);
    setEditSaving(true); setError(null);
    try {
      const res = await submitAppointmentWithConflictConfirm("/api/appointments/" + selectedAppt.id, "PUT", {
        patientId: editPatientId,
        doctorId: editDoctorId,
        clinicUnitId: editClinicUnitId || null,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        type: selectedAppt.type,
        status: selectedAppt.status,
        colorCode: treatmentMeta.color || selectedAppt.colorCode || "#2a9d8f",
        note: selectedAppt.note || "",
        // smsInfo/smsReminder/smsSurvey kasıtlı olarak gönderilmiyor — sunucu bu
        // düzenleme isteğinde hastanın mevcut iletişim tercihlerini korur (bkz.
        // src/app/api/appointments/[id]/route.ts).
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Güncelleme başarısız" }));
        if (!body.requiresConfirmation) setError(body.message || "Güncelleme başarısız");
        return;
      }
      const movedId = selectedAppt.id;
      setEditMode(false);
      setSelectedAppt(null);
      await load();
      showToastSafe({ title: "Randevu güncellendi", message: "Yeni tarih/saat kaydedildi.", type: "success", icon: STATUS_ACTION_ICON["appointment-rescheduled"] });
      setJustMovedApptId(movedId);
      window.setTimeout(() => setJustMovedApptId(prev => prev === movedId ? null : prev), 400);
    } catch {
      setError("Bağlantı hatası — randevu güncellenemedi. Lütfen tekrar deneyin.");
    } finally {
      setEditSaving(false);
    }
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
    const movedApptId = draggedApptId;
    try {
      const res = await submitAppointmentWithConflictConfirm("/api/appointments/" + draggedApptId, "PUT", {
        patientId: appt.patient?.id || "",
        doctorId: newDocId || appt.doctor?.id || "",
        clinicUnitId: appt.clinicUnit?.id || null,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        type: appt.type,
        status: appt.status,
        colorCode: treatmentMeta.color || appt.colorCode || "#2a9d8f",
        note: appt.note || "",
        // smsInfo/smsReminder/smsSurvey kasıtlı olarak gönderilmiyor — sunucu bu
        // taşıma isteğinde hastanın mevcut iletişim tercihlerini korur (bkz.
        // src/app/api/appointments/[id]/route.ts).
      });
      if (res.ok) {
        await load();
        setJustMovedApptId(movedApptId);
        window.setTimeout(() => setJustMovedApptId(prev => prev === movedApptId ? null : prev), 400);
        return;
      }
      const body = await res.json().catch(() => ({ message: "Güncelleme başarısız" }));
      if (!body.requiresConfirmation) {
        setError(body.message || "Güncelleme başarısız");
        setDropRejectedApptId(movedApptId);
        window.setTimeout(() => setDropRejectedApptId(prev => prev === movedApptId ? null : prev), 260);
      }
    } catch {
      setError("Bağlantı hatası — randevu taşınamadı. Lütfen tekrar deneyin.");
      setDropRejectedApptId(movedApptId);
      window.setTimeout(() => setDropRejectedApptId(prev => prev === movedApptId ? null : prev), 260);
    } finally {
      setDraggedApptId(null); setDragOverKey(null); setDragOverInvalid(null);
    }
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

  const getContinuingApptForSlot = (docId: string | null, slotTime: string, forDate: Date) => {
    const [h, m] = slotTime.split(":").map(Number);
    const slotStart = new Date(forDate);
    slotStart.setHours(h, m, 0, 0);

    return appointments.filter((a) => {
      if (a.status === "IPTAL") return false;
      if (docId && a.doctor?.id !== docId) return false;
      const start = new Date(a.startAt);
      const end = new Date(a.endAt);
      const sameDay = start.getFullYear() === forDate.getFullYear()
        && start.getMonth() === forDate.getMonth()
        && start.getDate() === forDate.getDate();
      if (!sameDay) return false;
      const startsAtSlot = start.getTime() === slotStart.getTime();
      return !startsAtSlot && start < slotStart && end > slotStart;
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
    if (view === "GUN") {
      // Kapalı/tatil günleri tamamen atla — kullanıcı zaten hiçbir işlem
      // yapamayacağı bir günün boş "tatil" ekranına düşmemeli.
      let guard = 0;
      do {
        d.setDate(d.getDate() + dir);
        guard++;
      } while (workingDayIndexes.size > 0 && !workingDayIndexes.has(d.getDay()) && guard < 366);
    } else if (view === "AJANDA") d.setDate(d.getDate() + dir);
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
    const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const blockHit = doctorBlocks.find(b => b.doctorId === targetDoctorId && b.date === dateKey && slotTime >= b.startTime && slotTime < b.endTime) || null;

    const warning = overlaps.length > 0
      ? `Bu aralıkta (${slotTime}, ${targetDurationMinutes} dk) ${overlaps.length} çakışan randevu var: ${overlaps.map((a) => a.patient?.fullName || "Hasta").join(", ")}.`
      : blockHit
      ? `Doktor bu saatte bloke edilmiş (${blockHit.startTime}–${blockHit.endTime}${blockHit.reason ? `: ${blockHit.reason}` : ""}).`
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
  }, [appointments, slotTimes, doctorBlocks]);

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
          durum: STATUS_LABELS[getDisplayAppointmentStatus(a.status, a.startAt)] || a.status,
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

    // Ham durum anahtarları değişmedi (DB'de hâlâ BEKLIYOR/GELDI/TAMAMLANDI/
    // GELMEDI/IPTAL) ama ekrandaki anlamları değişti — bkz. src/lib/appointment-status.ts:
    // ham BEKLIYOR artık "Planlandı" (mavi), ham GELDI artık "Bekliyor" (sarı,
    // hasta geldi/bekliyor), TAMAMLANDI (yeşil) yeni bir gerçek durum.
    const statusStyle: Record<string, string> = {
      BEKLIYOR:   "background:#DBEAFE;color:#1E40AF;font-weight:600;",
      GELDI:      "background:#FEF3C7;color:#92400E;font-weight:600;",
      TAMAMLANDI: "background:#D1FAE5;color:#065F46;font-weight:600;",
      GELMEDI:    "background:#FEE2E2;color:#991B1B;font-weight:600;",
      IPTAL:      "background:#F1F5F9;color:#475569;font-weight:600;",
    };

    const now = new Date();
    const statusCounts = { BEKLIYOR: 0, GELDI: 0, TAMAMLANDI: 0, GELMEDI: 0, IPTAL: 0 };
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
      Randevu Çizelgesi
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
    <td style="background:#DBEAFE;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#1E40AF;">
      Planlandı: <b>${statusCounts.BEKLIYOR}</b>
    </td>
    <td style="background:#FEF3C7;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#92400E;">
      Bekliyor: <b>${statusCounts.GELDI}</b>
    </td>
    <td style="background:#D1FAE5;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#065F46;">
      Tamamlandı: <b>${statusCounts.TAMAMLANDI}</b>
    </td>
    <td style="background:#FEE2E2;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#991B1B;">
      Gelmedi: <b>${statusCounts.GELMEDI}</b>
    </td>
    <td colspan="2" style="background:#F1F5F9;padding:6px 16px;font-size:12px;border:1px solid #E2E8F0;color:#475569;">
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
      Bu çizelge ${now.toLocaleString("tr-TR")} tarihinde oluşturulmuştur.
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
      BEKLIYOR:   "background:#DBEAFE;color:#1E40AF;",
      GELDI:      "background:#FEF3C7;color:#92400E;",
      TAMAMLANDI: "background:#D1FAE5;color:#065F46;",
      GELMEDI:    "background:#FEE2E2;color:#991B1B;",
      IPTAL:      "background:#F1F5F9;color:#475569;",
    };

    const statusCounts = { BEKLIYOR: 0, GELDI: 0, TAMAMLANDI: 0, GELMEDI: 0, IPTAL: 0 };
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
    .stat-plan  { background: #DBEAFE; border-color: #BFDBFE; color: #1E40AF; }
    .stat-bek   { background: #FEF3C7; border-color: #FDE68A; color: #92400E; }
    .stat-tam   { background: #D1FAE5; border-color: #A7F3D0; color: #065F46; }
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
      <div class="logo-name">Randevu Çizelgesi</div>
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
    <div class="stat-box stat-plan">
      <div class="stat-num">${statusCounts.BEKLIYOR}</div>
      <div class="stat-lbl">Planlandı</div>
    </div>
    <div class="stat-box stat-bek">
      <div class="stat-num">${statusCounts.GELDI}</div>
      <div class="stat-lbl">Bekliyor</div>
    </div>
    <div class="stat-box stat-tam">
      <div class="stat-num">${statusCounts.TAMAMLANDI}</div>
      <div class="stat-lbl">Tamamlandı</div>
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
    <span>Bu çıktı randevu çizelgesinden üretilmiştir.</span>
    <span>${now.toLocaleString("tr-TR")}</span>
  </div>
</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
  };

  // Odalara asılmak üzere basit bir günlük çizelge: doktor başlığı, altında
  // saat + hasta adı + tedavi detayı. Muhasebe/istatistik amaçlı ayrıntılı
  // yazdırma (printReport) ile karıştırılmasın diye ayrı, kasıtlı olarak
  // minimal bir çıktı.
  const printRoomSchedule = () => {
    if (view !== "GUN") {
      setError("Oda listesi yalnızca Gün görünümünde kullanılabilir.");
      return;
    }
    const esc = (v: string) =>
      v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

    const activeRows = reportRows.filter((r) => r.durum !== STATUS_LABELS.IPTAL && r.durum !== STATUS_LABELS.GELMEDI);

    const byDoctor = new Map<string, typeof reportRows>();
    activeRows.forEach((r) => {
      const list = byDoctor.get(r.doktor) || [];
      list.push(r);
      byDoctor.set(r.doktor, list);
    });

    const dateLabel = `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    const sections = Array.from(byDoctor.entries()).map(([doktor, rows]) => `
      <div class="doctor-section">
        <div class="doctor-name">${esc(doktor)}</div>
        <div class="doctor-date">${esc(dateLabel)}</div>
        <table class="room-table">
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td class="saat">${esc(r.saat)}</td>
                <td class="hasta">${esc(r.hasta)}</td>
                <td class="tedavi">${esc(r.tedavi)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `).join("");

    const printWindow = window.open("", "_blank", "width=900,height=1000");
    if (!printWindow) {
      setError("Yazdırma penceresi açılamadı. Tarayıcı popup iznini kontrol edin.");
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Oda Listesi - ${esc(dateLabel)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0F172A; }
    .doctor-section { padding: 14mm 12mm; page-break-after: always; }
    .doctor-section:last-child { page-break-after: auto; }
    .doctor-name { font-size: 26px; font-weight: 800; }
    .doctor-date { font-size: 13px; color: #475569; margin-top: 2px; margin-bottom: 14px; }
    .room-table { width: 100%; border-collapse: collapse; }
    .room-table td { border-bottom: 1px solid #CBD5E1; padding: 10px 6px; font-size: 15px; vertical-align: top; }
    .room-table .saat { font-weight: 700; white-space: nowrap; width: 70px; }
    .room-table .hasta { font-weight: 600; }
    .room-table .tedavi { color: #475569; text-align: right; white-space: nowrap; }
    @media print { .doctor-section { page-break-after: always; } }
  </style>
</head>
<body>
${sections || `<div class="doctor-section"><p>Kayıt bulunamadı.</p></div>`}
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

  // Kişisel çalışma saati dışını takvimde işaretler; API aynı aralığı kesin
  // olarak reddeder.
  const isOutsideDoctorHours = useCallback((docId: string, slotTime: string): boolean => {
    const doc = staff.find(s => s.id === docId);
    if (!doc?.profile?.workStart && !doc?.profile?.workEnd) return false;
    const start = doc.profile?.workStart || "08:30";
    const end = doc.profile?.workEnd || "18:00";
    return slotTime < start || slotTime >= end;
  }, [staff]);

  const deleteBlock = async (id: string) => {
    if (!(await confirmDialog({ message: "Bu kapalı zaman kaydı silinsin mi?", danger: true, confirmText: "Sil" }))) return;
    const res = await fetch("/api/doctor-blocks?id=" + id, { method: "DELETE" });
    if (!res.ok) {
      setError("Kapalı zaman kaydı silinemedi.");
      return;
    }
    await load();
  };

  // Kapalı zaman aralığından tek bir slotu (örn. sadece 13:30) açar; kalan
  // parçalar API tarafında ayrı DoctorBlock kayıtlarına bölünür.
  const deleteBlockSlot = async (id: string, slotTime: string) => {
    if (!(await confirmDialog({ message: `${slotTime} saati açılsın mı?`, danger: true, confirmText: "Aç" }))) return;
    const slotStart = slotTime;
    const slotEnd = toSlotLabel(parseTimeToMinutes(slotTime, 0) + slotInterval);
    const res = await fetch(`/api/doctor-blocks?id=${id}&slotStart=${slotStart}&slotEnd=${slotEnd}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Kapalı zaman kaydı silinemedi.");
      return;
    }
    await load();
  };

  // blockDate/Start/End her zaman anlamlı bir varsayılana sahip (bugün,
  // 13:00-17:00), bu yüzden dirty sinyali olarak kullanılmazlar (aksi halde
  // modal her açılışta "kirli" görünürdü) — doktor seçimi ve neden metni
  // gerçek kullanıcı girdisidir.
  const blockModalDirty = Boolean(blockDoctorId || blockReason.trim());

  async function requestCloseBlockModal() {
    if (blockModalDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setShowBlockModal(false);
    setBlockSubmitError(null);
  }

  const saveBlock = async () => {
    if (!blockDoctorId || !blockDate || !blockStartTime || !blockEndTime) return;
    if (blockValidationError) {
      setBlockSubmitError(blockValidationError);
      return;
    }
    setBlockSubmitError(null);
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
      setBlockSubmitError(null);
      await load();
    } else {
      const body = await res.json().catch(() => ({ message: "Zaman kapatma kaydı eklenemedi." }));
      setBlockSubmitError(body.message || "Zaman kapatma kaydı eklenemedi.");
    }
  };

  const apptBlock = (a: Appointment, enableDrag = false) => (
    (() => {
      const parsed = parseAppointmentNote(a.note);
      const meta = getFollowUpMeta(parsed.followUp);
      const treatmentMeta = getTreatmentMeta(parsed.treatment);
      const displayStatus = getDisplayAppointmentStatus(a.status, a.startAt);
      const stale = isStaleWaitingAppointment(a.status, a.startAt);
      const a11yLabel = `${a.patient?.fullName || "Hasta belirtilmemiş"}, ${STATUS_LABELS[displayStatus] || displayStatus}, ${new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}${a.patient?.hasContagiousDisease ? ", bulaşıcı hastalık uyarısı" : ""}${stale ? ", geçmiş tarihli durum işaretlenmemiş" : ""}`;
      return (
    <div key={a.id}
      role="button"
      tabIndex={0}
      aria-label={a11yLabel}
      draggable={enableDrag}
      onDragStart={enableDrag ? (e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; setDraggedApptId(a.id); } : undefined}
      onDragEnd={enableDrag ? () => { setDraggedApptId(null); setDragOverKey(null); setDragOverInvalid(null); } : undefined}
      onClick={() => setSelectedAppt(a)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedAppt(a); } }}
      title={`${a.patient?.fullName || "-"}${a.patient?.hasContagiousDisease ? ` — ⚠ Bulaşıcı Hastalık${a.patient.contagiousDiseaseNote ? `: ${a.patient.contagiousDiseaseNote}` : ""}` : ""} - ${new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}${stale ? " — Geçmiş tarihli, durum işaretlenmemiş" : ""}`}
      className={"randevu-appt-card mb-1 cursor-pointer rounded-md border px-2 py-1 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " + (enableDrag ? "cursor-grab active:cursor-grabbing " : "") + (STATUS_COLORS[displayStatus] || "bg-primary/5 border-l-4 border-l-primary") + (stale ? " ring-1 ring-orange-400" : "") + (draggedApptId === a.id ? " is-dragging" : "") + (justMovedApptId === a.id ? " ui-settle-in" : "") + (dropRejectedApptId === a.id ? " ui-drop-shake" : "")}>
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: treatmentMeta.color }} />
        <span className="shrink-0 text-[10px] leading-none" title={STATUS_LABELS[displayStatus] || displayStatus} aria-hidden="true">{STATUS_ICON[displayStatus] || ""}</span>
        {a.patient?.hasContagiousDisease && <span className="shrink-0 text-[11px]" title="Bulaşıcı Hastalık">⚠</span>}
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-800">{a.patient?.fullName || "-"}</p>
        {stale && <span className="shrink-0 text-[11px]" title="Geçmiş tarihli, durum işaretlenmemiş">⚠</span>}
        <span className="shrink-0 text-[10px] font-bold text-slate-500">
          {new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}
        </span>
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
    <section className="randevu-page space-y-2">
      <div className="randevu-toolbar ui-sidebar-card sticky top-0 z-40 flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-2.5">
        {/* Tarih navigasyonu — tek rafine kontrol grubu */}
        <div className="flex h-9 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-rest)]">
          <button onClick={() => nav(-1)} aria-label="Önceki tarih aralığı" className="flex h-9 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">‹</button>
          <span className="max-w-full shrink-0 truncate border-x border-slate-200 px-3 text-sm font-bold text-slate-800">{navLabel()}</span>
          <button onClick={() => nav(1)} aria-label="Sonraki tarih aralığı" className="flex h-9 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">›</button>
        </div>

        {/* Gün/Hafta/Ay/Ajanda — akıcı aktif gösterge */}
        <div className="flex h-9 items-center gap-0.5 rounded-lg bg-slate-100/80 p-1">
          {(["GUN","HAFTA","AY","AJANDA"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={"ui-view-tab h-7 rounded-md px-2.5 text-sm font-semibold transition-all duration-150 " + (view === mode ? "is-active bg-white text-primary shadow-[0_1px_3px_rgb(15_23_42/0.12)]" : "text-slate-600 hover:text-slate-900")}
            >
              {mode === "GUN" ? "Gün" : mode === "HAFTA" ? "Hafta" : mode === "AY" ? "Ay" : "Ajanda"}
            </button>
          ))}
        </div>

        <select className="h-9 min-w-[170px] rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-[var(--shadow-rest)] focus:border-primary focus:outline-none" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Tüm Doktorlar</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>

        <span className="ml-auto rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
          {appointments.length} kayıt
        </span>
        {doctorBlocks.length > 0 && (
          <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">
            {doctorBlocks.length} kapalı zaman
          </span>
        )}

        <button onClick={() => setShowForm(true)} disabled={!canCreateAppointments} className="ui-interactive h-9 rounded-lg bg-gradient-to-b from-primary to-primary-strong px-3.5 text-sm font-bold text-white shadow-[0_2px_8px_rgb(var(--app-primary)/0.35)] disabled:cursor-not-allowed disabled:opacity-50">+ Yeni Randevu</button>
        {canCreateAppointments && (
          <button onClick={() => { setBlockSubmitError(null); setShowBlockModal(true); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-[var(--shadow-rest)] transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700">Zamanı Kapat</button>
        )}
        <button onClick={() => setShowWaitlistModal(true)} className="relative h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-[var(--shadow-rest)] transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700" title="Randevu bekleme listesini aç">
          Bekleme
          {activeWaitlist.length > 0 && (
            <span className="ml-1.5 rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeWaitlist.length}</span>
          )}
        </button>
        <button onClick={() => setShowBookingRequestsModal(true)} className="relative h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-[var(--shadow-rest)] transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700" title="Online randevu taleplerini aç">
          Online Talepler
          {bookingRequests.length > 0 && (
            <span className="ml-1.5 rounded-full bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{bookingRequests.length}</span>
          )}
        </button>
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-[var(--shadow-rest)] hover:bg-slate-50">
            Dışa Aktar
          </summary>
          <div className="absolute right-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              onClick={(event) => {
                printReport();
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              disabled={!canExportOrPrint}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Randevu çizelgesini yazdır"}
            >
              Yazdır
            </button>
            <button
              onClick={(event) => {
                downloadExcelReport();
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              disabled={!canExportOrPrint}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Excel olarak dışa aktar"}
            >
              Excel
            </button>
            <button
              onClick={(event) => {
                printRoomSchedule();
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              disabled={view !== "GUN"}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={view !== "GUN" ? "Sadece Gün görünümünde kullanılabilir" : "Odalara asılacak sade liste (doktor + saat + hasta + tedavi)"}
            >
              Oda Listesi
            </button>
          </div>
        </details>
      </div>

      <Modal
        module="calendar"
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        isDirty={newAppointmentDirty}
        title="Yeni Randevu"
        description="Hasta, hekim, tedavi ve zaman bilgilerini tek kayıtta planlayın."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseNewAppointment()}>İptal</Button>
            <Button variant="primary" onClick={createAppointment} loading={saving} disabled={Boolean(newAppointmentValidationError)}>
              {saving ? "Kaydediliyor..." : "Randevu Ekle"}
            </Button>
          </>
        }
      >
          {conflictWarning && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-yellow-500" aria-hidden="true" />
              <span>{conflictWarning}</span>
            </div>
          )}
          {conflictSuggestions.length > 0 && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary-strong">
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
                    className="rounded-md border border-primary/30 bg-white px-2 py-0.5 font-semibold text-primary hover:bg-primary/10"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="mb-2 text-red-600 text-sm">{error}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {/* Hasta Arama Combobox */}
            <div className="relative">
              <p className="mb-1.5 text-xs font-bold text-slate-600">Hasta <span className="text-red-500">*</span></p>
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
                    aria-label="Hasta seçimini temizle"
                    className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-base leading-none text-slate-400 hover:text-red-500">
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
              <p className="mb-1.5 text-xs font-bold text-slate-600">Hekim <span className="text-red-500">*</span></p>
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
              <p className="mb-1.5 text-xs font-bold text-slate-600">Tedavi</p>
              <input
                type="text"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Tedavi ara veya seç"
                value={treatmentQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setTreatmentQuery(value);
                  setTreatmentDropdownOpen(true);
                  const exact = treatmentOptions.find((item) => item.label.toLowerCase() === value.trim().toLowerCase());
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
            {clinicUnits.some((unit) => unit.isActive) && (
              <label>
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Tedavi alanı <span className="font-medium text-slate-400">(isteğe bağlı)</span></span>
                <select
                  value={newClinicUnitId}
                  onChange={(event) => setNewClinicUnitId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label="Tedavi alanı"
                >
                  <option value="">Koltuk / oda seçilmedi</option>
                  {clinicUnits.filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.code ? ` · ${unit.code}` : ""}</option>)}
                </select>
              </label>
            )}
            <label>
              <span className="mb-1.5 block text-xs font-bold text-slate-600">Tarih ve saat <span className="text-red-500">*</span></span>
              <input type="datetime-local" className="w-full rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={e => setStartAt(e.target.value)} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-slate-600">Süre</span>
              <select className="w-full rounded-lg border px-3 py-2 text-sm" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}>
                {durationOptions.map((option) => (
                  <option key={option} value={option}>{option} dk</option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-600">Tedavi etiketi</span>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
                <span className="inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: selectedTreatmentMeta.color }}>
                  <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                  {selectedTreatmentMeta.label}
                </span>
              </div>
            </div>
          </div>
          {newAppointmentValidationError && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">{newAppointmentValidationError}</p>
          )}
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Randevu notu <span className="font-medium text-slate-400">(isteğe bağlı)</span></span>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Kısa bir not ekleyin" rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <div className="mt-2 flex flex-wrap gap-4">
            {[["smsInfo","Bilgilendirme SMS",smsInfo,setSmsInfo],["smsReminder","Hatırlatma SMS",smsReminder,setSmsReminder],["smsSurvey","Değerlendirme SMS",smsSurvey,setSmsSurvey]].map(([k,lbl,val,set]:any) => (
              <label key={k} className="flex items-center gap-1 text-sm cursor-pointer">
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="accent-primary" />{lbl}
              </label>
            ))}
          </div>
      </Modal>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}
      {loading && (
        <span className="sr-only" role="status" aria-live="polite">Randevular güncelleniyor</span>
      )}
      <div aria-busy={loading}>
      {view === "GUN" && workingDayIndexes.has(date.getDay()) && (
        <div className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-surface)]">
          <table className="randevu-grid min-w-[980px] border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-50/95 shadow-[0_1px_0_rgb(var(--color-slate-200)),0_4px_10px_-6px_rgb(15_23_42/0.18)] backdrop-blur-sm">
              <tr>
                <th scope="col" className="calendar-time-heading sticky left-0 z-30 w-20 border border-slate-200 bg-slate-50 px-3 py-3 text-left">Saat</th>
                {doctors.length === 0 ? <th scope="col" className="calendar-doctor-heading border px-2 py-2 text-gray-400">Doktor bulunamadı</th> :
                  doctors.map(d => (
                    <th key={d.id} scope="col" title={d.fullName} className="calendar-doctor-heading min-w-40 max-w-52 border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-[9px] font-black text-white">
                          {d.fullName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toLocaleUpperCase("tr-TR")}
                        </span>
                        <span className="truncate">{d.fullName}</span>
                      </span>
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const isTodayGun = date.toDateString() === new Date().toDateString();
                const nowMinutesGun = new Date().getHours() * 60 + new Date().getMinutes();
                return gunSlotTimes.map(slot => {
                  const [sh, sm] = slot.split(":").map(Number);
                  const slotMinutes = sh * 60 + sm;
                  const isPastSlot = isTodayGun && slotMinutes + slotInterval <= nowMinutesGun;
                  const isNowSlot = isTodayGun && slotMinutes <= nowMinutesGun && nowMinutesGun < slotMinutes + slotInterval;
                  const isHalfHour = sm === 0 || sm === 30;
              return (
                <tr key={slot} className={"hover:bg-gray-50 " + (isNowSlot ? "relative" : "")}>
                  <td className={"calendar-time-cell sticky left-0 z-10 whitespace-nowrap border border-slate-200 px-3 py-1.5 align-top font-mono tabular-nums " + (isNowSlot ? "ui-today-breathe font-black text-primary" : isPastSlot ? "bg-slate-50/40 text-slate-500" : isHalfHour ? "bg-white font-bold text-slate-800" : "bg-white text-slate-500")}>
                    {isNowSlot && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-hidden="true" />}
                    {slot}
                  </td>
                  {doctors.map(d => {
                    const slotAppts = getApptForSlot(d.id, slot);
                    const continuingAppts = getContinuingApptForSlot(d.id, slot, date);
                    const dropKey = `g-${d.id}-${slot}`;
                    const dateStr = toLocalDateKey(date);
                    const blocked = isSlotBlocked(d.id, dateStr, slot);
                    const blockInfo = blocked ? getBlockForSlot(d.id, dateStr, slot) : null;
                    const outsideHours = !blocked && isOutsideDoctorHours(d.id, slot);
                    return (
                      <td
                        key={d.id}
                        title={outsideHours ? "Doktorun mesai saati dışında" : undefined}
                        className={"group h-9 border p-0.5 align-top transition-colors " + (continuingAppts.length > 0 ? "bg-slate-50 " : outsideHours ? "bg-slate-50/70 " : "") + (blocked ? "bg-orange-50" : dragOverKey === dropKey ? "bg-primary/10 ring-2 ring-inset ring-primary ui-drop-target" : dragOverInvalid === dropKey ? "ui-drop-reject" : "")}
                        onDragOver={(e) => {
                          if (!draggedApptId) return;
                          e.preventDefault();
                          if (!blocked && continuingAppts.length === 0) { setDragOverKey(dropKey); setDragOverInvalid(null); }
                          else { setDragOverInvalid(dropKey); setDragOverKey(prev => prev === dropKey ? null : prev); }
                        }}
                        onDragLeave={() => { setDragOverKey(prev => prev === dropKey ? null : prev); setDragOverInvalid(prev => prev === dropKey ? null : prev); }}
                        onDrop={(e) => { if (!blocked && continuingAppts.length === 0) { e.preventDefault(); void handleDropOnSlot(date, slot, d.id); } }}
                      >
                        {blocked ? (
                          <div className="flex items-center gap-1 rounded bg-orange-100 border border-orange-200 px-1 py-0.5 text-[10px] text-orange-700">
                            <span>⊘</span>
                            <span className="truncate">{blockInfo?.reason || "Kapalı zaman"}</span>
                            {canCreateAppointments && <button onClick={() => blockInfo && deleteBlockSlot(blockInfo.id, slot)} aria-label="Bu saati aç" title="Bu saati aç" className="ml-auto text-red-400 hover:text-red-600">✕</button>}
                          </div>
                        ) : continuingAppts.length > 0 ? (
                          continuingAppts.map(a => apptBlock(a, false))
                        ) : (
                          <>
                            {outsideHours && slotAppts.length === 0 && (
                              <p className="truncate text-[9px] font-semibold text-slate-400">Mesai dışı</p>
                            )}
                            {/* Birden fazla randevu aynı saate yığılınca (çakışma onayıyla oluşturulmuş),
                                satır uzayıp altındaki sonraki saatlerle görsel olarak iç içe geçebiliyor —
                                hepsinin AYNI saatte olduğunu netleştirmek için bir grup etiketi ekleniyor
                                (bkz. kullanıcı geri bildirimi: "09:15'e üç hasta yazınca 09:30'a
                                yazamıyormuşuz gibi görünüyor"). */}
                            {slotAppts.length > 1 && (
                              <p className="mb-0.5 truncate rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                                ⚠ {slotAppts.length} randevu aynı saatte ({slot})
                              </p>
                            )}
                            {slotAppts.map(a => apptBlock(a, canCreateAppointments))}
                            {slotAppts.length === 0 ? (
                              outsideHours ? (
                                <div className="h-7" />
                              ) : canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, date, d.id)}
                                  aria-label={`${slot} için randevu oluştur`}
                                  title="Randevu oluştur"
                                  className="randevu-slot-create"
                                >
                                  <span aria-hidden="true" className="randevu-slot-create-icon">+</span><span className="randevu-slot-create-label">Randevu oluştur</span>
                                </button>
                              ) : <div className="h-7" />
                            ) : (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, date, d.id)}
                                  aria-label={`${slot} için ek randevu oluştur`}
                                  title="Randevu oluştur"
                                  className="randevu-slot-create randevu-slot-create-secondary"
                                >
                                  <span aria-hidden="true" className="randevu-slot-create-icon">+</span><span className="randevu-slot-create-label">Ekle</span>
                                </button>
                              ) : null
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
                });
              })()}
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
        <div className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-surface)]">
          <table className="randevu-grid min-w-[980px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-50">
                <tr>
                <th scope="col" className="calendar-time-heading sticky left-0 z-30 w-20 border border-slate-200 bg-slate-50 px-3 py-3 text-left">Saat</th>
                {weekDays.map((d, i) => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  const isWorkday = workingDayIndexes.has(d.getDay());
                  const canOpenDay = isWorkday || getApptForDay(d).length > 0;
                  const dayA11yLabel = `${TR_DAYS_BY_JS_INDEX[d.getDay()]} ${d.getDate()}${isToday ? " — bugün" : ""}${canOpenDay ? ", gün görünümünü aç" : ", klinik için tatil günü"}`;
                  return (
                    <th key={i}
                      role={canOpenDay ? "button" : undefined}
                      tabIndex={canOpenDay ? 0 : undefined}
                      aria-label={dayA11yLabel}
                      onClick={() => { if (canOpenDay) { setDate(d); setView("GUN"); } }}
                      onKeyDown={(e) => { if (canOpenDay && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setDate(d); setView("GUN"); } }}
                      title={canOpenDay ? undefined : "Klinik için tatil günü — görüntülenecek bir şey yok"}
                      className={"min-w-28 border border-slate-200 px-3 py-3 text-center text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 " + (canOpenDay ? "cursor-pointer hover:bg-primary/10 " : "cursor-not-allowed opacity-40 ") + (isToday ? "ui-today-breathe text-primary" : "bg-slate-50 text-slate-800")}>
                      {TR_DAYS_BY_JS_INDEX[d.getDay()]}<br /><span className="text-sm">{d.getDate()}</span>
                      {isToday && <span className="mt-0.5 block text-[9px] font-black uppercase tracking-wide text-primary">Bugün</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slotTimes.map(slot => (
                <tr key={slot} className="hover:bg-gray-50">
                  <td className="calendar-time-cell sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-white px-3 py-1.5 align-top font-mono">{slot}</td>
                  {weekDays.map((d, i) => {
                    const slotAppts = getApptForSlot(doctorId || null, slot, d);
                    const continuingAppts = getContinuingApptForSlot(doctorId || null, slot, d);
                    const dropKey = `h-${d.toDateString()}-${slot}`;
                    const dateStr = toLocalDateKey(d);
                    // Hafta görünümünde belirli bir doktor seçiliyse blok kontrolü yap
                    const blocked = doctorId ? isSlotBlocked(doctorId, dateStr, slot) : false;
                    const blockInfo = blocked && doctorId ? getBlockForSlot(doctorId, dateStr, slot) : null;
                    // Per-day mesai saati kontrolü
                    const haftaDayDs = scheduleByJsDay.get(d.getDay());
                    const haftaSlotMins = parseTimeToMinutes(slot, 0);
                    const haftaOutOfHours = haftaDayDs && !haftaDayDs.isHoliday
                      ? (haftaSlotMins < parseTimeToMinutes(haftaDayDs.open, 0) || haftaSlotMins >= parseTimeToMinutes(haftaDayDs.close, 23 * 60 + 59))
                      : false;
                    // Doktorun kişisel mesai saati dışı — kliniğin genel çalışma
                    // saatinden (haftaOutOfHours, sert engel) ayrı, yumuşak bir uyarı.
                    const doctorOutsideHours = !haftaOutOfHours && !blocked && doctorId ? isOutsideDoctorHours(doctorId, slot) : false;
                    return (
                      <td
                        key={i}
                        title={doctorOutsideHours ? "Doktorun mesai saati dışında" : undefined}
                        className={"group h-9 border p-0.5 align-top transition-colors " + (haftaOutOfHours || continuingAppts.length > 0 ? "bg-slate-50 " : doctorOutsideHours ? "bg-slate-50/70 " : "") + (blocked ? "bg-orange-50" : dragOverKey === dropKey ? "bg-primary/10 ring-2 ring-inset ring-primary ui-drop-target" : dragOverInvalid === dropKey ? "ui-drop-reject" : "")}
                        onDragOver={(e) => {
                          if (!draggedApptId) return;
                          e.preventDefault();
                          if (!blocked && !haftaOutOfHours && continuingAppts.length === 0) { setDragOverKey(dropKey); setDragOverInvalid(null); }
                          else { setDragOverInvalid(dropKey); setDragOverKey(prev => prev === dropKey ? null : prev); }
                        }}
                        onDragLeave={() => { setDragOverKey(prev => prev === dropKey ? null : prev); setDragOverInvalid(prev => prev === dropKey ? null : prev); }}
                        onDrop={(e) => { if (!blocked && !haftaOutOfHours && continuingAppts.length === 0) { e.preventDefault(); void handleDropOnSlot(d, slot); } }}
                      >
                        {haftaOutOfHours ? (
                          <div className="h-7" />
                        ) : blocked ? (
                          <div className="flex items-center gap-1 rounded bg-orange-100 border border-orange-200 px-1 py-0.5 text-[10px] text-orange-700">
                            <span>⊘</span>
                            <span className="truncate">{blockInfo?.reason || "Kapalı zaman"}</span>
                            {canCreateAppointments && <button onClick={() => blockInfo && deleteBlockSlot(blockInfo.id, slot)} aria-label="Bu saati aç" title="Bu saati aç" className="ml-auto text-red-400 hover:text-red-600">✕</button>}
                          </div>
                        ) : continuingAppts.length > 0 ? (
                          continuingAppts.map(a => apptBlock(a, false))
                        ) : (
                          <>
                            {doctorOutsideHours && slotAppts.length === 0 && (
                              <p className="truncate text-[9px] font-semibold text-slate-400">Mesai dışı</p>
                            )}
                            {slotAppts.length > 1 && (
                              <p className="mb-0.5 truncate rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                                ⚠ {slotAppts.length} randevu aynı saatte ({slot})
                              </p>
                            )}
                            {slotAppts.map(a => apptBlock(a, canCreateAppointments))}
                            {slotAppts.length === 0 ? (
                              doctorOutsideHours ? (
                                <div className="h-7" />
                              ) : canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                                  aria-label={`${slot} için randevu oluştur`}
                                  title="Randevu oluştur"
                                  className="randevu-slot-create"
                                >
                                  <span aria-hidden="true" className="randevu-slot-create-icon">+</span><span className="randevu-slot-create-label">Randevu oluştur</span>
                                </button>
                              ) : <div className="h-7" />
                            ) : (
                              canCreateAppointments ? (
                                <button
                                  onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                                  aria-label={`${slot} için ek randevu oluştur`}
                                  title="Randevu oluştur"
                                  className="randevu-slot-create randevu-slot-create-secondary"
                                >
                                  <span aria-hidden="true" className="randevu-slot-create-icon">+</span><span className="randevu-slot-create-label">Ekle</span>
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
          {/* GÜN/HAFTA görünümleriyle aynı desen: dar ekranda sütunlar
              sıkışıp okunmaz hale gelmesin diye min-genişlik + yatay
              kaydırma (bkz. denetim raporu). */}
          <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded bg-slate-200">
            {TR_DAYS.map(d => <div key={d} className="bg-slate-50 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-500">{d}</div>)}
            {(() => {
              const firstDay = currentRange.from.getDay();
              const offset = firstDay === 0 ? 6 : firstDay - 1;
              return Array.from({length: offset}, (_, i) => <div key={"e"+i} className="min-h-20 bg-slate-50/50" />);
            })()}
            {monthDays.map((d, i) => {
              const dayAppts = getApptForDay(d);
              const isToday = d.toDateString() === new Date().toDateString();
              const isWorkday = workingDayIndexes.has(d.getDay());
              // Tatil günü olsa da o günde zaten kayıtlı randevu varsa (örn.
              // tatil ayarı sonradan eklendiyse) yine de görülüp yönetilebilmeli.
              const canOpenDay = isWorkday || dayAppts.length > 0;
              const densityTone = dayAppts.length === 0 ? "" : dayAppts.length <= 2 ? "bg-slate-100 text-slate-600" : dayAppts.length <= 4 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
              return (
                <div key={i}
                  role={canOpenDay ? "button" : undefined}
                  tabIndex={canOpenDay ? 0 : undefined}
                  onClick={() => { if (canOpenDay) { setDate(d); setView("GUN"); } }}
                  onKeyDown={(e) => { if (canOpenDay && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setDate(d); setView("GUN"); } }}
                  title={canOpenDay ? undefined : "Klinik için tatil günü — görüntülenecek bir şey yok"}
                  className={"min-h-20 p-1 transition-colors " + (canOpenDay ? "cursor-pointer hover:bg-primary/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 " : "cursor-not-allowed ") + (isToday ? "ui-today-breathe ring-2 ring-inset ring-primary " : "bg-white ") + (isWorkday ? "" : "opacity-70")}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className={"text-xs font-black " + (isToday ? "text-primary" : "text-slate-700")}>{d.getDate()}</div>
                    <div className="flex items-center gap-1">
                      {dayAppts.length > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${densityTone}`}
                          aria-label={`${dayAppts.length} randevu${dayAppts.length > 4 ? ", yoğun gün" : dayAppts.length > 2 ? ", orta yoğunlukta gün" : ""}`}
                        >{dayAppts.length}</span>
                      )}
                      {canCreateAppointments && isWorkday ? (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            openQuickCreate(slotTimes[0], d, doctorId || undefined);
                          }}
                          aria-label={`${d.getDate()} için randevu oluştur`}
                          className="ui-interactive rounded border border-dashed border-slate-300 px-1 text-[10px] text-slate-500 hover:border-primary hover:text-primary"
                        >
                          +
                        </button>
                      ) : <span className="w-3" />}
                    </div>
                  </div>
                  {dayAppts.slice(0,3).map(a => (
                    <div key={a.id} style={{background: a.colorCode || getTreatmentMeta(parseAppointmentNote(a.note).treatment).color}}
                      role="button"
                      tabIndex={0}
                      aria-label={`${a.patient?.fullName || "Hasta belirtilmemiş"}, ${new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}`}
                      className="ui-interactive mb-0.5 truncate rounded px-1 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      onClick={e => { e.stopPropagation(); setSelectedAppt(a); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setSelectedAppt(a); } }}>
                      {new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})} {a.patient?.fullName}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDate(d); setView("GUN"); }}
                      aria-label={`${d.getDate()} tarihinde ${dayAppts.length - 3} randevu daha var, gün görünümünü aç`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      +{dayAppts.length-3} daha
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {view === "AJANDA" && (
        <div className="space-y-1">
          <div className="mb-2 inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100/80 p-1">
            {[
              { key: "ALL", label: "Tümü" },
              { key: "BEKLIYOR", label: "Planlandı" },
              { key: "GELDI", label: "Bekliyor" },
              { key: "TAMAMLANDI", label: "Tamamlandı" },
              { key: "GELMEDI", label: "Gelmedi" },
              { key: "IPTAL", label: "İptal" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setAgendaStatusFilter(chip.key as "ALL" | "BEKLIYOR" | "GELDI" | "TAMAMLANDI" | "GELMEDI" | "IPTAL")}
                className={"ui-view-tab h-7 rounded-md px-2.5 text-xs font-semibold transition-all duration-150 " + (agendaStatusFilter === chip.key ? "is-active bg-white text-primary shadow-[0_1px_3px_rgb(15_23_42/0.12)]" : "text-slate-600 hover:text-slate-900")}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {filteredAgendaAppointments.length === 0 && (
            <EmptyState
              icon={AgendaEmptyIcon}
              illustrative
              title="Seçilen filtrede randevu yok"
              description="Farklı bir tarih aralığı veya durum filtresi deneyin, ya da yeni bir randevu oluşturun."
            />
          )}
          {filteredAgendaAppointments.map((a, agendaIdx) => (
            (() => {
              const parsed = parseAppointmentNote(a.note);
              const meta = getFollowUpMeta(parsed.followUp);
              const treatmentMeta = getTreatmentMeta(parsed.treatment);
              const displayStatus = getDisplayAppointmentStatus(a.status, a.startAt);
              const stale = isStaleWaitingAppointment(a.status, a.startAt);
              const statusBadge = STATUS_BADGE[displayStatus] || STATUS_BADGE.BEKLIYOR;
              const initials = (a.patient?.fullName || "?")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toLocaleUpperCase("tr-TR");
              return (
            <div key={a.id} onClick={() => setSelectedAppt(a)}
              style={{ ["--row-delay" as string]: `${Math.min(agendaIdx, 10) * 28}ms` }}
              className={"ui-tone-card-interactive ui-pressable ui-row-in flex items-center gap-3 rounded-lg border bg-white p-3 cursor-pointer " + (STATUS_COLORS[displayStatus] || "") + (stale ? " ring-1 ring-orange-400" : "")}>
              <div className="flex flex-col items-center min-w-16 text-center">
                <span className="text-xs font-medium text-slate-500">{new Date(a.startAt).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}</span>
                <span className="text-sm font-bold text-primary tabular-nums">{new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-xs font-black text-white shadow-[0_2px_6px_rgb(var(--app-primary)/0.28)] ring-2 ring-white">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{a.patient?.fullName}</p>
                <p className="text-xs text-slate-500 truncate">{a.doctor?.fullName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: treatmentMeta.color }}>{treatmentMeta.label}</span>
                  {parsed.followUp !== "YOK" && <span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " + meta.badge}>{meta.label}</span>}
                </div>
                {parsed.detail && <p className="text-xs text-slate-400 mt-0.5 truncate">{parsed.detail}</p>}
              </div>
              <Badge tone={statusBadge.tone} icon={statusBadge.icon} title={stale ? "Geçmiş tarihli, durum işaretlenmemiş" : undefined}>
                {STATUS_LABELS[displayStatus] || a.status}
              </Badge>
            </div>
              );
            })()
          ))}
        </div>
      )}
      </div>

      {/* DOKTOR BLOK EKLEME MODALI */}
      <Modal
        module="calendar"
        open={showBlockModal}
        onClose={() => { setShowBlockModal(false); setBlockSubmitError(null); }}
        isDirty={blockModalDirty}
        title="Doktorun Zamanını Kapat"
        description="Doktorun randevu kabul etmeyeceği çalışma saati aralığını kaydedin."
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseBlockModal()}>İptal</Button>
            <Button
              variant="primary"
              onClick={saveBlock}
              disabled={!blockDoctorId || !blockDate || !blockStartTime || !blockEndTime || Boolean(blockValidationError)}
              loading={blockSaving}
              fullWidth
            >
              {blockSaving ? "Kaydediliyor…" : "Zamanı Kapat"}
            </Button>
          </>
        }
      >
            <div className="space-y-3">
              <FormField label="Doktor">
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={blockDoctorId} onChange={e => setBlockDoctorId(e.target.value)}>
                  <option value="">— Doktor Seçin —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </FormField>
              <FormField label="Tarih">
                <input type="date" min={toLocalDateKey(new Date())} value={blockDate} onChange={e => { setBlockDate(e.target.value); setBlockSubmitError(null); }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Başlangıç">
                  <input type="time" value={blockStartTime} onChange={e => { setBlockStartTime(e.target.value); setBlockSubmitError(null); }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </FormField>
                <FormField label="Bitiş">
                  <input type="time" value={blockEndTime} onChange={e => { setBlockEndTime(e.target.value); setBlockSubmitError(null); }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </FormField>
              </div>
              <FormField label="Neden (isteğe bağlı)">
                <input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)}
                  placeholder="Öğle arası, toplantı, izin..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </FormField>
              {(blockValidationError || blockSubmitError) && (
                <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  {blockSubmitError || blockValidationError}
                </p>
              )}
            </div>

            {/* Mevcut bloklar bu doktor için */}
            {blockDoctorId && blockDate && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-bold text-slate-700">Bu gündeki kapalı zamanlar</h3>
                {doctorBlocks.filter(b => b.doctorId === blockDoctorId && b.date === blockDate).length === 0 ? (
                  <p className="text-xs text-slate-400">Bu tarihte kapalı zaman kaydı yok.</p>
                ) : (
                  <div className="space-y-1">
                    {doctorBlocks.filter(b => b.doctorId === blockDoctorId && b.date === blockDate).map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs">
                        <span className="font-semibold text-orange-800">{b.startTime} – {b.endTime}</span>
                        <span className="text-orange-600">{b.reason || ""}</span>
                        <button onClick={() => deleteBlock(b.id)} aria-label="Kapalı zamanı sil" title="Kapalı zamanı sil" className="ml-2 font-bold text-red-500 hover:text-red-700">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
      </Modal>

      <Modal
        module="calendar"
        open={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        isDirty={waitlistFormDirty}
        title="Bekleme Listesi"
        description="Uygun randevu bulunamayan veya iptal olan bir slotu doldurmak istediğiniz hastaları buraya ekleyin."
        size="lg"
      >
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase text-purple-700">Listeye Ekle</h3>
              <div className="space-y-3">
                <div className="relative">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Hasta</span>
                  {wlSelectedPatient ? (
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{wlSelectedPatient.fullName}</span>
                      <button onClick={() => { setWlSelectedPatient(null); setWlPatientSearch(""); }} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Değiştir</button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={wlPatientSearch}
                        onChange={(e) => setWlPatientSearch(e.target.value)}
                        placeholder="Hasta adı, TC veya telefon…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      {wlPatientResults.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {wlPatientResults.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => { setWlSelectedPatient(p); setWlPatientResults([]); }}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              {p.fullName} {p.phone ? <span className="text-xs text-slate-400">· {p.phone}</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <FormField label="Doktor (opsiyonel)">
                  <select value={wlDoctorId} onChange={(e) => setWlDoctorId(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">— Fark etmez —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tercih edilen tarih (opsiyonel)">
                    <input type="date" value={wlFrom} onChange={(e) => setWlFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </FormField>
                  <FormField label="Son tarih (opsiyonel)">
                    <input type="date" value={wlTo} onChange={(e) => setWlTo(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </FormField>
                </div>
                <FormField label="Not (opsiyonel)">
                  <input value={wlNote} onChange={(e) => setWlNote(e.target.value)} placeholder="örn. Sadece sabah saatleri uygun" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </FormField>
                <Button
                  variant="primary"
                  onClick={submitWaitlist}
                  disabled={!wlSelectedPatient}
                  loading={wlSaving}
                  fullWidth
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {wlSaving ? "Ekleniyor…" : "Bekleme Listesine Ekle"}
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Listede Bekleyenler ({activeWaitlist.length})</h3>
              {activeWaitlist.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Bekleme listesi boş.</p>
              ) : (
                <div className="space-y-2">
                  {activeWaitlist.map((w) => (
                    <div key={w.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{w.patient.fullName}</p>
                          <p className="text-xs text-slate-500">
                            {w.doctor?.fullName ? `${w.doctor.fullName} · ` : ""}
                            {w.preferredFrom ? new Date(w.preferredFrom).toLocaleDateString("tr-TR") : "Tarih fark etmez"}
                            {w.preferredTo ? ` – ${new Date(w.preferredTo).toLocaleDateString("tr-TR")}` : ""}
                          </p>
                          {w.note && <p className="mt-1 text-xs text-slate-500">{w.note}</p>}
                          {w.patient.phone && <p className="mt-1 text-xs text-slate-400">📞 {w.patient.phone}</p>}
                        </div>
                        <Badge tone={w.status === "ARANDI" ? "warning" : "info"}>
                          {w.status === "ARANDI" ? "Arandı" : "Bekliyor"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {w.status === "BEKLIYOR" && (
                          <button onClick={() => void updateWaitlistStatus(w.id, "ARANDI")} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">Arandı olarak işaretle</button>
                        )}
                        <button onClick={() => void updateWaitlistStatus(w.id, "YERLESTIRILDI")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Randevuya yerleştirildi</button>
                        <button onClick={() => void removeWaitlistEntry(w.id)} className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">Kaldır</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
      </Modal>

      <Modal
        module="calendar"
        open={showBookingRequestsModal}
        onClose={() => setShowBookingRequestsModal(false)}
        title="Online Randevu Talepleri"
        description="Hastaların self-servis bağlantı üzerinden gönderdiği randevu talepleri. Onayladığınızda hastayı arayıp gerçek randevuyu siz oluşturursunuz."
        size="lg"
      >
            {bookingRequests.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Bekleyen online talep yok.</p>
            ) : (
              <div className="space-y-2">
                {bookingRequests.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{r.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {r.doctor?.fullName ? `${r.doctor.fullName} · ` : "Doktor tercihi yok · "}
                          Tercih: {new Date(r.preferredFrom).toLocaleDateString("tr-TR")}
                        </p>
                        {r.note && <p className="mt-1 text-xs text-slate-500">{r.note}</p>}
                        <p className="mt-1 text-xs text-slate-400">📞 {r.phone}{r.tcNo ? ` · TC: ${r.tcNo}` : ""}</p>
                      </div>
                      <Badge tone="info">Bekliyor</Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void respondBookingRequest(r.id, "ONAYLANDI")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Onayla</button>
                      <button onClick={() => void respondBookingRequest(r.id, "REDDEDILDI")} className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">Reddet</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </Modal>

      {selectedAppt && (
        (() => {
          const parsed = parseAppointmentNote(selectedAppt.note);
          const meta = getFollowUpMeta(parsed.followUp);
          const treatmentMeta = getTreatmentMeta(parsed.treatment);
          const detailDisplayStatus = getDisplayAppointmentStatus(selectedAppt.status, selectedAppt.startAt);
          const detailStale = isStaleWaitingAppointment(selectedAppt.status, selectedAppt.startAt);
          const detailCanMarkNoShow = canMarkNoShow(selectedAppt.startAt);
          return (
        <Modal
          module="calendar"
          open={Boolean(selectedAppt)}
          onClose={closeAppointmentModal}
          isDirty={editAppointmentDirty}
          title={editMode ? "Randevuyu Düzenle" : "Randevu Detayı"}
        >
            {editMode ? (
              <div className="space-y-3">
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs font-medium text-primary sm:hidden">
                  Randevuyu taşımak için doktor ve/veya başlangıç tarihini değiştirip kaydedin — dokunmatik
                  cihazlarda sürükle-bırak yerine bu akış kullanılır.
                </p>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                {/* Hasta */}
                <div>
                  <span className="text-xs font-semibold text-slate-600 mb-1 block">Hasta</span>
                  <div className="relative">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                      <span className="text-slate-400 text-sm">🔍</span>
                      <input type="text" placeholder="Hasta adı, TC veya telefon..."
                        value={editPatientSearch}
                        onChange={e => { setEditPatientSearch(e.target.value); setEditPatientDropdownOpen(true); if (!e.target.value) setEditPatientId(""); }}
                        onFocus={() => editPatientSearch.trim().length >= 2 && setEditPatientDropdownOpen(true)}
                        className="flex-1 bg-transparent text-sm outline-none" />
                      {editPatientId && <button type="button" onClick={() => { setEditPatientId(""); setEditPatientSearch(""); setEditPatientResults([]); }} aria-label="Hasta seçimini temizle" title="Hasta seçimini temizle" className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-base leading-none text-slate-400 hover:text-red-500">×</button>}
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
                  <span className="text-xs font-semibold text-slate-600 mb-1 block">Doktor</span>
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
                {clinicUnits.some((unit) => unit.isActive || unit.id === editClinicUnitId) && (
                  <FormField label="Tedavi Alanı (isteğe bağlı)">
                    <select
                      value={editClinicUnitId}
                      onChange={(event) => setEditClinicUnitId(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Koltuk / oda seçilmedi</option>
                      {clinicUnits
                        .filter((unit) => unit.isActive || unit.id === editClinicUnitId)
                        .map((unit) => (
                          <option key={unit.id} value={unit.id} disabled={!unit.isActive}>
                            {unit.name}{unit.code ? ` · ${unit.code}` : ""}{!unit.isActive ? " (arşivde)" : ""}
                          </option>
                        ))}
                    </select>
                  </FormField>
                )}
                {/* Başlangıç & Süre */}
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Başlangıç">
                    <input type="datetime-local" className="w-full rounded-lg border px-3 py-2 text-sm" value={editStartAt} onChange={e => setEditStartAt(e.target.value)} />
                  </FormField>
                  <FormField label="Süre">
                    <select className="w-full rounded-lg border px-3 py-2 text-sm" value={editDurationMinutes} onChange={e => setEditDurationMinutes(Number(e.target.value))}>
                      {durationOptions.map(opt => <option key={opt} value={opt}>{opt} dk</option>)}
                    </select>
                  </FormField>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" onClick={updateAppointment} disabled={!editPatientId || !editDoctorId} loading={editSaving}>
                    {editSaving ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                  <Button variant="secondary" onClick={() => void requestCancelEdit()}>İptal</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1 flex justify-end">
                  <Badge
                    tone={detailDisplayStatus === "TAMAMLANDI" ? "success" : detailDisplayStatus === "GELMEDI" || detailDisplayStatus === "IPTAL" ? "critical" : detailDisplayStatus === "PLANLANDI" ? "info" : "warning"}
                    solid
                  >
                    {detailStale ? "⚠ Planlandı · Geçmiş" : STATUS_LABELS[detailDisplayStatus] || selectedAppt.status}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Hasta:</span><span className="flex items-center gap-1.5 font-semibold">
                    {selectedAppt.patient?.fullName}
                    {selectedAppt.patient?.hasContagiousDisease && (
                      <Badge tone="critical" solid title={selectedAppt.patient.contagiousDiseaseNote || undefined}>⚠ Bulaşıcı Hastalık</Badge>
                    )}
                  </span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Doktor:</span><span>{selectedAppt.doctor?.fullName}</span></div>
                  {selectedAppt.clinicUnit && <div className="flex justify-between"><span className="text-gray-500">Tedavi alanı:</span><span>{selectedAppt.clinicUnit.name}{selectedAppt.clinicUnit.code ? ` · ${selectedAppt.clinicUnit.code}` : ""}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Başlangıç:</span><span>{new Date(selectedAppt.startAt).toLocaleString("tr-TR")}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Bitiş:</span><span>{new Date(selectedAppt.endAt).toLocaleString("tr-TR")}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tedavi:</span><span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: treatmentMeta.color }}>{treatmentMeta.label}</span></div>
                  {parsed.detail && <div className="flex justify-between gap-3"><span className="text-gray-500">Not:</span><span className="max-w-xs text-right">{parsed.detail}</span></div>}
                  {parsed.followUp !== "YOK" && <div className="flex justify-between"><span className="text-gray-500">Takip:</span><span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + meta.badge}>{meta.label}</span></div>}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-2 font-semibold">Durum Güncelle:</p>
                  {!detailCanMarkNoShow && (
                    <p className="mb-2 text-xs text-sky-700">Hasta erken gelmiş olabilir, &quot;Bekliyor&quot; (hasta geldi) her zaman işaretlenebilir — &quot;Gelmedi&quot; ise randevu saati geçtikten sonra işaretlenebilir.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {[
                      {v:"BEKLIYOR",l:"Planlandı",c:"bg-sky-100 text-sky-700"},
                      {v:"GELDI",l:"Bekliyor",c:"bg-yellow-100 text-yellow-700"},
                      {v:"TAMAMLANDI",l:"Tamamlandı",c:"bg-green-100 text-green-700"},
                      {v:"GELMEDI",l:"Gelmedi",c:"bg-red-100 text-red-700"},
                      {v:"IPTAL",l:"İptal",c:"bg-gray-200 text-gray-700"},
                    ].map(s => {
                      // İptal edilmiş bir randevu Bekliyor/Tamamlandı/Gelmedi olarak
                      // işaretlenemez — önce "Planlandı"ya alınıp yeniden açılmalı
                      // (bkz. denetim raporu Tema 5). Hasta erken gelebileceği için
                      // "Bekliyor" (hasta geldi) randevu saatinden bağımsız her zaman
                      // işaretlenebilir; yalnızca "Gelmedi" randevu saati geçmeden
                      // anlamsızdır. "Tamamlandı" da (aynı gün tedavi/ödeme
                      // otomatik tetikler ama) her zaman manuel işaretlenebilir
                      // (bkz. kullanıcı geri bildirimi).
                      const futureBlock = !detailCanMarkNoShow && s.v === "GELMEDI";
                      const disabled = (selectedAppt.status === "IPTAL" && (s.v === "GELDI" || s.v === "GELMEDI" || s.v === "TAMAMLANDI")) || futureBlock;
                      return (
                        <button key={s.v} onClick={() => updateStatus(selectedAppt.id, s.v)} disabled={disabled}
                          title={futureBlock ? "Randevu saati henüz gelmedi" : disabled ? "İptal edilmiş randevu önce 'Planlandı'ya alınmalı" : undefined}
                          className={"rounded-full px-3 py-1 text-sm font-semibold " + s.c + (selectedAppt.status===s.v?" ring-2 ring-gray-400":"") + (disabled ? " opacity-40 cursor-not-allowed" : "")}>
                          {s.l}
                        </button>
                      );
                    })}
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
                    <Button variant="primary" size="sm" onClick={saveAppointmentFollowUp} loading={detailSaving}>
                      {detailSaving ? "Kaydediliyor..." : "Takip Notunu Kaydet"}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" size="sm" href={"/hasta-detay?id=" + selectedAppt.patient?.id}>Hasta Detayı</Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openEditMode}
                    disabled={selectedAppt.status === "IPTAL"}
                    title={selectedAppt.status === "IPTAL" ? "İptal edilmiş randevu düzenlenemez — önce 'Planlandı'ya alın" : "Tarih, doktor veya saat değiştirin — dokunmatik cihazlarda sürükle-bırak yerine kullanılır"}
                  >
                    Taşı / Düzenle
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => remove(selectedAppt.id)}
                    disabled={selectedAppt.status === "IPTAL"}
                    title={selectedAppt.status === "IPTAL" ? "Randevu zaten iptal edilmiş" : "Randevuyu iptal eder — veri silinmez"}
                  >
                    İptal Et
                  </Button>
                  <Button variant="secondary" size="sm" onClick={closeAppointmentModal} className="ml-auto">Kapat</Button>
                </div>
              </>
            )}
        </Modal>
          );
        })()
      )}
    </section>
  );
}
