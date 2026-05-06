"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FollowUpKey,
  appointmentNeedsFollowUp,
  buildAppointmentNote,
  parseAppointmentNote,
} from "@/lib/appointment-follow-up";

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
  IPTAL: "Iptal",
};

const FOLLOW_LABELS: Record<string, string> = {
  GELMEDI: "Gelmedi",
  GERI_ARA: "Tekrar aranacak",
  ULASILAMADI: "Ulasilamadi",
  DONUS_BEKLENIYOR: "Donus bekleniyor",
  DIGER: "Diger",
};

const MANUAL_TYPE_OPTIONS = [
  "Tekrar aranacak",
  "Ulasilamadi",
  "Donus bekleniyor",
  "Randevu verildi",
  "Ertelendi",
  "Fiyat bilgisi bekleniyor",
  "Tedavi onayi bekleniyor",
  "Diger",
] as const;

const CUSTOM_TYPE_PREFIX = "Takip Tipi:";

const EVENT_PRESETS = [
  {
    label: "Arandi, acmadi",
    channel: "Telefon",
    summary: "Hasta arandi, telefonu acmadi.",
    patientResponse: "",
    nextStep: "Daha sonra tekrar aranacak.",
    detail: "Arama yapildi ancak ulasilamadi.",
  },
  {
    label: "Baska zaman gelmek istiyor",
    channel: "Telefon",
    summary: "Hasta bu hafta gelemeyecegini, baska bir zamanda gelmek istedigini belirtti.",
    patientResponse: "Su an uygun degilim, daha sonra gelmek istiyorum.",
    nextStep: "Yeni uygun tarih icin tekrar gorusulecek.",
    detail: "Takvim uygunlugune gore yeni randevu onerilecek.",
  },
  {
    label: "Bilgi aldi, dusunecek",
    channel: "Telefon",
    summary: "Hasta surec hakkinda bilgi aldi, dusunup donus yapacagini soyledi.",
    patientResponse: "Bilgileri aldim, dusunup size donecegim.",
    nextStep: "2-3 gun icinde geri donus icin tekrar aranacak.",
    detail: "Karar sureci bekleniyor.",
  },
  {
    label: "Fiyat sordu",
    channel: "Telefon",
    summary: "Hasta fiyat bilgisi talep etti.",
    patientResponse: "Fiyat bilgisini ogrenmek istiyorum.",
    nextStep: "Fiyat bilgisi paylasilip takip aranmasi yapilacak.",
    detail: "Tedavi/fiyat detaylari aktarildi veya aktarilacak.",
  },
  {
    label: "Randevuya yakin",
    channel: "Telefon",
    summary: "Hasta gelmeye yakin oldugunu ve randevu planlayabilecegini belirtti.",
    patientResponse: "Uygun gun olursa gelebilirim.",
    nextStep: "Uygun tarih secilerek randevuya yonlendirilecek.",
    detail: "Randevu planlama icin olumlu geri bildirim alindi.",
  },
] as const;

const EVENT_CHANNEL_OPTIONS = ["Telefon", "WhatsApp", "Yuz yuze", "SMS", "E-posta", "Diger"] as const;

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
  if (low === "ulasilamadi" || low.includes("ulasi")) return { apiType: "ULASILAMADI", label: "Ulasilamadi" };
  if (low === "donus bekleniyor" || low.includes("donus") || low.includes("beklen")) return { apiType: "DONUS_BEKLENIYOR", label: "Donus bekleniyor" };
  if (low === "diger") return { apiType: "DIGER", label: "Diger" };
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

