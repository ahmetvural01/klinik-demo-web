"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FollowUpKey,
  appointmentNeedsFollowUp,
  buildAppointmentNote,
  getFollowUpMeta,
  parseAppointmentNote,
} from "@/lib/appointment-follow-up";
import { useToast } from "@/components/ui/ToastProvider";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  note?: string | null;
  patient?: { id: string; fullName: string; phone?: string | null };
  doctor?: { id: string; fullName: string };
};

type ManualFollowUp = {
  id: string;
  patientId: string;
  appointmentId?: string | null;
  doctorId?: string | null;
  type: "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "DIGER";
  priority: number;
  status: "ACIK" | "KAPALI";
  note?: string | null;
  resolutionNote?: string | null;
  nextActionAt?: string | null;
  lastContactAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: { id: string; fullName: string; phone?: string | null };
  appointment?: {
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    doctor?: { id: string; fullName: string } | null;
  } | null;
  assignedDoctor?: { id: string; fullName: string } | null;
  createdBy?: { id: string; fullName: string } | null;
};

type Staff = { id: string; fullName: string; role: string };
type PatientOption = { id: string; fullName: string; phone?: string | null };

type FollowUpEvent = {
  id: string;
  followUpId: string;
  patientId: string;
  occurredAt: string;
  channel?: string | null;
  summary: string;
  detail?: string | null;
  patientResponse?: string | null;
  nextStep?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string } | null;
  updatedBy?: { id: string; fullName: string } | null;
};

type ClinicTask = {
  id: string;
  title: string;
  details?: string | null;
  vendorName?: string | null;
  type: "PARCA_SIPARIS" | "LAB" | "ARAMA" | "EVRAK" | "DIGER";
  priority: number;
  status: "ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";
  dueAt?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string } | null;
  assignees?: Array<{ userId: string; user: { id: string; fullName: string; role: string } }>;
  patient?: { id: string; fullName: string; phone?: string | null } | null;
  createdAt: string;
};

type FollowItem = {
  key: string;
  source: "APPOINTMENT" | "MANUAL";
  appointmentId?: string;
  followUpId?: string;
  patientId: string;
  patientName: string;
  patientPhone?: string | null;
  doctorId?: string;
  doctorName: string;
  type: string;
  followUpLabel: string;
  statusLabel: string;
  note: string;
  isOpen: boolean;
  priority: number;
  createdAt: string;
  nextActionAt?: string | null;
  ageDays: number;
  appointmentDateLabel: string;
  followBadgeClass: string;
};

const STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

const FOLLOW_LABELS: Record<string, string> = {
  GELMEDI: "Gelmedi",
  GERI_ARA: "Tekrar aranacak",
  ULASILAMADI: "Ulaşılamadı",
  DONUS_BEKLENIYOR: "Dönüş bekleniyor",
  DIGER: "Diğer",
};

const MANUAL_TYPE_OPTIONS = [
  "Tekrar aranacak",
  "Ulaşılamadı",
  "Dönüş bekleniyor",
  "Randevu verildi",
  "Ertelendi",
  "Fiyat bilgisi bekleniyor",
  "Tedavi onayı bekleniyor",
  "Diğer",
] as const;

const CUSTOM_TYPE_PREFIX = "Takip Tipi:";

const EVENT_PRESETS = [
  {
    label: "Arandı, açmadı",
    channel: "Telefon",
    summary: "Hasta arandı, telefonu açmadı.",
    patientResponse: "",
    nextStep: "Daha sonra tekrar aranacak.",
    detail: "Arama yapıldı ancak ulaşılamadı.",
  },
  {
    label: "Başka zaman gelmek istiyor",
    channel: "Telefon",
    summary: "Hasta bu hafta gelemeyeceğini, başka bir zamanda gelmek istediğini belirtti.",
    patientResponse: "Şu an uygun değilim, daha sonra gelmek istiyorum.",
    nextStep: "Yeni uygun tarih için tekrar görüşülecek.",
    detail: "Takvim uygunluğuna göre yeni randevu önerilecek.",
  },
  {
    label: "Bilgi aldı, düşünecek",
    channel: "Telefon",
    summary: "Hasta süreç hakkında bilgi aldı, düşünüp dönüş yapacağını söyledi.",
    patientResponse: "Bilgileri aldım, düşünüp size döneceğim.",
    nextStep: "2-3 gün içinde geri dönüş için tekrar aranacak.",
    detail: "Karar süreci bekleniyor.",
  },
  {
    label: "Fiyat sordu",
    channel: "Telefon",
    summary: "Hasta fiyat bilgisi talep etti.",
    patientResponse: "Fiyat bilgisini öğrenmek istiyorum.",
    nextStep: "Fiyat bilgisi paylaşılıp takip araması yapılacak.",
    detail: "Tedavi/fiyat detayları aktarıldı veya aktarılacak.",
  },
  {
    label: "Randevuya yakın",
    channel: "Telefon",
    summary: "Hasta gelmeye yakın olduğunu ve randevu planlayabileceğini belirtti.",
    patientResponse: "Uygun gün olursa gelebilirim.",
    nextStep: "Uygun tarih seçilerek randevuya yönlendirilecek.",
    detail: "Randevu planlama için olumlu geri bildirim alındı.",
  },
] as const;

const EVENT_CHANNEL_OPTIONS = ["Telefon", "WhatsApp", "Yüz yüze", "SMS", "E-posta", "Diğer"] as const;

