"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FollowUpKey,
  appointmentNeedsFollowUp,
  buildAppointmentNote,
  getFollowUpMeta,
  parseAppointmentNote,
} from "@/lib/appointment-follow-up";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { cachedGet } from "@/lib/client-cache";
import { confirmDialog } from "@/lib/confirm-client";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";

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
  labOrderId?: string | null;
  labTripId?: string | null;
  labOrder?: { id: string; labName: string; labType: string } | null;
};

type Staff = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean | null } | null };
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
  isLabProva?: boolean;
  labContext?: {
    orderToken?: string;
    tripToken?: string;
    groupKey?: string;
    labName?: string;
    labType?: string;
    receivedStep?: string;
    title: string;
  };
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

function toIsoInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayDiff(iso: string) {
  const now = Date.now();
  const target = new Date(iso).getTime();
  return Math.max(0, Math.floor((now - target) / 86_400_000));
}

function getAgeTone(days: number): BadgeTone {
  if (days <= 3) return "success";
  if (days <= 7) return "warning";
  return "critical";
}

function getPriorityTone(priority: number): BadgeTone {
  if (priority >= 3) return "critical";
  if (priority === 2) return "warning";
  return "info";
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

// structured: PatientFollowUp.labOrderId/labTripId (gerçek FK) doluysa oradan
// gelir ve önceliklidir; not metni yalnızca eski (backfill edilememiş) kayıtlar
// için yedek kaynaktır (bkz. denetim raporu Tema 3 — legacy uyum: Tema 8).
function parseLabFollowUpNote(
  note?: string | null,
  structured?: { labOrderId?: string | null; labTripId?: string | null; labOrder?: { labName?: string | null; labType?: string | null } | null }
) {
  const lines = (note || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const orderToken = lines.find((line) => line.startsWith("LAB_ORDER:"));
  const tripToken = lines.find((line) => line.startsWith("LAB_PROVA:"));
  const legacyLabLine = lines.find((line) => line.includes(" - ") && !line.startsWith("Adım #"));
  const [legacyLabType, legacyLabName] = legacyLabLine ? legacyLabLine.split(" - ").map((part) => part.trim()) : ["", ""];
  const legacyStepLine = lines.find((line) => line.startsWith("Adım #"));
  const legacyDescription = legacyStepLine?.split(":").slice(1).join(":").trim() || "";
  const legacyReceivedStep = legacyDescription.includes(" → ") ? legacyDescription.split(" → ")[1].trim() : "";
  const labType = structured?.labOrder?.labType || lines.find((line) => line.startsWith("İş:"))?.slice(3).trim() || legacyLabType;
  const labName = structured?.labOrder?.labName || lines.find((line) => line.startsWith("Laboratuvar:"))?.slice("Laboratuvar:".length).trim() || legacyLabName;
  const receivedStep = lines.find((line) => line.startsWith("Gelen/Prova:"))?.slice("Gelen/Prova:".length).trim() || legacyReceivedStep;
  const isLabProva = Boolean(
    structured?.labOrderId || structured?.labTripId || orderToken || tripToken || receivedStep ||
    lines.some((line) => line.toLocaleLowerCase("tr-TR").includes("laboratuvardan gelen prova"))
  );

  if (!isLabProva) return null;

  return {
    orderToken,
    tripToken,
    labName,
    labType,
    receivedStep,
    groupKey: structured?.labOrderId || orderToken || `${labType || "-"}::${labName || "-"}`,
    title: `${receivedStep || "Laboratuvar provası"} için randevu planlanacak`,
  };
}

function buildManualNote(customType: string, note: string) {
  const t = customType.trim();
  const n = note.trim();
  if (t && n) return `${CUSTOM_TYPE_PREFIX} ${t}\n${n}`;
  if (t) return `${CUSTOM_TYPE_PREFIX} ${t}`;
  return n;
}

function normalizeCustomTypes(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const label = String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const key = label.toLocaleLowerCase("tr-TR");
    if (!label || seen.has(key)) return;
    seen.add(key);
    result.push(label);
  });
  return result.slice(0, 80);
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
    };
  }

  try {
    const cached = JSON.parse(raw) as {
      userRole?: string;
      appointments?: Appointment[];
      followUps?: ManualFollowUp[];
      staff?: Staff[];
    };

    return {
      userRole: cached.userRole || "",
      appointments: Array.isArray(cached.appointments) ? cached.appointments : [],
      manualFollowUps: Array.isArray(cached.followUps) ? cached.followUps : [],
      staff: Array.isArray(cached.staff) ? cached.staff : [],
    };
  } catch {
    return {
      userRole: "",
      appointments: [] as Appointment[],
      manualFollowUps: [] as ManualFollowUp[],
      staff: [] as Staff[],
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

  const hidePhone = shouldHidePatientPhone(userRole);

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
          };

          if (Array.isArray(cached?.appointments) && Array.isArray(cached?.followUps)) {
            setAppointments(cached.appointments);
            setManualFollowUps(cached.followUps);
            if (Array.isArray(cached.staff)) setStaff(cached.staff);
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
      const [meData, apptRes, followRes] = await Promise.all([
        cachedGet<{ role?: string } | null>("/api/auth/me", 60_000),
        fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }),
        fetch(`/api/patient-follow-ups?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" }),
      ]);

      const apptData = await apptRes.json();
      const followData = await followRes.json();

      if (!apptRes.ok) {
        throw new Error(apptData?.message || "Randevu takip verileri yüklenemedi.");
      }
      if (!followRes.ok) {
        throw new Error(followData?.message || "Manuel takip verileri yüklenemedi.");
      }

      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      const nextRole = preview || meData?.role || "";
      const nextAppointments = Array.isArray(apptData) ? apptData : [];
      const nextFollowUps = Array.isArray(followData) ? followData : [];

      setUserRole(nextRole);
      setAppointments(nextAppointments);
      setManualFollowUps(nextFollowUps);

      void Promise.allSettled([
        cachedGet<unknown>("/api/staff", 60_000)
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
      ]);

      if (typeof window !== "undefined") {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          userRole: nextRole,
          appointments: nextAppointments,
          followUps: nextFollowUps,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Takip verileri yuklenemedi.");
      setAppointments([]);
      setManualFollowUps([]);
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

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadData();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadData]);

  useEffect(() => {
    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      cachedGet<{ role?: string }>("/api/auth/me", 60_000).then((d) => setUserRole(preview || d?.role || "")).catch(() => {});
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  const persistCustomTypes = useCallback(async (types: string[]) => {
    const normalized = normalizeCustomTypes(types);
    setCustomTypeOptions(normalized);
    const res = await fetch("/api/patient-follow-up-types", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: normalized }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      throw new Error(body?.message || "Takip tipleri kurum ayarına kaydedilemedi.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTypes = async () => {
      try {
        const res = await fetch("/api/patient-follow-up-types", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Takip tipleri yüklenemedi.");
        const serverTypes = normalizeCustomTypes(Array.isArray(body?.types) ? body.types : []);
        if (cancelled) return;

        let legacyTypes: string[] = [];
        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem("hasta-takip-custom-types");
            const parsed = raw ? JSON.parse(raw) : [];
            legacyTypes = normalizeCustomTypes(Array.isArray(parsed) ? parsed : []);
          } catch {
            legacyTypes = [];
          }
        }

        const merged = normalizeCustomTypes([...serverTypes, ...legacyTypes]);
        setCustomTypeOptions(merged);
        if (legacyTypes.length > 0 && merged.length !== serverTypes.length) {
          await persistCustomTypes(merged).catch(() => {});
          localStorage.removeItem("hasta-takip-custom-types");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Takip tipleri yüklenemedi.");
      }
    };
    void loadTypes();
    return () => { cancelled = true; };
  }, [persistCustomTypes]);

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
            throw new Error(body?.message || "Hasta arama için yetki veya erişim hatası oluştu.");
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
          setPatientSearchError(e instanceof Error ? e.message : "Hasta arama yapılamadı.");
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
      const labContext = parseLabFollowUpNote(f.note, { labOrderId: f.labOrderId, labTripId: f.labTripId, labOrder: f.labOrder });
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
        followUpLabel: labContext ? "Lab Prova Randevusu" : resolvedLabel,
        statusLabel: f.status === "KAPALI" ? "Kapalı" : "Açık",
        note: labContext?.title || custom.cleanNote || f.resolutionNote || "Takip notu girilmedi.",
        isOpen: f.status === "ACIK",
        priority: f.priority,
        createdAt: sourceDate,
        nextActionAt: f.nextActionAt || null,
        ageDays: dayDiff(sourceDate),
        appointmentDateLabel: f.appointment?.startAt ? new Date(f.appointment.startAt).toLocaleString("tr-TR") : "Manuel takip",
        followBadgeClass: labContext ? "bg-violet-100 text-violet-800" : followBadgeClassByType(f.type),
        isLabProva: Boolean(labContext),
        labContext: labContext || undefined,
      };
    });

    const mergedRaw = [...fromManual, ...fromAppointments];
    const newestOpenLabProvaByGroup = new Map<string, FollowItem>();
    for (const item of mergedRaw) {
      if (!item.isOpen || !item.isLabProva || !item.labContext?.groupKey) continue;
      const key = `${item.patientId}::${item.labContext.groupKey}`;
      const previous = newestOpenLabProvaByGroup.get(key);
      if (!previous || new Date(item.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
        newestOpenLabProvaByGroup.set(key, item);
      }
    }
    const merged = mergedRaw.filter((item) => {
      if (!item.isOpen || !item.isLabProva || !item.labContext?.groupKey) return true;
      const key = `${item.patientId}::${item.labContext.groupKey}`;
      return newestOpenLabProvaByGroup.get(key)?.key === item.key;
    });
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
        if (a.isLabProva !== b.isLabProva) return a.isLabProva ? -1 : 1;
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
      if (resolvedType.apiType === "DIGER" && resolvedType.label && resolvedType.label !== "Diğer") {
        const nextTypes = normalizeCustomTypes([...customTypeOptions, resolvedType.label]);
        if (nextTypes.length !== customTypeOptions.length) {
          await persistCustomTypes(nextTypes).catch((e) => {
            setError(e instanceof Error ? e.message : "Takip tipi kurum ayarına kaydedilemedi.");
          });
        }
      }
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
  <tr><td colspan="9" style="background:#1E3A5F;color:#fff;font-size:18px;font-weight:700;padding:12px 14px;">Hasta Takip Raporu</td></tr>
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
      setError("Yazdırma penceresi açılamadı. Tarayıcınızın açılır pencere (pop-up) engelleyicisini bu site için kapatıp tekrar deneyin.");
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
  <div class="head"><div><div class="h1">Hasta Takip Raporu</div><div class="sub">Klinik Yönetim Paneli</div></div><div class="sub">Oluşturma: ${new Date().toLocaleString("tr-TR")}</div></div>
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
  <div class="foot"><span>Bu çıktı klinik takip panelinden oluşturuldu.</span><span>${new Date().toLocaleString("tr-TR")}</span></div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    win.document.close();
    win.focus();
  };

  const doctors = useMemo(
    () => staff.filter((s) => s.role === "DOKTOR" || (s.role === "YONETICI" && s.profile?.hideAsDoctor === false)),
    [staff],
  );
  const manualSubmitDisabledReason = creatingManual
    ? "Kayıt oluşturuluyor..."
    : !selectedPatient
      ? "Kaydetmek için önce hasta seçin."
      : !manualTypeInput.trim()
        ? "Takip tipi seçin."
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
    if (!(await confirmDialog({ message: "Bu süreç notu silinsin mi? Bu işlem geri alınamaz.", danger: true, confirmText: "Sil" }))) return;
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
        setError("PDF penceresi açılamadı. Tarayıcınızın açılır pencere (pop-up) engelleyicisini bu site için kapatıp tekrar deneyin.");
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
    <div><div class="h1">Hasta Süreç Takip Özeti</div><div class="sub">Klinik Yönetim Paneli</div></div>
    <div class="sub">Oluşturma: ${new Date().toLocaleString("tr-TR")}</div>
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
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{items.length} açık kayıt</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={printReport}>PDF</Button>
          <Button variant="secondary" size="sm" onClick={downloadExcelReport}>Excel</Button>
          <Button variant="secondary" size="sm" href="/gorevler">Görev Merkezi</Button>
          <Button size="sm" href="/randevu">Randevular</Button>
        </div>
      </div>

      {(error || success) && (
        <div className={"rounded-lg border px-3 py-2 text-sm " + (error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {error || success}
        </div>
      )}

      <>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hasta, doktor, not veya takip tipi ara..."
                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <Button variant="secondary" size="sm" onClick={() => setShowAdvancedFilters((v) => !v)}>{showAdvancedFilters ? "Filtreleri Gizle" : "Gelişmiş Filtreler"}</Button>
              <Button variant="secondary" size="sm" onClick={() => setDenseView((v) => !v)}>{denseView ? "Detaylı Görünüm" : "Sade Görünüm"}</Button>
              <Button variant="secondary" size="sm" onClick={resetListFilters}>Temizle</Button>
              <Button size="sm" icon={Plus} onClick={() => { setSelectedPatient(null); setPatientSearch(""); setPatientResults([]); setPatientSearchError(""); setShowManualCreate(true); }}>Manuel Takip Ekle</Button>
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
                  <Button variant="secondary" size="sm" onClick={resetListFilters}>Filtreleri Temizle</Button>
                  <Button variant="secondary" size="sm" onClick={() => setStatusFilter("TUMU")}>Tüm Durumlar</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-3" aria-busy={loading}>
                {items.map((item) => (
                  <div key={item.key} className={`rounded-xl border p-2.5 shadow-sm transition hover:border-slate-300 ${item.isLabProva ? "border-violet-200 bg-violet-50/45" : "border-slate-200 bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.patientName}</p>
                          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + item.followBadgeClass}>{item.followUpLabel}</span>
                          <Badge tone={item.isOpen ? "success" : "neutral"}>{item.statusLabel}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{item.doctorName} · {item.ageDays} gün · Öncelik {item.priority}</p>
                        {item.isLabProva && item.labContext && (
                          <p className="mt-1 text-xs font-semibold text-violet-800">
                            {item.labContext.receivedStep || "Prova"} için randevu verilecek
                            {item.labContext.labType ? ` · ${item.labContext.labType}` : ""}
                            {item.labContext.labName ? ` · ${item.labContext.labName}` : ""}
                          </p>
                        )}
                        {/* "Bu hasta neden burada?" cevabı sade görünümde de görünür kalmalı
                            (bkz. denetim raporu Tema 6) — sade modda kısa, detaylı modda uzun. */}
                        <p className="mt-1 text-xs text-slate-700">{shortText(item.note || "Not bulunmuyor.", denseView ? 40 : 65)}</p>
                        {item.nextActionAt && <p className="mt-0.5 text-xs text-amber-700">Sonraki adım: {new Date(item.nextActionAt).toLocaleString("tr-TR")}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void openDetailModal(item)}>Detay</Button>
                        {!hidePhone && item.patientPhone && <a href={`tel:${item.patientPhone}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ara</a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>

      <Modal
        open={showManualCreate}
        onClose={() => setShowManualCreate(false)}
        title="Manuel Takip Ekle"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowManualCreate(false)}>İptal</Button>
            <Button onClick={() => void createManualFollowUp()} disabled={Boolean(manualSubmitDisabledReason)} loading={creatingManual}>Kaydet</Button>
          </>
        }
      >
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <FormField label="Hasta">
              <input value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); setPatientSearchError(""); }} placeholder="Ad, telefon veya TC ile ara" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
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
            </FormField>
          </div>
          <FormField label="Doktor">
            <select value={manualDoctorId} onChange={(e) => setManualDoctorId(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="">Seçilmedi</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
          </FormField>
          <FormField label="Takip Tipi">
            <select value={manualTypeInput} onChange={(e) => setManualTypeInput(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
              {followTypeOptions.length === 0 ? <option value={manualTypeInput}>{manualTypeInput || "Sonuç bulunamadı"}</option> : followTypeOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
            </select>
          </FormField>
          <FormField label="Öncelik">
            <select value={manualPriority} onChange={(e) => setManualPriority(Number(e.target.value) as 1 | 2 | 3)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value={1}>Düşük</option>
              <option value={2}>Orta</option>
              <option value={3}>Yüksek</option>
            </select>
          </FormField>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px]">
          <FormField label="Takip Notu">
            <textarea value={manualNote} onChange={(e) => setManualNote(e.target.value)} rows={2} placeholder="Takip notu" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </FormField>
          <FormField label="Sonraki Aksiyon">
            <input type="datetime-local" value={manualNextActionAt} onChange={(e) => setManualNextActionAt(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </FormField>
        </div>
        {manualSubmitDisabledReason && <p className="mt-2 text-xs font-medium text-amber-700">{manualSubmitDisabledReason}</p>}
      </Modal>

      <Modal
        open={Boolean(detailItem)}
        onClose={closeDetailModal}
        title={detailItem?.patientName ?? ""}
        description={detailItem ? `${detailItem.followUpLabel} · ${detailItem.statusLabel}` : undefined}
        size="xl"
      >
        {detailItem && (() => {
          const isManual = detailItem.source === "MANUAL" && Boolean(detailItem.followUpId);
          const noteDuplicatesLabTitle = detailItem.isLabProva && detailItem.labContext && detailItem.note === detailItem.labContext.title;
          return (
          <div className="space-y-4">
            {/* Üst satır: durum özeti + sayfa gezinme aksiyonları aynı hizada */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={getPriorityTone(detailItem.priority)}>Öncelik {detailItem.priority}</Badge>
                <Badge tone={getAgeTone(detailItem.ageDays)}>{detailItem.ageDays} gün önce</Badge>
                <span className="text-xs text-slate-400">{detailItem.source === "MANUAL" ? "Manuel takip" : "Randevu kaynaklı"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {isManual && (
                  <Button variant="secondary" size="sm" onClick={() => void printFollowUpHistory(detailItem)}>PDF Al</Button>
                )}
                {detailItem.patientId && <Button size="sm" href={`/hasta-detay?id=${detailItem.patientId}`}>Hasta Kartı</Button>}
                <Button variant="secondary" size="sm" href={detailItem.patientId ? `/randevu?patientId=${detailItem.patientId}` : "/randevu"}>Randevuya Git</Button>
              </div>
            </div>

            <p className="text-xs text-slate-500">{detailItem.appointmentDateLabel} · {detailItem.doctorName}</p>

            {detailItem.isLabProva && detailItem.labContext ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-primary">Laboratuvar Prova Takibi</p>
                <p className="mt-1 text-sm font-bold text-primary-strong">{detailItem.labContext.title}</p>
                <div className="mt-2 grid gap-2 text-xs text-primary-strong sm:grid-cols-3">
                  <p><span className="font-bold">İş:</span> {detailItem.labContext.labType || "-"}</p>
                  <p><span className="font-bold">Laboratuvar:</span> {detailItem.labContext.labName || "-"}</p>
                  <p><span className="font-bold">Prova:</span> {detailItem.labContext.receivedStep || "-"}</p>
                </div>
                {!noteDuplicatesLabTitle && detailItem.note && (
                  <p className="mt-2 border-t border-primary/10 pt-2 text-sm text-primary-strong">{detailItem.note}</p>
                )}
              </div>
            ) : detailItem.note ? (
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Not</p>
                <p className="mt-1 text-sm text-slate-700">{detailItem.note}</p>
              </div>
            ) : null}

            {detailItem.nextActionAt && <p className="text-xs text-amber-700">Sonraki adım: {new Date(detailItem.nextActionAt).toLocaleString("tr-TR")}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
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

              <div className="rounded-xl border border-slate-100 px-3 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bu görüşmenin sonucu</p>
                {isManual ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "GERI_ARA", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 86400000).toISOString() })}>Tekrar Ara</Button>
                    <Button variant="secondary" size="sm" disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "ULASILAMADI", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 2 * 86400000).toISOString() })}>Ulaşılamadı</Button>
                    <Button variant="secondary" size="sm" disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "DONUS_BEKLENIYOR", note: buildManualNote("", detailItem.note), nextActionAt: new Date(Date.now() + 3 * 86400000).toISOString() })}>Dönüş Bekleniyor</Button>
                    <Button variant="primary" size="sm" disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { close: true, resolutionNote: "Takip kapatildi", lastContactAt: new Date().toISOString() })}>Takibi Kapat</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" disabled={busyId === detailItem.key} onClick={() => void convertAppointmentToManual(detailItem)}>Manuel Takibe Dönüştür</Button>
                    <Button variant="secondary" size="sm" disabled={busyId === detailItem.key} onClick={() => void markAppointmentNote(detailItem, "GERI_ARA", detailItem.note)}>Notu Geri Ara Yap</Button>
                  </div>
                )}
              </div>
            </div>

            {isManual && (
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800">Hasta Bazlı Görüşme ve Süreç Notları</h3>
                  <span className="text-xs text-slate-500">{followUpEvents.length} kayıt</span>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {EVENT_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" onClick={() => applyEventPreset(preset)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{preset.label}</button>
                  ))}
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <input type="datetime-local" value={eventForm.occurredAt} onChange={(e) => setEventForm((prev) => ({ ...prev, occurredAt: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <select value={eventForm.channel} onChange={(e) => setEventForm((prev) => ({ ...prev, channel: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    {EVENT_CHANNEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <input value={eventForm.summary} onChange={(e) => setEventForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Kısa sonuç, örnek: Arandı, açmadı" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-1" />
                  <textarea value={eventForm.patientResponse} onChange={(e) => setEventForm((prev) => ({ ...prev, patientResponse: e.target.value }))} rows={2} placeholder="Hasta ne söyledi?" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <textarea value={eventForm.nextStep} onChange={(e) => setEventForm((prev) => ({ ...prev, nextStep: e.target.value }))} rows={2} placeholder="Bu hastada sonraki adım ne olacak?" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <textarea value={eventForm.detail} onChange={(e) => setEventForm((prev) => ({ ...prev, detail: e.target.value }))} rows={2} placeholder="Detaylı görüşme notu" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void saveFollowUpEvent()} disabled={eventBusy || eventsLoading} loading={eventBusy}>{editingEventId ? "Hasta Notunu Güncelle" : "Hasta Notu Ekle"}</Button>
                  {editingEventId && <Button variant="secondary" size="sm" onClick={resetEventForm}>Düzenlemeyi İptal Et</Button>}
                </div>

                {eventsLoading ? (
                  <div className="mt-3 space-y-2" aria-busy="true">
                    <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                  </div>
                ) : followUpEvents.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Bu hasta için henüz görüşme notu yok. İlk hasta notunu ekleyin.</p>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-white">
                    <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Kayıt Geçmişi
                    </div>
                    <div className="max-h-[34vh] space-y-2 overflow-y-auto p-3">
                      {followUpEvents.map((ev, idx) => (
                        <div key={ev.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-700">
                              #{followUpEvents.length - idx} · {new Date(ev.occurredAt).toLocaleString("tr-TR")} {ev.channel ? `· ${ev.channel}` : ""}
                            </p>
                            <div className="flex gap-2">
                              <Button variant="secondary" size="sm" onClick={() => startEditFollowUpEvent(ev)}>Düzenle</Button>
                              <Button variant="danger" size="sm" onClick={() => void deleteFollowUpEvent(ev.id)}>Sil</Button>
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
          );
        })()}
      </Modal>

    </section>
  );
}