export default function HastaTakipPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [manualFollowUps, setManualFollowUps] = useState<ManualFollowUp[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [followFilter, setFollowFilter] = useState<"TUMU" | "GELMEDI" | "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "DIGER">("TUMU");
  const [followTypeQuery, setFollowTypeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TUMU" | "ACIK" | "KAPALI">("ACIK");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [rangeDays, setRangeDays] = useState<"30" | "60" | "90">("90");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedDetailKey, setSelectedDetailKey] = useState("");
  const [userRole, setUserRole] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Number(rangeDays));

    try {
      const [meRes, apptRes, followRes, staffRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`),
        fetch(`/api/patient-follow-ups?from=${from.toISOString()}&to=${to.toISOString()}`),
        fetch("/api/staff"),
      ]);

      const meData = await meRes.json();
      const apptData = await apptRes.json();
      const followData = await followRes.json();
      const staffData = await staffRes.json();

      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      setUserRole(preview || meData?.role || "");
      setAppointments(Array.isArray(apptData) ? apptData : []);
      setManualFollowUps(Array.isArray(followData) ? followData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
    } catch {
      setError("Takip verileri yuklenemedi.");
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
            setPatientSearchError("Hasta bulunamadi. Farkli bir anahtar kelime deneyin.");
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
        statusLabel: f.status === "KAPALI" ? "Kapali" : "Acik",
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
    setSuccess("");
    try {
      const res = await fetch(`/api/patient-follow-ups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Takip guncellenemedi.");
        return;
      }
      setManualFollowUps((prev) => prev.map((f) => (f.id === id ? (data as ManualFollowUp) : f)));
      setSuccess("Takip kaydi guncellendi.");
    } catch {
      setError("Takip guncelleme sirasinda hata olustu.");
    } finally {
      setBusyId("");
    }
  };

  const convertAppointmentToManual = async (item: FollowItem, type?: ManualFollowUp["type"]) => {
    if (!item.appointmentId || !item.patientId) return;
    setBusyId(item.key);
    setError("");
    setSuccess("");
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
      setSuccess("Kayit manuel takibe donusturuldu.");
    } catch {
      setError("Donusturme sirasinda hata olustu.");
    } finally {
      setBusyId("");
    }
  };

  const markAppointmentNote = async (item: FollowItem, followUp: FollowUpKey, detail: string) => {
    if (!item.appointmentId) return;
    setBusyId(item.key);
    setError("");
    setSuccess("");
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
        setError(data?.message || "Randevu notu guncellenemedi.");
        return;
      }
      setAppointments((prev) => prev.map((a) => (a.id === item.appointmentId ? { ...a, note } : a)));
      setSuccess("Randevu notu guncellendi.");
    } catch {
      setError("Randevu notu guncellenirken hata olustu.");
    } finally {
      setBusyId("");
    }
  };

  const createManualFollowUp = async () => {
    if (!selectedPatient) {
      setError("Lutfen bir hasta secin.");
      return;
    }
    const resolvedType = resolveManualType(manualTypeInput);
    const finalNote = buildManualNote(resolvedType.apiType === "DIGER" ? resolvedType.label : "", manualNote);
    setCreatingManual(true);
    setError("");
    setSuccess("");
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
        setError(data?.message || "Manuel takip olusturulamadi.");
        return;
      }
      setManualFollowUps((prev) => [data as ManualFollowUp, ...prev]);
      setSuccess("Manuel takip kaydi olusturuldu.");
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
    } catch {
      setError("Manuel takip olusturma sirasinda hata olustu.");
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
      yas: `${i.ageDays} gun`,
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
  <tr><td colspan="9" style="background:#F1F5F9;border:1px solid #E2E8F0;padding:8px 14px;color:#475569;">Olusturma: ${new Date().toLocaleString("tr-TR")} | Kayit: ${reportRows.length}</td></tr>
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
  ${rows || `<tr><td colspan="9" style="padding:14px;text-align:center;color:#64748B;">Kayit bulunamadi</td></tr>`}
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
    `).join("") : `<tr><td colspan="9" style="text-align:center;padding:18px;color:#94A3B8;">Kayit bulunamadi</td></tr>`;

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
    <div class="box"><div class="num">${stats.open}</div><div class="lbl">Acik</div></div>
    <div class="box"><div class="num">${stats.highPriority}</div><div class="lbl">Yuksek Oncelik</div></div>
    <div class="box"><div class="num">${stats.noShow}</div><div class="lbl">Gelmedi</div></div>
    <div class="box"><div class="num">${stats.waitingReturn}</div><div class="lbl">Donus Bekliyor</div></div>
  </div>
  <table>
    <thead><tr><th>Hasta</th><th>Doktor</th><th>Takip</th><th>Durum</th><th>Randevu</th><th>Sonraki Adim</th><th>Yas</th><th>Kaynak</th><th>Not</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot"><span>Bu cikti KlinikModern takip panelinden olusturuldu.</span><span>${new Date().toLocaleString("tr-TR")}</span></div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    win.document.close();
    win.focus();
  };

  const doctors = useMemo(() => staff.filter((s) => s.role === "DOKTOR"), [staff]);
  const manualSubmitDisabledReason = creatingManual
    ? "Kayit olusturuluyor..."
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
        setError(data?.message || "Surec notlari yuklenemedi.");
        setFollowUpEvents([]);
        return;
      }
      setFollowUpEvents(Array.isArray(data) ? (data as FollowUpEvent[]) : []);
    } catch {
      setError("Surec notlari yuklenirken hata olustu.");
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
      setError("Surec ozeti bos birakilamaz.");
      return;
    }

    const occurredAt = new Date(eventForm.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setError("Gecersiz tarih/saat secildi. Lutfen tarihi tekrar secin.");
      return;
    }

    setEventBusy(true);
    setError("");
    setSuccess("");
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
        setError(data?.message || "Surec notu kaydedilemedi.");
        return;
      }
      await loadFollowUpEvents(activeHistoryFollowUpId);
      resetEventForm();
      setSuccess(editingEventId ? "Surec notu guncellendi." : "Surec notu eklendi.");
    } catch {
      setError("Surec notu kaydetme sirasinda hata olustu.");
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
    setSuccess("");
    try {
      const res = await fetch(`/api/patient-follow-ups/${activeHistoryFollowUpId}/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Surec notu silinemedi.");
        return;
      }
      await loadFollowUpEvents(activeHistoryFollowUpId);
      if (editingEventId === eventId) resetEventForm();
      setSuccess("Surec notu silindi.");
    } catch {
      setError("Surec notu silinirken hata olustu.");
    } finally {
      setEventBusy(false);
    }
  };

  const printFollowUpHistory = async (item: FollowItem) => {
    if (!item.followUpId) {
      setError("Surec PDF cikarmak icin kayit manuel takip olmalidir.");
      return;
    }
    try {
      const res = await fetch(`/api/patient-follow-ups/${item.followUpId}/events`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError((data as { message?: string })?.message || "Surec notlari alinip PDF olusturulamadi.");
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
        : `<tr><td colspan="6" style="text-align:center;padding:18px;color:#94A3B8;">Surec notu bulunamadi</td></tr>`;

      const win = window.open("", "_blank", "width=1200,height=820");
      if (!win) {
        setError("PDF penceresi acilamadi.");
        return;
      }

      win.document.write(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Hasta Surec Takibi</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#0F172A;margin:0}.page{padding:16mm}
.head{display:flex;justify-content:space-between;border-bottom:3px solid #1E3A5F;padding-bottom:10px;margin-bottom:10px}
.h1{font-size:22px;font-weight:800;color:#1E3A5F}.sub{font-size:11px;color:#64748B}
table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#1E3A5F;color:#fff}
th,td{border:1px solid #E2E8F0;padding:7px 8px;text-align:left;vertical-align:top}th{border-color:#2D4F7C}
</style></head><body>
<div class="page">
  <div class="head">
    <div><div class="h1">Hasta Surec Takip Ozeti</div><div class="sub">KlinikModern</div></div>
    <div class="sub">Olusturma: ${new Date().toLocaleString("tr-TR")}</div>
  </div>
  <p><strong>Hasta:</strong> ${esc(item.patientName)} | <strong>Takip:</strong> ${esc(item.followUpLabel)} | <strong>Durum:</strong> ${esc(item.statusLabel)}</p>
  <table>
    <thead><tr><th>Tarih</th><th>Kanal</th><th>Surec Ozeti</th><th>Hasta Cevabi</th><th>Sonraki Adim</th><th>Detay</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
      win.document.close();
      win.focus();
    } catch {
      setError("Surec PDF olusturma sirasinda hata olustu.");
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Hasta Takip Paneli</h1>
          <p className="mt-1 text-sm text-slate-600">Aksiyon gerektiren takipleri tek ekranda yonetin, hizla filtreleyin ve manuel takip ekleyin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={printReport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Yazdir</button>
          <button onClick={downloadExcelReport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Excel Disa Aktar</button>
          <Link href="/randevu" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Randevulara Don</Link>
        </div>
      </div>

      {(error || success) && (
        <div className={"rounded-lg border px-3 py-2 text-sm " + (error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {error || success}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <button onClick={() => { setStatusFilter("TUMU"); setFollowFilter("TUMU"); }} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Toplam</p><p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
        </button>
        <button onClick={() => setStatusFilter("ACIK")} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:border-emerald-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Acik</p><p className="mt-1 text-2xl font-black text-emerald-900">{stats.open}</p>
        </button>
        <button onClick={() => setFollowFilter("GELMEDI")} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-left shadow-sm transition hover:border-red-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Gelmedi</p><p className="mt-1 text-2xl font-black text-red-900">{stats.noShow}</p>
        </button>
        <button onClick={() => setFollowFilter("GERI_ARA")} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left shadow-sm transition hover:border-rose-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Tekrar Ara</p><p className="mt-1 text-2xl font-black text-rose-900">{stats.callBack}</p>
        </button>
        <button onClick={() => setFollowFilter("DONUS_BEKLENIYOR")} className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left shadow-sm transition hover:border-violet-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Donus Bekliyor</p><p className="mt-1 text-2xl font-black text-violet-900">{stats.waitingReturn}</p>
        </button>
        <button onClick={() => setStatusFilter("ACIK")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:border-amber-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Yuksek Oncelik</p><p className="mt-1 text-2xl font-black text-amber-900">{stats.highPriority}</p>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Manuel Takip</h2>
            <p className="text-sm text-slate-600">Ihtiyac oldugunda paneli acip 4 adimda yeni takip kaydi ekleyin.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Adim 1-4</span>
            <button
              type="button"
              onClick={() => setShowManualCreate((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showManualCreate ? "Paneli Kapat" : "Manuel Takip Ekle"}
            </button>
          </div>
        </div>

        {!showManualCreate ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Bu alan varsayilan olarak kapali tutulur. Yeni kayit eklemek icin <span className="font-semibold">Manuel Takip Ekle</span> butonunu kullanin.
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">1. Hasta Ara</label>
            <input
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                setSelectedPatient(null);
                setPatientSearchError("");
              }}
              placeholder="Ad, telefon veya TC ile ara"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            {!selectedPatient && patientSearch.trim().length < 2 && <p className="mt-2 text-xs text-slate-500">En az 2 karakter yazarak hasta arayin.</p>}
            {patientSearchLoading && <p className="mt-2 text-xs text-slate-600">Hasta aranıyor...</p>}
            {selectedPatient ? (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Secili hasta: <span className="font-semibold">{selectedPatient.fullName}</span>
                {!hidePhone && selectedPatient.phone ? ` - ${selectedPatient.phone}` : ""}
              </div>
            ) : patientResults.length > 0 ? (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {patientResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedPatient(p); setPatientSearch(p.fullName); setPatientResults([]); }}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span>{p.fullName}</span>
                    {!hidePhone && <span className="text-xs text-slate-400">{p.phone || "-"}</span>}
                  </button>
                ))}
              </div>
            ) : patientSearch.trim().length >= 2 && patientSearchError ? (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <p>{patientSearchError}</p>
                <Link href="/hasta-ekle" className="mt-1 inline-block font-semibold text-rose-700 underline underline-offset-2">
                  Hasta bulunamiyorsa yeni hasta kaydi olustur
                </Link>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">2. Sorumlu Doktor</label>
            <select value={manualDoctorId} onChange={(e) => setManualDoctorId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="">Secilmedi</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">3. Takip Tipi</label>
            <select
              value={manualTypeInput}
              onChange={(e) => setManualTypeInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            >
              {followTypeOptions.length === 0 ? (
                <option value={manualTypeInput}>{manualTypeInput || "Sonuc bulunamadi"}</option>
              ) : (
                followTypeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))
              )}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Acilir listeden takip tipi secin.</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">4. Oncelik</label>
            <select value={manualPriority} onChange={(e) => setManualPriority(Number(e.target.value) as 1 | 2 | 3)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value={1}>Dusuk</option>
              <option value={2}>Orta</option>
              <option value={3}>Yuksek</option>
            </select>
          </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px_160px]">
              <textarea
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                rows={2}
                placeholder="Takip notu (operasyon notu, arama sonucu, sonraki adim...)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sonraki Aksiyon Tarihi</label>
                <input
                  type="datetime-local"
                  value={manualNextActionAt}
                  onChange={(e) => setManualNextActionAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={() => void createManualFollowUp()}
                disabled={Boolean(manualSubmitDisabledReason)}
                className="mt-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingManual ? "Ekleniyor..." : "Manuel Takip Ekle"}
              </button>
            </div>
            {manualSubmitDisabledReason && <p className="mt-2 text-xs font-medium text-amber-700">{manualSubmitDisabledReason}</p>}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hasta, doktor, not veya takip tipi ara..."
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showAdvancedFilters ? "Gelismis Filtreleri Gizle" : "Gelismis Filtreler"}
          </button>
          <button type="button" onClick={resetListFilters} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Filtreleri Temizle</button>
          <button onClick={() => void loadData()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Yenile</button>
        </div>

        {showAdvancedFilters && (
          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <select value={followFilter} onChange={(e) => setFollowFilter(e.target.value as typeof followFilter)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="TUMU">Tum Takipler</option>
              <option value="GELMEDI">Gelmedi</option>
              <option value="GERI_ARA">Tekrar Aranacak</option>
              <option value="ULASILAMADI">Ulasilamayanlar</option>
              <option value="DONUS_BEKLENIYOR">Donus Beklenenler</option>
              <option value="DIGER">Diger</option>
            </select>

            <input
              value={followTypeQuery}
              onChange={(e) => setFollowTypeQuery(e.target.value)}
              placeholder="Takip tipi icinde metin ara..."
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="ACIK">Acik Takipler</option>
              <option value="KAPALI">Kapali Takipler</option>
              <option value="TUMU">Tumu</option>
            </select>

            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="">Tum Doktorlar</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>

            <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value as typeof rangeDays)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="30">Son 30 gun</option>
              <option value="60">Son 60 gun</option>
              <option value="90">Son 90 gun</option>
            </select>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <h2 className="text-base font-bold text-slate-900">Aksiyon Gerektiren Hasta Listesi</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{items.length} kayit</span>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Takip kayitlari yukleniyor...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">Secili filtrede takip kaydi bulunmuyor.</p>
            <p className="mt-1 text-xs text-slate-500">Filtreleri temizleyin veya yeni bir manuel takip kaydi ekleyin.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={resetListFilters} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Filtreleri Temizle</button>
              <button type="button" onClick={() => setStatusFilter("TUMU")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Tum Durumlar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {items.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.patientName}</p>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + item.followBadgeClass}>{item.followUpLabel}</span>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (item.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>{item.statusLabel}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.doctorName} · {item.ageDays} gun · Oncelik {item.priority}</p>
                    <p className="mt-2 text-sm text-slate-700">{shortText(item.note || "Not bulunmuyor.", 90)}</p>
                    {item.nextActionAt && <p className="mt-1 text-xs text-amber-700">Sonraki adim: {new Date(item.nextActionAt).toLocaleString("tr-TR")}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void openDetailModal(item)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Detay</button>
                    {!hidePhone && item.patientPhone && <a href={`tel:${item.patientPhone}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ara</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getPriorityBadge(detailItem.priority)}>Oncelik {detailItem.priority}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + detailItem.followBadgeClass}>{detailItem.followUpLabel}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (detailItem.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>{detailItem.statusLabel}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getAgeBadge(detailItem.ageDays)}>{detailItem.ageDays} gun</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{detailItem.source === "MANUAL" ? "Manuel" : "Randevu"}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{detailItem.appointmentDateLabel} · {detailItem.doctorName}</p>
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Not</p>
                    <p className="mt-1 text-sm text-slate-700">{detailItem.note}</p>
                  </div>
                  {detailItem.nextActionAt && <p className="mt-2 text-xs text-amber-700">Sonraki adim: {new Date(detailItem.nextActionAt).toLocaleString("tr-TR")}</p>}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Iletisim</p>
                  {hidePhone ? (
                    <p className="mt-1 text-sm text-slate-400 italic">Telefon gizli</p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-700">{detailItem.patientPhone || "Kayitli telefon yok"}</p>
                  )}
                  {!hidePhone && detailItem.patientPhone && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`tel:${detailItem.patientPhone}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ara</a>
                      <a href={`https://wa.me/90${detailItem.patientPhone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hizli Islemler</p>
                  {detailItem.source === "MANUAL" && detailItem.followUpId ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "GERI_ARA", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 86400000).toISOString() })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Tekrar Ara</button>
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "ULASILAMADI", note: buildManualNote("", detailItem.note), lastContactAt: new Date().toISOString(), nextActionAt: new Date(Date.now() + 2 * 86400000).toISOString() })} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Ulasilamadi</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { type: "DONUS_BEKLENIYOR", note: buildManualNote("", detailItem.note), nextActionAt: new Date(Date.now() + 3 * 86400000).toISOString() })} className="rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">Donus Bekleniyor</button>
                        <button disabled={busyId === detailItem.followUpId} onClick={() => void updateManual(detailItem.followUpId!, { close: true, resolutionNote: "Takip kapatildi", lastContactAt: new Date().toISOString() })} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Takibi Kapat</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button disabled={busyId === detailItem.key} onClick={() => void convertAppointmentToManual(detailItem)} className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">Manuel Takibe Donustur</button>
                      <button disabled={busyId === detailItem.key} onClick={() => void markAppointmentNote(detailItem, "GERI_ARA", detailItem.note)} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Notu Geri Ara Yap</button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {detailItem.source === "MANUAL" && detailItem.followUpId && (
                    <button type="button" onClick={() => void printFollowUpHistory(detailItem)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">PDF Al</button>
                  )}
                  {detailItem.patientId && <Link href={`/hasta-detay?id=${detailItem.patientId}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Hasta Karti</Link>}
                  <Link href={detailItem.patientId ? `/randevu?patientId=${detailItem.patientId}` : "/randevu"} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Randevuya Git</Link>
                </div>
              </div>

              {detailItem.source === "MANUAL" && detailItem.followUpId && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-indigo-900">Hasta Bazli Gorusme ve Surec Notlari</h3>
                    <span className="text-xs text-indigo-700">{followUpEvents.length} kayit</span>
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
                    <input value={eventForm.summary} onChange={(e) => setEventForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Kisa sonuc (ornek: Arandi, acmadi / Baska zaman gelmek istiyor)" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm md:col-span-1" />
                    <textarea value={eventForm.patientResponse} onChange={(e) => setEventForm((prev) => ({ ...prev, patientResponse: e.target.value }))} rows={2} placeholder="Hasta ne soyledi?" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                    <textarea value={eventForm.nextStep} onChange={(e) => setEventForm((prev) => ({ ...prev, nextStep: e.target.value }))} rows={2} placeholder="Bu hastada sonraki adim ne olacak?" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                    <textarea value={eventForm.detail} onChange={(e) => setEventForm((prev) => ({ ...prev, detail: e.target.value }))} rows={2} placeholder="Detayli gorusme notu" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveFollowUpEvent()} disabled={eventBusy || eventsLoading} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{eventBusy ? "Kaydediliyor..." : editingEventId ? "Hasta Notunu Guncelle" : "Hasta Notu Ekle"}</button>
                    {editingEventId && <button type="button" onClick={resetEventForm} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Duzenlemeyi Iptal Et</button>}
                  </div>

                  {eventsLoading ? (
                    <p className="mt-3 text-xs text-slate-500">Hasta gorusme gecmisi yukleniyor...</p>
                  ) : followUpEvents.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">Bu hasta icin henuz gorusme notu yok. Ilk hasta notunu ekleyin.</p>
                  ) : (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-white">
                      <div className="border-b border-indigo-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Kayit Gecmisi
                      </div>
                      <div className="max-h-[34vh] space-y-2 overflow-y-auto p-3">
                        {followUpEvents.map((ev, idx) => (
                          <div key={ev.id} className="rounded-lg border border-indigo-100 bg-slate-50/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-indigo-900">
                                #{followUpEvents.length - idx} · {new Date(ev.occurredAt).toLocaleString("tr-TR")} {ev.channel ? `· ${ev.channel}` : ""}
                              </p>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => startEditFollowUpEvent(ev)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Duzenle</button>
                                <button type="button" onClick={() => void deleteFollowUpEvent(ev.id)} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">Sil</button>
                              </div>
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{ev.summary}</p>
                            {ev.patientResponse && <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Hasta soyledi:</span> {ev.patientResponse}</p>}
                            {ev.nextStep && <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Planlanan sonraki adim:</span> {ev.nextStep}</p>}
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Takip listesi randevu notundaki takip durumu ile manuel eklenen takip kayitlarini birlikte gosterir.
        Bu panelden manuel takip acabilir, hizli aksiyonlar ile durum guncelleyebilir, yazdirabilir ve Excel disa aktarabilirsiniz.
      </div>
    </section>
  );
}