const TASK_TYPE_LABELS: Record<ClinicTask["type"], string> = {
  PARCA_SIPARIS: "Parça Sipariş",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

const TASK_STATUS_LABELS: Record<ClinicTask["status"], string> = {
  ACIK: "Açık",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

function toIsoInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayDiff(iso: string) {
  const now = Date.now();
  const target = new Date(iso).getTime();
  return Math.max(0, Math.floor((now - target) / 86_400_000));
}

function getAgeBadge(days: number) {
  if (days <= 3) return "bg-emerald-100 text-emerald-700";
  if (days <= 7) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function getPriorityBadge(priority: number) {
  if (priority >= 3) return "bg-rose-100 text-rose-700";
  if (priority === 2) return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function getTaskStatusBadge(status: ClinicTask["status"]) {
  if (status === "ACIK") return "bg-emerald-100 text-emerald-700";
  if (status === "BEKLEMEDE") return "bg-amber-100 text-amber-700";
  if (status === "TAMAMLANDI") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function shortText(value: string, max = 110) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}...`;
}

function parseCustomTypeFromNote(note?: string | null) {
  const raw = (note || "").trim();
  if (!raw) return { customType: "", cleanNote: "" };
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "";
  if (!first.toLocaleLowerCase("tr-TR").startsWith(CUSTOM_TYPE_PREFIX.toLocaleLowerCase("tr-TR"))) {
    return { customType: "", cleanNote: raw };
  }
  const customType = first.slice(CUSTOM_TYPE_PREFIX.length).trim();
  const cleanNote = lines.slice(1).join("\n").trim();
  return { customType, cleanNote };
}

function buildManualNote(customType: string, note: string) {
  const t = customType.trim();
  const n = note.trim();
  if (t && n) return `${CUSTOM_TYPE_PREFIX} ${t}\n${n}`;
  if (t) return `${CUSTOM_TYPE_PREFIX} ${t}`;
  return n;
}

function resolveManualType(input: string): { apiType: "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "DIGER"; label: string } {
  const raw = input.trim();
  const low = raw.toLocaleLowerCase("tr-TR");
  if (!raw) return { apiType: "GERI_ARA", label: "Tekrar aranacak" };
  if (low === "tekrar aranacak" || low.includes("geri") || low.includes("ara")) return { apiType: "GERI_ARA", label: "Tekrar aranacak" };
  if (low === "ulasilamadi" || low.includes("ulasi") || low.includes("ulaşı")) return { apiType: "ULASILAMADI", label: "Ulaşılamadı" };
  if (low === "donus bekleniyor" || low.includes("donus") || low.includes("dönüş") || low.includes("beklen")) return { apiType: "DONUS_BEKLENIYOR", label: "Dönüş bekleniyor" };
  if (low === "diger" || low === "diğer") return { apiType: "DIGER", label: "Diğer" };
  return { apiType: "DIGER", label: raw };
}

function followBadgeClassByType(type: string) {
  if (type === "GELMEDI") return "bg-red-100 text-red-700";
  if (type === "GERI_ARA") return "bg-rose-100 text-rose-700";
  if (type === "ULASILAMADI") return "bg-red-100 text-red-700";
  if (type === "DONUS_BEKLENIYOR") return "bg-violet-100 text-violet-700";
  if (type === "DIGER" || type === "OZEL") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

function readCachedDashboard(rangeDays: string) {
  if (typeof window === "undefined") {
    return {
      userRole: "",
      appointments: [] as Appointment[],
      manualFollowUps: [] as ManualFollowUp[],
      staff: [] as Staff[],
      clinicTasks: [] as ClinicTask[],
    };
  }

  const cacheKey = `hasta-takip:dashboard:${rangeDays}`;
  const raw = sessionStorage.getItem(cacheKey);
  if (!raw) {
    return {
      userRole: "",
      appointments: [] as Appointment[],
      manualFollowUps: [] as ManualFollowUp[],
      staff: [] as Staff[],
      clinicTasks: [] as ClinicTask[],
    };
  }

  try {
    const cached = JSON.parse(raw) as {
      userRole?: string;
      appointments?: Appointment[];
      followUps?: ManualFollowUp[];
      staff?: Staff[];
      clinicTasks?: ClinicTask[];
    };

    return {
      userRole: cached.userRole || "",
      appointments: Array.isArray(cached.appointments) ? cached.appointments : [],
      manualFollowUps: Array.isArray(cached.followUps) ? cached.followUps : [],
      staff: Array.isArray(cached.staff) ? cached.staff : [],
      clinicTasks: Array.isArray(cached.clinicTasks) ? cached.clinicTasks : [],
    };
  } catch {
    return {
      userRole: "",
      appointments: [] as Appointment[],
      manualFollowUps: [] as ManualFollowUp[],
      staff: [] as Staff[],
      clinicTasks: [] as ClinicTask[],
    };
  }
}

export default function HastaTakipPage() {
  const [rangeDays, setRangeDays] = useState<"30" | "60" | "90">("90");
  const cached = useMemo(() => readCachedDashboard(rangeDays), [rangeDays]);
  const [appointments, setAppointments] = useState<Appointment[]>(() => cached.appointments);
  const [manualFollowUps, setManualFollowUps] = useState<ManualFollowUp[]>(() => cached.manualFollowUps);
  const [staff, setStaff] = useState<Staff[]>(() => cached.staff);
  const [loading, setLoading] = useState(() => cached.appointments.length === 0 && cached.manualFollowUps.length === 0 && cached.staff.length === 0);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [followFilter, setFollowFilter] = useState<"TUMU" | "GELMEDI" | "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "DIGER">("TUMU");
  const [followTypeQuery, setFollowTypeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TUMU" | "ACIK" | "KAPALI">("ACIK");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<"hastalar" | "gorevler">("hastalar");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [denseView, setDenseView] = useState(true);
  const [selectedDetailKey, setSelectedDetailKey] = useState("");
  const [userRole, setUserRole] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { showToast } = useToast();

  const setSuccessWithToast = (msg: string) => {
    setSuccess(msg);
    if (msg) {
      try { showToast({ title: 'Başarılı', message: msg, duration: 3000, type: 'success' }); } catch {}
    }
  };

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [manualDoctorId, setManualDoctorId] = useState("");
  const [manualTypeInput, setManualTypeInput] = useState("Tekrar aranacak");
  const [customTypeOptions, setCustomTypeOptions] = useState<string[]>([]);
  const [manualPriority, setManualPriority] = useState<1 | 2 | 3>(2);
  const [manualNextActionAt, setManualNextActionAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIsoInputValue(d);
  });
  const [manualNote, setManualNote] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);
  const [activeHistoryFollowUpId, setActiveHistoryFollowUpId] = useState("");
  const [followUpEvents, setFollowUpEvents] = useState<FollowUpEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [eventForm, setEventForm] = useState(() => ({
    occurredAt: toIsoInputValue(new Date()),
    channel: "Telefon",
    summary: "",
    detail: "",
    patientResponse: "",
    nextStep: "",
  }));
  const [clinicTasks, setClinicTasks] = useState<ClinicTask[]>(() => cached.clinicTasks);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<ClinicTask["type"]>("DIGER");
  const [taskPriority, setTaskPriority] = useState<1 | 2 | 3>(2);
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [taskBusyId, setTaskBusyId] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";

  const loadData = useCallback(async () => {
    const cacheKey = `hasta-takip:dashboard:${rangeDays}`;
    let hadCached = false;
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        try {
          const cached = JSON.parse(raw) as {
            userRole?: string;
            appointments?: Appointment[];
            followUps?: ManualFollowUp[];
            staff?: Staff[];
            clinicTasks?: ClinicTask[];
          };

          if (Array.isArray(cached?.appointments) && Array.isArray(cached?.followUps)) {
            setAppointments(cached.appointments);
            setManualFollowUps(cached.followUps);
            if (Array.isArray(cached.staff)) setStaff(cached.staff);
            if (Array.isArray(cached.clinicTasks)) setClinicTasks(cached.clinicTasks);
            if (cached.userRole) setUserRole(cached.userRole);
            hadCached = true;
          }
        } catch {}
      }
    }

    setLoading(!hadCached);
    setError("");
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Number(rangeDays));

    try {
      const [meRes, apptRes, followRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`),
        fetch(`/api/patient-follow-ups?from=${from.toISOString()}&to=${to.toISOString()}`),
      ]);

      const meData = await meRes.json();
      const apptData = await apptRes.json();
      const followData = await followRes.json();

      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      const nextRole = preview || meData?.role || "";
      const nextAppointments = Array.isArray(apptData) ? apptData : [];
      const nextFollowUps = Array.isArray(followData) ? followData : [];

      setUserRole(nextRole);
      setAppointments(nextAppointments);
      setManualFollowUps(nextFollowUps);

      void Promise.allSettled([
        fetch("/api/staff")
          .then((r) => r.json())
          .then((staffData) => {
            const nextStaff = Array.isArray(staffData) ? staffData : [];
            setStaff(nextStaff);
            if (typeof window !== "undefined") {
              const raw = sessionStorage.getItem(cacheKey);
              if (raw) {
                try {
                  const cached = JSON.parse(raw) as Record<string, unknown>;
                  sessionStorage.setItem(cacheKey, JSON.stringify({
                    ...cached,
                    staff: nextStaff,
                  }));
                } catch {}
              }
            }
          })
          .catch(() => {}),
        fetch("/api/clinic-tasks?take=200")
          .then((r) => r.json())
          .then((tasksData) => {
            const nextTasks = Array.isArray(tasksData) ? tasksData : [];
            setClinicTasks(nextTasks);
            if (typeof window !== "undefined") {
              const raw = sessionStorage.getItem(cacheKey);
              if (raw) {
                try {
                  const cached = JSON.parse(raw) as Record<string, unknown>;
                  sessionStorage.setItem(cacheKey, JSON.stringify({
                    ...cached,
                    clinicTasks: nextTasks,
                  }));
                } catch {}
              }
            }
          })
          .catch(() => {}),
      ]);

      if (typeof window !== "undefined") {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          userRole: nextRole,
          appointments: nextAppointments,
          followUps: nextFollowUps,
        }));
      }
    } catch {
      setError("Takip verileri yuklenemedi.");
      setAppointments([]);
      setManualFollowUps([]);
      setClinicTasks([]);
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadData();
      }, 300);
    };

    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [loadData]);

  useEffect(() => {
    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      fetch("/api/auth/me").then((r) => r.json()).then((d) => setUserRole(preview || d?.role || "")).catch(() => {});
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("hasta-takip-custom-types") || "[]";
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const cleaned = list.map((x) => String(x || "").trim()).filter(Boolean);
        setCustomTypeOptions(Array.from(new Set(cleaned)));
      }
    } catch {
      setCustomTypeOptions([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("hasta-takip-custom-types", JSON.stringify(customTypeOptions));
  }, [customTypeOptions]);

  useEffect(() => {
    if (patientSearch.trim().length < 2) {
      setPatientResults([]);
      setPatientSearchError("");
      setPatientSearchLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setPatientSearchLoading(true);
      setPatientSearchError("");
      fetch(`/api/patients?q=${encodeURIComponent(patientSearch.trim())}&take=8`)
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) {
            throw new Error(body?.message || "Hasta arama icin yetki veya erisim hatasi olustu.");
          }
          return body;
        })
        .then((d) => {
          const rows = Array.isArray(d?.patients)
            ? d.patients
            : Array.isArray(d)
              ? d
              : Array.isArray(d?.items)
                ? d.items
                : [];
          setPatientResults(rows.map((p: PatientOption) => ({ id: p.id, fullName: p.fullName, phone: p.phone })));
          if (rows.length === 0) {
            setPatientSearchError("Hasta bulunamadı. Farklı bir anahtar kelime deneyin.");
          }
        })
        .catch((e: unknown) => {
          setPatientResults([]);
          setPatientSearchError(e instanceof Error ? e.message : "Hasta arama yapilamadi.");
        })
        .finally(() => setPatientSearchLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const openManualByAppointment = useMemo(() => {
    const set = new Set<string>();
    manualFollowUps.forEach((f) => {
      if (f.status === "ACIK" && f.appointmentId) set.add(f.appointmentId);
    });
    return set;
  }, [manualFollowUps]);

  const followTypeOptions = useMemo(() => {
    const derived = manualFollowUps
      .map((f) => parseCustomTypeFromNote(f.note).customType)
      .filter(Boolean);
    return Array.from(new Set([...MANUAL_TYPE_OPTIONS, ...derived, ...customTypeOptions]));
  }, [manualFollowUps, customTypeOptions]);

  const items = useMemo<FollowItem[]>(() => {
    const fromAppointments: FollowItem[] = appointments
      .filter((a) => appointmentNeedsFollowUp(a.status, a.note))
      .filter((a) => !openManualByAppointment.has(a.id))
      .map((a) => {
        const parsed = parseAppointmentNote(a.note);
        const followType = a.status === "GELMEDI" ? "GELMEDI" : parsed.followUp;
        const createdAt = a.startAt;
        const ageDays = dayDiff(createdAt);
        return {
          key: `appt-${a.id}`,
          source: "APPOINTMENT",
          appointmentId: a.id,
          patientId: a.patient?.id || "",
          patientName: a.patient?.fullName || "Hasta",
          patientPhone: a.patient?.phone || null,
          doctorId: a.doctor?.id,
          doctorName: a.doctor?.fullName || "Doktor atanmamis",
          type: followType,
          followUpLabel: FOLLOW_LABELS[followType] || getFollowUpMeta(parsed.followUp).label,
          statusLabel: STATUS_LABELS[a.status] || a.status,
          note: parsed.detail || "Randevu notu bulunmuyor.",
          isOpen: true,
          priority: ageDays > 7 ? 3 : ageDays > 3 ? 2 : 1,
          createdAt,
          nextActionAt: null,
          ageDays,
          appointmentDateLabel: new Date(a.startAt).toLocaleString("tr-TR"),
          followBadgeClass: followBadgeClassByType(followType),
        };
      });

    const fromManual: FollowItem[] = manualFollowUps.map((f) => {
      const sourceDate = f.appointment?.startAt || f.createdAt;
      const custom = parseCustomTypeFromNote(f.note);
      const resolvedLabel = custom.customType || FOLLOW_LABELS[f.type] || f.type;
      return {
        key: `manual-${f.id}`,
        source: "MANUAL",
        followUpId: f.id,
        appointmentId: f.appointmentId || undefined,
        patientId: f.patientId,
        patientName: f.patient?.fullName || "Hasta",
        patientPhone: f.patient?.phone || null,
        doctorId: f.doctorId || f.appointment?.doctor?.id || undefined,
        doctorName: f.assignedDoctor?.fullName || f.appointment?.doctor?.fullName || "Doktor atanmamis",
        type: f.type,
        followUpLabel: resolvedLabel,
        statusLabel: f.status === "KAPALI" ? "Kapalı" : "Açık",
        note: custom.cleanNote || f.resolutionNote || "Takip notu girilmedi.",
        isOpen: f.status === "ACIK",
        priority: f.priority,
        createdAt: sourceDate,
        nextActionAt: f.nextActionAt || null,
        ageDays: dayDiff(sourceDate),
        appointmentDateLabel: f.appointment?.startAt ? new Date(f.appointment.startAt).toLocaleString("tr-TR") : "Manuel takip",
        followBadgeClass: followBadgeClassByType(f.type),
      };
    });

    const merged = [...fromManual, ...fromAppointments];
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    return merged
      .filter((item) => {
        if (statusFilter === "ACIK") return item.isOpen;
        if (statusFilter === "KAPALI") return !item.isOpen;
        return true;
      })
      .filter((item) => {
        if (followFilter === "TUMU") return true;
        return item.type === followFilter;
      })
      .filter((item) => {
        const q = followTypeQuery.trim().toLocaleLowerCase("tr-TR");
        if (!q) return true;
        return item.followUpLabel.toLocaleLowerCase("tr-TR").includes(q);
      })
      .filter((item) => (doctorFilter ? item.doctorId === doctorFilter : true))
      .filter((item) => {
        if (!normalizedQuery) return true;
        const haystack = [
          item.patientName,
          hidePhone ? null : item.patientPhone,
          item.doctorName,
          item.note,
          item.followUpLabel,
        ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [appointments, manualFollowUps, openManualByAppointment, query, followFilter, followTypeQuery, statusFilter, doctorFilter, hidePhone]);

  const stats = useMemo(() => {
    const all = [...manualFollowUps, ...appointments.filter((a) => appointmentNeedsFollowUp(a.status, a.note))];
    return {
      total: all.length,
      open: items.filter((i) => i.isOpen).length,
      noShow: items.filter((i) => i.type === "GELMEDI").length,
      callBack: items.filter((i) => i.type === "GERI_ARA").length,
      unreachable: items.filter((i) => i.type === "ULASILAMADI").length,
      waitingReturn: items.filter((i) => i.type === "DONUS_BEKLENIYOR").length,
      highPriority: items.filter((i) => i.priority === 3 && i.isOpen).length,
    };
  }, [manualFollowUps, appointments, items]);

  const detailItem = useMemo(() => items.find((item) => item.key === selectedDetailKey) || null, [items, selectedDetailKey]);

  const updateManual = async (id: string, payload: Record<string, unknown>) => {
    setBusyId(id);
    setError("");
    setSuccessWithToast("");
    try {
      const res = await fetch(`/api/patient-follow-ups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Takip güncellenemedi.");
        return;
      }
      setManualFollowUps((prev) => prev.map((f) => (f.id === id ? (data as ManualFollowUp) : f)));
      setSuccessWithToast("Takip kaydı güncellendi.");
    } catch {
      setError("Takip güncelleme sırasında hata oluştu.");
    } finally {
      setBusyId("");
    }
  };

  const convertAppointmentToManual = async (item: FollowItem, type?: ManualFollowUp["type"]) => {
    if (!item.appointmentId || !item.patientId) return;
    setBusyId(item.key);
    setError("");
    setSuccessWithToast("");
    try {
      const payload = {
        patientId: item.patientId,
        appointmentId: item.appointmentId,
        doctorId: item.doctorId,
        type: type || (item.type === "GELMEDI" ? "GERI_ARA" : item.type === "DIGER" ? "DIGER" : item.type),
        priority: item.priority,
        note: item.note,
        nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      const res = await fetch("/api/patient-follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Manuel takibe donusturulemedi.");
        return;
      }
      setManualFollowUps((prev) => [data as ManualFollowUp, ...prev]);
      setSuccessWithToast("Kayıt manuel takibe dönüştürüldü.");
    } catch {
      setError("Dönüştürme sırasında hata oluştu.");
    } finally {
      setBusyId("");
    }
  };

  const markAppointmentNote = async (item: FollowItem, followUp: FollowUpKey, detail: string) => {
    if (!item.appointmentId) return;
    setBusyId(item.key);
    setError("");
    setSuccessWithToast("");
    try {
      const appt = appointments.find((a) => a.id === item.appointmentId);
      const parsed = parseAppointmentNote(appt?.note);
      const note = buildAppointmentNote(followUp, detail, parsed.treatment);
      const res = await fetch(`/api/appointments/${item.appointmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Randevu notu güncellenemedi.");
        return;
      }
      setAppointments((prev) => prev.map((a) => (a.id === item.appointmentId ? { ...a, note } : a)));
      setSuccessWithToast("Randevu notu güncellendi.");
    } catch {
      setError("Randevu notu güncellenirken hata oluştu.");
    } finally {
      setBusyId("");
    }
  };

  const createManualFollowUp = async () => {
    if (!selectedPatient) {
      setError("Lütfen bir hasta seçin.");
      return;
    }
    const resolvedType = resolveManualType(manualTypeInput);
    const finalNote = buildManualNote(resolvedType.apiType === "DIGER" ? resolvedType.label : "", manualNote);
    setCreatingManual(true);
    setError("");
    setSuccessWithToast("");
    try {
      const res = await fetch("/api/patient-follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: manualDoctorId || undefined,
          type: resolvedType.apiType,
          priority: manualPriority,
          note: finalNote.trim() || undefined,
          nextActionAt: manualNextActionAt ? new Date(manualNextActionAt).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Manuel takip oluşturulamadı.");
        return;
      }
      setManualFollowUps((prev) => [data as ManualFollowUp, ...prev]);
      setSuccessWithToast("Manuel takip kaydı oluşturuldu.");
      setSelectedPatient(null);
      setPatientSearch("");
      setPatientResults([]);
      setPatientSearchError("");
      setManualNote("");
      setManualTypeInput("Tekrar aranacak");
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setManualNextActionAt(toIsoInputValue(d));
      setManualPriority(2);
      setShowManualCreate(false);
    } catch {
      setError("Manuel takip oluşturma sırasında hata oluştu.");
    } finally {
      setCreatingManual(false);
    }
  };

  const createClinicTask = async () => {
    if (!selectedPatient) {
      setError("Görev için önce hasta seçin.");
      return;
    }
    if (!taskTitle.trim()) {
      setError("Görev başlığı boş bırakılamaz.");
      return;
    }

    setTaskSaving(true);
    setError("");
    setSuccessWithToast("");
    try {
      const res = await fetch("/api/clinic-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          title: taskTitle.trim(),
          details: taskDetails.trim() || undefined,
          type: taskType,
          priority: taskPriority,
          dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : undefined,
          assignedToIds: taskAssigneeIds,
          status: "ACIK",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Görev kaydı oluşturulamadı.");
        return;
      }
      setClinicTasks((prev) => [data as ClinicTask, ...prev]);
      setTaskTitle("");
      setTaskType("DIGER");
      setTaskPriority(2);
      setTaskDueAt("");
      setTaskDetails("");
      setTaskAssigneeIds([]);
      setSuccessWithToast("Görev hasta takip paneline eklendi.");
      setShowTaskCreate(false);
    } catch {
      setError("Görev kaydı sırasında hata oluştu.");
    } finally {
      setTaskSaving(false);
    }
  };

  const updateClinicTaskStatus = async (taskId: string, status: ClinicTask["status"]) => {
    setTaskBusyId(taskId);
    setError("");
    setSuccessWithToast("");
    try {
      const res = await fetch(`/api/clinic-tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Görev durumu güncellenemedi.");
        return;
      }
      setClinicTasks((prev) => prev.map((t) => (t.id === taskId ? (data as ClinicTask) : t)));
      setSuccessWithToast("Görev durumu güncellendi.");
    } catch {
      setError("Görev durumu değiştirilirken hata oluştu.");
    } finally {
      setTaskBusyId("");
    }
  };

  const reportRows = useMemo(() => {
    return items.map((i) => ({
      hasta: i.patientName,
      doktor: i.doctorName,
      takip: i.followUpLabel,
      durum: i.statusLabel,
      randevu: i.appointmentDateLabel,
      sonrakiAdim: i.nextActionAt ? new Date(i.nextActionAt).toLocaleString("tr-TR") : "-",
      yas: `${i.ageDays} gün`,
      not: i.note,
      kaynak: i.source === "MANUAL" ? "Manuel" : "Randevu",
    }));
  }, [items]);

  const downloadExcelReport = () => {
    const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const rows = reportRows.map((r, i) => {
      const bg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
      return `<tr style="background:${bg};font-size:12px;">
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.hasta)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.doktor)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.takip)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.durum)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.randevu)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.sonrakiAdim)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.yas)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.kaynak)}</td>
        <td style="border:1px solid #CBD5E1;padding:7px 10px;">${esc(r.not)}</td>
      </tr>`;
    }).join("");

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8"></head>
<body>
<table style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;">
  <tr><td colspan="9" style="background:#1E3A5F;color:#fff;font-size:18px;font-weight:700;padding:12px 14px;">KlinikModern - Hasta Takip Raporu</td></tr>
  <tr><td colspan="9" style="background:#F1F5F9;border:1px solid #E2E8F0;padding:8px 14px;color:#475569;">Oluşturma: ${new Date().toLocaleString("tr-TR")} | Kayıt: ${reportRows.length}</td></tr>
  <tr style="background:#1E3A5F;color:#fff;">
    <th style="border:1px solid #2D4F7C;padding:8px;">Hasta</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Doktor</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Takip</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Durum</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Randevu</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Sonraki Adim</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Yas</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Kaynak</th>
    <th style="border:1px solid #2D4F7C;padding:8px;">Not</th>
  </tr>
  ${rows || `<tr><td colspan="9" style="padding:14px;text-align:center;color:#64748B;">Kayıt bulunamadı</td></tr>`}
</table>
</body>
</html>`;

    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hasta-takip-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const rowsHtml = reportRows.length ? reportRows.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? "#F8FAFC" : "#FFFFFF"};">
        <td>${esc(r.hasta)}</td><td>${esc(r.doktor)}</td><td>${esc(r.takip)}</td><td>${esc(r.durum)}</td>
        <td>${esc(r.randevu)}</td><td>${esc(r.sonrakiAdim)}</td><td>${esc(r.yas)}</td><td>${esc(r.kaynak)}</td><td>${esc(r.not)}</td>
      </tr>
    `).join("") : `<tr><td colspan="9" style="text-align:center;padding:18px;color:#94A3B8;">Kayıt bulunamadı</td></tr>`;

    const win = window.open("", "_blank", "width=1200,height=820");
    if (!win) {
      setError("Yazdirma penceresi acilamadi.");
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Hasta Takip Raporu</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#0F172A;margin:0}.page{padding:16mm}
.head{display:flex;justify-content:space-between;border-bottom:3px solid #1E3A5F;padding-bottom:10px;margin-bottom:10px}
.h1{font-size:22px;font-weight:800;color:#1E3A5F}.sub{font-size:11px;color:#64748B}
.stats{display:flex;gap:10px;margin-bottom:10px}.box{flex:1;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px;background:#F8FAFC}
.num{font-size:20px;font-weight:800}.lbl{font-size:10px;text-transform:uppercase;color:#64748B}
table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#1E3A5F;color:#fff}
th,td{border:1px solid #E2E8F0;padding:7px 8px;text-align:left;vertical-align:top}th{border-color:#2D4F7C}
.foot{margin-top:12px;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between}
@media print{thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
<div class="page">
  <div class="head"><div><div class="h1">KlinikModern</div><div class="sub">Hasta Takip Raporu</div></div><div class="sub">Olusturma: ${new Date().toLocaleString("tr-TR")}</div></div>
  <div class="stats">
    <div class="box"><div class="num">${stats.total}</div><div class="lbl">Toplam</div></div>
    <div class="box"><div class="num">${stats.open}</div><div class="lbl">Açık</div></div>
    <div class="box"><div class="num">${stats.highPriority}</div><div class="lbl">Yüksek Öncelik</div></div>
    <div class="box"><div class="num">${stats.noShow}</div><div class="lbl">Gelmedi</div></div>
    <div class="box"><div class="num">${stats.waitingReturn}</div><div class="lbl">Dönüş Bekliyor</div></div>
  </div>
  <table>
    <thead><tr><th>Hasta</th><th>Doktor</th><th>Takip</th><th>Durum</th><th>Randevu</th><th>Sonraki Adim</th><th>Yas</th><th>Kaynak</th><th>Not</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot"><span>Bu çıktı KlinikModern takip panelinden oluşturuldu.</span><span>${new Date().toLocaleString("tr-TR")}</span></div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    win.document.close();
    win.focus();
  };

  const doctors = useMemo(() => staff.filter((s) => s.role === "DOKTOR"), [staff]);
  const openClinicTasks = useMemo(
    () => clinicTasks.filter((t) => t.status === "ACIK" || t.status === "BEKLEMEDE").sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }),
    [clinicTasks],
  );
  const manualSubmitDisabledReason = creatingManual
    ? "Kayıt oluşturuluyor..."
    : !selectedPatient
      ? "Kaydetmek icin once hasta secin."
      : !manualTypeInput.trim()
        ? "Takip tipi secin."
        : "";

  const resetListFilters = () => {
    setQuery("");
    setFollowFilter("TUMU");
    setFollowTypeQuery("");
    setStatusFilter("ACIK");
    setDoctorFilter("");
  };

  const openDetailModal = async (item: FollowItem) => {
    setSelectedDetailKey(item.key);
    if (item.source === "MANUAL" && item.followUpId) {
      setActiveHistoryFollowUpId(item.followUpId);
      await loadFollowUpEvents(item.followUpId);
      return;
    }
    setActiveHistoryFollowUpId("");
    setFollowUpEvents([]);
    resetEventForm();
  };

  const closeDetailModal = () => {
    setSelectedDetailKey("");
    setActiveHistoryFollowUpId("");
    setFollowUpEvents([]);
    resetEventForm();
  };

  const resetEventForm = () => {
    setEditingEventId("");
    setEventForm({
      occurredAt: toIsoInputValue(new Date()),
      channel: "Telefon",
      summary: "",
      detail: "",
      patientResponse: "",
      nextStep: "",
    });
  };

  const applyEventPreset = (preset: (typeof EVENT_PRESETS)[number]) => {
    setEditingEventId("");
    setEventForm((prev) => ({
      ...prev,
      channel: preset.channel,
      summary: preset.summary,
      patientResponse: preset.patientResponse,
      nextStep: preset.nextStep,
      detail: preset.detail,
    }));
  };

  const loadFollowUpEvents = useCallback(async (followUpId: string) => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/patient-follow-ups/${followUpId}/events`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError(data?.message || "Süreç notları yüklenemedi.");
        setFollowUpEvents([]);
        return;
      }
      setFollowUpEvents(Array.isArray(data) ? (data as FollowUpEvent[]) : []);
    } catch {
      setError("Süreç notları yüklenirken hata oluştu.");
      setFollowUpEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const toggleFollowUpHistory = async (followUpId: string) => {
    if (activeHistoryFollowUpId === followUpId) {
      setActiveHistoryFollowUpId("");
      setFollowUpEvents([]);
      resetEventForm();
      return;
    }
    setActiveHistoryFollowUpId(followUpId);
    resetEventForm();
    await loadFollowUpEvents(followUpId);
  };

  const saveFollowUpEvent = async () => {
    if (!activeHistoryFollowUpId) return;
    if (!eventForm.summary.trim()) {
      setError("Süreç özeti boş bırakılamaz.");
      return;
    }

    const occurredAt = new Date(eventForm.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setError("Geçersiz tarih/saat seçildi. Lütfen tarihi tekrar seçin.");
      return;
    }

    setEventBusy(true);
    setError("");
    setSuccessWithToast("");
    try {
      const url = editingEventId
        ? `/api/patient-follow-ups/${activeHistoryFollowUpId}/events/${editingEventId}`
        : `/api/patient-follow-ups/${activeHistoryFollowUpId}/events`;
      const method = editingEventId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurredAt: occurredAt.toISOString(),
          channel: eventForm.channel.trim() || undefined,
          summary: eventForm.summary.trim(),
          detail: eventForm.detail.trim() || undefined,
          patientResponse: eventForm.patientResponse.trim() || undefined,
          nextStep: eventForm.nextStep.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Süreç notu kaydedilemedi.");
        return;
      }
      await loadFollowUpEvents(activeHistoryFollowUpId);
      resetEventForm();
      setSuccessWithToast(editingEventId ? "Süreç notu güncellendi." : "Süreç notu eklendi.");
    } catch {
      setError("Süreç notu kaydetme sırasında hata oluştu.");
    } finally {
      setEventBusy(false);
    }
  };

  const startEditFollowUpEvent = (event: FollowUpEvent) => {
    setEditingEventId(event.id);
    setEventForm({
      occurredAt: toIsoInputValue(new Date(event.occurredAt)),
      channel: event.channel || "",
      summary: event.summary || "",
      detail: event.detail || "",
      patientResponse: event.patientResponse || "",
      nextStep: event.nextStep || "",
    });
  };

  const deleteFollowUpEvent = async (eventId: string) => {
    if (!activeHistoryFollowUpId) return;
    setEventBusy(true);
    setError("");
    setSuccessWithToast("");
    try {
      const res = await fetch(`/api/patient-follow-ups/${activeHistoryFollowUpId}/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Süreç notu silinemedi.");
        return;
      }
      await loadFollowUpEvents(activeHistoryFollowUpId);
      if (editingEventId === eventId) resetEventForm();
      setSuccessWithToast("Süreç notu silindi.");
    } catch {
      setError("Süreç notu silinirken hata oluştu.");
    } finally {
      setEventBusy(false);
    }
  };

  const printFollowUpHistory = async (item: FollowItem) => {
    if (!item.followUpId) {
      setError("Süreç PDF çıkarmak için kayıt manuel takip olmalıdır.");
      return;
    }
    try {
      const res = await fetch(`/api/patient-follow-ups/${item.followUpId}/events`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError((data as { message?: string })?.message || "Süreç notları alınıp PDF oluşturulamadı.");
        return;
      }
      const events = Array.isArray(data) ? (data as FollowUpEvent[]) : [];
      const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
      const rows = events.length
        ? events.map((ev, i) => `
          <tr style="background:${i % 2 === 0 ? "#F8FAFC" : "#FFFFFF"};">
            <td>${esc(new Date(ev.occurredAt).toLocaleString("tr-TR"))}</td>
            <td>${esc(ev.channel || "-")}</td>
            <td>${esc(ev.summary || "-")}</td>
            <td>${esc(ev.patientResponse || "-")}</td>
            <td>${esc(ev.nextStep || "-")}</td>
            <td>${esc(ev.detail || "-")}</td>
          </tr>
        `).join("")
        : `<tr><td colspan="6" style="text-align:center;padding:18px;color:#94A3B8;">Süreç notu bulunamadı</td></tr>`;

      const win = window.open("", "_blank", "width=1200,height=820");
      if (!win) {
        setError("PDF penceresi acilamadi.");
        return;
      }

      win.document.write(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Hasta Süreç Takibi</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#0F172A;margin:0}.page{padding:16mm}
.head{display:flex;justify-content:space-between;border-bottom:3px solid #1E3A5F;padding-bottom:10px;margin-bottom:10px}
.h1{font-size:22px;font-weight:800;color:#1E3A5F}.sub{font-size:11px;color:#64748B}
table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#1E3A5F;color:#fff}
th,td{border:1px solid #E2E8F0;padding:7px 8px;text-align:left;vertical-align:top}th{border-color:#2D4F7C}
</style></head><body>
<div class="page">
  <div class="head">
    <div><div class="h1">Hasta Süreç Takip Özeti</div><div class="sub">KlinikModern</div></div>
    <div class="sub">Olusturma: ${new Date().toLocaleString("tr-TR")}</div>
  </div>
  <p><strong>Hasta:</strong> ${esc(item.patientName)} | <strong>Takip:</strong> ${esc(item.followUpLabel)} | <strong>Durum:</strong> ${esc(item.statusLabel)}</p>
  <table>
    <thead><tr><th>Tarih</th><th>Kanal</th><th>Süreç Özeti</th><th>Hasta Cevabı</th><th>Sonraki Adım</th><th>Detay</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
      win.document.close();
      win.focus();
    } catch {
      setError("Süreç PDF oluşturma sırasında hata oluştu.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black tracking-tight text-slate-900">Hasta Takip</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{items.length} açık kayıt</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{openClinicTasks.length} görev</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={printReport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">PDF Al</button>
          <button onClick={downloadExcelReport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Excel Al</button>
          <Link href="/randevu" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Randevulara Git</Link>
        </div>
      </div>

      {(error || success) && (
        <div className={"rounded-lg border px-3 py-2 text-sm " + (error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {error || success}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setActiveTab("hastalar")} className={"rounded-xl px-3 py-2.5 text-sm font-bold " + (activeTab === "hastalar" ? "bg-primary text-white" : "bg-slate-100 text-slate-700")}>Aksiyon Gerektiren Hastalar</button>
          <button type="button" onClick={() => setActiveTab("gorevler")} className={"rounded-xl px-3 py-2.5 text-sm font-bold " + (activeTab === "gorevler" ? "bg-primary text-white" : "bg-slate-100 text-slate-700")}>Görevler</button>
        </div>
      </div>

      {activeTab === "hastalar" && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hasta, doktor, not veya takip tipi ara..."
                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button type="button" onClick={() => setShowAdvancedFilters((v) => !v)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{showAdvancedFilters ? "Filtreleri Gizle" : "Gelişmiş Filtreler"}</button>
              <button type="button" onClick={() => setDenseView((v) => !v)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{denseView ? "Detaylı Görünüm" : "Sade Görünüm"}</button>
              <button type="button" onClick={resetListFilters} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Temizle</button>
              <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(""); setPatientResults([]); setPatientSearchError(""); setShowManualCreate(true); }} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Manuel Takip Ekle</button>
            </div>

            {showAdvancedFilters && (
              <div className="mt-3 grid gap-3 lg:grid-cols-5">
                <select value={followFilter} onChange={(e) => setFollowFilter(e.target.value as typeof followFilter)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="TUMU">Tüm Takipler</option>
                  <option value="GELMEDI">Gelmedi</option>
                  <option value="GERI_ARA">Tekrar Aranacak</option>
                  <option value="ULASILAMADI">Ulaşılamayanlar</option>
                  <option value="DONUS_BEKLENIYOR">Dönüş Beklenenler</option>
                  <option value="DIGER">Diğer</option>
                </select>
                <input value={followTypeQuery} onChange={(e) => setFollowTypeQuery(e.target.value)} placeholder="Takip tipi icinde metin ara..." className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="ACIK">Açık Takipler</option>
                  <option value="KAPALI">Kapalı Takipler</option>
                  <option value="TUMU">Tümü</option>
                </select>
                <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="">Tüm Doktorlar</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
                <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value as typeof rangeDays)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="30">Son 30 gün</option>
                  <option value="60">Son 60 gün</option>
                  <option value="90">Son 90 gün</option>
                </select>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 className="text-base font-bold text-slate-900">Aksiyon Gerektiren Hasta Listesi</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{items.length} kayıt</span>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">Seçili filtrede takip kaydı bulunmuyor.</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={resetListFilters} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Filtreleri Temizle</button>
                  <button type="button" onClick={() => setStatusFilter("TUMU")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Tüm Durumlar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-3" aria-busy={loading}>
                {items.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-slate-300">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.patientName}</p>
                          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + item.followBadgeClass}>{item.followUpLabel}</span>
                          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (item.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>{item.statusLabel}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{item.doctorName} · {item.ageDays} gün · Öncelik {item.priority}</p>
                        {!denseView && <p className="mt-1 text-xs text-slate-700">{shortText(item.note || "Not bulunmuyor.", 65)}</p>}
                        {item.nextActionAt && <p className="mt-0.5 text-xs text-amber-700">Sonraki adım: {new Date(item.nextActionAt).toLocaleString("tr-TR")}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openDetailModal(item)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Detay</button>
                        {!hidePhone && item.patientPhone && <a href={`tel:${item.patientPhone}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ara</a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "gorevler" && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Görevler</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{openClinicTasks.length} açık/beklemede</span>
              <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(""); setPatientResults([]); setPatientSearchError(""); setShowTaskCreate(true); }} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Görev Ekle</button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {openClinicTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Açık veya beklemede görev yok.</p>
            ) : (
              openClinicTasks.slice(0, 30).map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + getTaskStatusBadge(task.status)}>{TASK_STATUS_LABELS[task.status]}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{TASK_TYPE_LABELS[task.type]}</span>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + getPriorityBadge(task.priority)}>Öncelik {task.priority}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {task.patient?.fullName || "Hasta baglanmamis"}
                        {(task.assignees && task.assignees.length > 0)
                          ? ` · Atanan: ${task.assignees.map((a) => a.user.fullName).join(", ")}`
                          : (task.assignedTo?.fullName ? ` · Atanan: ${task.assignedTo.fullName}` : "")}
                        {task.dueAt ? ` · Termin: ${new Date(task.dueAt).toLocaleString("tr-TR")}` : ""}
                      </p>
                      {task.details ? <p className="mt-1 text-xs text-slate-700">{shortText(task.details, 90)}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {task.patient?.id ? (
                        <Link href={`/hasta-detay?id=${task.patient.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hasta</Link>
                      ) : null}
                      {task.status !== "BEKLEMEDE" && (
                        <button type="button" disabled={taskBusyId === task.id} onClick={() => void updateClinicTaskStatus(task.id, "BEKLEMEDE")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Beklet</button>
                      )}
                      {task.status !== "TAMAMLANDI" && (
                        <button type="button" disabled={taskBusyId === task.id} onClick={() => void updateClinicTaskStatus(task.id, "TAMAMLANDI")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Tamamla</button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showManualCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Manuel Takip Ekle</h3>
              <button type="button" onClick={() => setShowManualCreate(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kapat</button>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hasta</label>
                <input value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); setPatientSearchError(""); }} placeholder="Ad, telefon veya TC ile ara" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                {patientSearchLoading && <p className="mt-2 text-xs text-slate-600">Hasta aranıyor...</p>}
                {selectedPatient ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Seçili hasta: <span className="font-semibold">{selectedPatient.fullName}</span>{!hidePhone && selectedPatient.phone ? ` - ${selectedPatient.phone}` : ""}</div>
                ) : patientResults.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {patientResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatientSearch(p.fullName); setPatientResults([]); }} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <span>{p.fullName}</span>
                        {!hidePhone && <span className="text-xs text-slate-400">{p.phone || "-"}</span>}
                      </button>
                    ))}
                  </div>
                ) : patientSearch.trim().length >= 2 && patientSearchError ? (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{patientSearchError}</div>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Doktor</label>
                <select value={manualDoctorId} onChange={(e) => setManualDoctorId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="">Seçilmedi</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Takip Tipi</label>
                <select value={manualTypeInput} onChange={(e) => setManualTypeInput(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                  {followTypeOptions.length === 0 ? <option value={manualTypeInput}>{manualTypeInput || "Sonuç bulunamadı"}</option> : followTypeOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Öncelik</label>
                <select value={manualPriority} onChange={(e) => setManualPriority(Number(e.target.value) as 1 | 2 | 3)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value={1}>Düşük</option>
                  <option value={2}>Orta</option>
                  <option value={3}>Yüksek</option>
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px_160px]">
              <textarea value={manualNote} onChange={(e) => setManualNote(e.target.value)} rows={2} placeholder="Takip notu" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sonraki Aksiyon</label>
                <input type="datetime-local" value={manualNextActionAt} onChange={(e) => setManualNextActionAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </div>
              <button onClick={() => void createManualFollowUp()} disabled={Boolean(manualSubmitDisabledReason)} className="mt-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{creatingManual ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
            {manualSubmitDisabledReason && <p className="mt-2 text-xs font-medium text-amber-700">{manualSubmitDisabledReason}</p>}
          </div>
        </div>
      )}

      {showTaskCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Görev Ekle</h3>
              <button type="button" onClick={() => setShowTaskCreate(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kapat</button>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hasta</label>
                <input value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); setPatientSearchError(""); }} placeholder="Ad, telefon veya TC ile ara" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                {patientSearchLoading && <p className="mt-2 text-xs text-slate-600">Hasta aranıyor...</p>}
                {selectedPatient ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Seçili hasta: <span className="font-semibold">{selectedPatient.fullName}</span>{!hidePhone && selectedPatient.phone ? ` - ${selectedPatient.phone}` : ""}</div>
                ) : patientResults.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {patientResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatientSearch(p.fullName); setPatientResults([]); }} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <span>{p.fullName}</span>
                        {!hidePhone && <span className="text-xs text-slate-400">{p.phone || "-"}</span>}
                      </button>
                    ))}
                  </div>
                ) : patientSearch.trim().length >= 2 && patientSearchError ? (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{patientSearchError}</div>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Görev Başlığı</label>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Görev başlığı" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_0.6fr_1fr_1fr]">
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as ClinicTask["type"])} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="PARCA_SIPARIS">Parça Sipariş</option>
                <option value="LAB">Laboratuvar</option>
                <option value="ARAMA">Arama</option>
                <option value="EVRAK">Evrak</option>
                <option value="DIGER">Diğer</option>
              </select>
              <select value={taskPriority} onChange={(e) => setTaskPriority(Number(e.target.value) as 1 | 2 | 3)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value={1}>Düşük</option>
                <option value={2}>Orta</option>
                <option value={3}>Yüksek</option>
              </select>
              <div className="max-h-[92px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm">
                {staff.length === 0 ? <p className="text-xs text-slate-400">Personel bulunamadı</p> : staff.map((s) => {
                  const checked = taskAssigneeIds.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 py-1 text-xs text-slate-700">
                      <input type="checkbox" checked={checked} onChange={(e) => setTaskAssigneeIds((prev) => e.target.checked ? Array.from(new Set([...prev, s.id])) : prev.filter((id) => id !== s.id))} />
                      <span>{s.fullName}</span>
                    </label>
                  );
                })}
              </div>
              <input type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>

            <textarea value={taskDetails} onChange={(e) => setTaskDetails(e.target.value)} rows={2} placeholder="Görev detayı (opsiyonel)" className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTaskCreate(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">İptal</button>
              <button type="button" onClick={() => void createClinicTask()} disabled={taskSaving || !selectedPatient || !taskTitle.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{taskSaving ? "Ekleniyor..." : "Görevi Kaydet"}</button>
            </div>
          </div>
        </div>
      )}

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{detailItem.patientName}</h3>
                <p className="text-sm text-slate-500">{detailItem.followUpLabel} · {detailItem.statusLabel}</p>
              </div>
              <button type="button" onClick={closeDetailModal} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Kapat</button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_1fr_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getPriorityBadge(detailItem.priority)}>Öncelik {detailItem.priority}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + detailItem.followBadgeClass}>{detailItem.followUpLabel}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (detailItem.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>{detailItem.statusLabel}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getAgeBadge(detailItem.ageDays)}>{detailItem.ageDays} gün</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{detailItem.source === "MANUAL" ? "Manuel" : "Randevu"}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{detailItem.appointmentDateLabel} · {detailItem.doctorName}</p>
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Not</p>
                    <p className="mt-1 text-sm text-slate-700">{detailItem.note}</p>
                  </div>
                  {detailItem.nextActionAt && <p className="mt-2 text-xs text-amber-700">Sonraki adım: {new Date(detailItem.nextActionAt).toLocaleString("tr-TR")}</p>}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">İletişim</p>
                  {hidePhone ? (
                    <p className="mt-1 text-sm text-slate-400 italic">Telefon gizli</p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-700">{detailItem.patientPhone || "Kayıtlı telefon yok"}</p>
                  )}
                  {!hidePhone && detailItem.patientPhone && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`tel:${detailItem.patientPhone}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ara</a>
                      <a href={`https://wa.me/90${detailItem.patientPhone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hızlı İşlemler</p>
                  {detailItem.source === "MANUAL" && detailItem.followUpId ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "GERI_ARA", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 86400000).toISOString() })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Tekrar Ara</button>
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "ULASILAMADI", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 2 * 86400000).toISOString() })} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Ulaşılamadı</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "DONUS_BEKLENIYOR", note: buildManualNote("", detailItem.note), nextActionAt: new Date(Date.now() + 3 * 86400000).toISOString() })} className="rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">Dönüş Bekleniyor</button>
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { close: true, resolutionNote: "Takip kapatildi", lastContactAt: new Date().toISOString() })} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Takibi Kapat</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button disabled={busyId === detailItem.key} onClick={() => void convertAppointmentToManual(detailItem)} className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">Manuel Takibe Dönüştür</button>
                      <button disabled={busyId === detailItem.key} onClick={() => void markAppointmentNote(detailItem, "GERI_ARA", detailItem.note)} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Notu Geri Ara Yap</button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {detailItem.source === "MANUAL" && detailItem.followUpId && (
                    <button type="button" onClick={() => void printFollowUpHistory(detailItem)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">PDF Al</button>
                  )}
                  {detailItem.patientId && <Link href={`/hasta-detay?id=${detailItem.patientId}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Hasta Kartı</Link>}
                  <Link href={detailItem.patientId ? `/randevu?patientId=${detailItem.patientId}` : "/randevu"} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Randevuya Git</Link>
                </div>
              </div>

              {detailItem.source === "MANUAL" && detailItem.followUpId && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-indigo-900">Hasta Bazlı Görüşme ve Süreç Notları</h3>
                    <span className="text-xs text-indigo-700">{followUpEvents.length} kayıt</span>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {EVENT_PRESETS.map((preset) => (
                      <button key={preset.label} type="button" onClick={() => applyEventPreset(preset)} className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">{preset.label}</button>
                    ))}
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    <input type="datetime-local" value={eventForm.occurredAt} onChange={(e) => setEventForm((prev) => ({ ...prev, occurredAt: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                    <select value={eventForm.channel} onChange={(e) => setEventForm((prev) => ({ ...prev, channel: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm">
                      {EVENT_CHANNEL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <input value={eventForm.summary} onChange={(e) => setEventForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Kısa sonuç, örnek: Arandı, açmadı" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm md:col-span-1" />
                    <textarea value={eventForm.patientResponse} onChange={(e) => setEventForm((prev) => ({ ...prev, patientResponse: e.target.value }))} rows={2} placeholder="Hasta ne söyledi?" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                    <textarea value={eventForm.nextStep} onChange={(e) => setEventForm((prev) => ({ ...prev, nextStep: e.target.value }))} rows={2} placeholder="Bu hastada sonraki adım ne olacak?" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                    <textarea value={eventForm.detail} onChange={(e) => setEventForm((prev) => ({ ...prev, detail: e.target.value }))} rows={2} placeholder="Detaylı görüşme notu" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveFollowUpEvent()} disabled={eventBusy || eventsLoading} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{eventBusy ? "Kaydediliyor..." : editingEventId ? "Hasta Notunu Güncelle" : "Hasta Notu Ekle"}</button>
                    {editingEventId && <button type="button" onClick={resetEventForm} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Düzenlemeyi İptal Et</button>}
                  </div>

                  {eventsLoading ? (
                    <div className="mt-3 space-y-2" aria-busy="true">
                      <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                    </div>
                  ) : followUpEvents.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">Bu hasta icin henuz gorusme notu yok. Ilk hasta notunu ekleyin.</p>
                  ) : (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-white">
                      <div className="border-b border-indigo-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Kayıt Geçmişi
                      </div>
                      <div className="max-h-[34vh] space-y-2 overflow-y-auto p-3">
                        {followUpEvents.map((ev, idx) => (
                          <div key={ev.id} className="rounded-lg border border-indigo-100 bg-slate-50/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-indigo-900">
                                #{followUpEvents.length - idx} · {new Date(ev.occurredAt).toLocaleString("tr-TR")} {ev.channel ? `· ${ev.channel}` : ""}
                              </p>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => startEditFollowUpEvent(ev)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Düzenle</button>
                                <button type="button" onClick={() => void deleteFollowUpEvent(ev.id)} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">Sil</button>
                              </div>
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{ev.summary}</p>
                            {ev.patientResponse && <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Hasta söyledi:</span> {ev.patientResponse}</p>}
                            {ev.nextStep && <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Planlanan sonraki adım:</span> {ev.nextStep}</p>}
                            {ev.detail && <p className="mt-1 text-xs text-slate-600">{ev.detail}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
