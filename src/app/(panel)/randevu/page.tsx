"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const SLOT_HOURS: string[] = [];
for (let h = 8; h < 20; h++) {
  SLOT_HOURS.push(String(h).padStart(2, "0") + ":00");
  SLOT_HOURS.push(String(h).padStart(2, "0") + ":30");
}

const TR_DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function RandevuPage() {
  const [view, setView] = useState<"GUN" | "HAFTA" | "AY" | "AJANDA">("GUN");
  const [date, setDate] = useState(() => new Date());
  const [doctorId, setDoctorId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
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
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 45 | 60 | 90 | 120>(30);
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
  const selectedTreatmentMeta = useMemo(() => getTreatmentMeta(treatmentKey), [treatmentKey]);
  const filteredTreatmentOptions = useMemo(() => {
    const q = treatmentQuery.trim().toLowerCase();
    if (!q) return APPOINTMENT_TREATMENT_OPTIONS;
    return APPOINTMENT_TREATMENT_OPTIONS.filter((item) => item.label.toLowerCase().includes(q));
  }, [treatmentQuery]);

  const resolveTreatmentKey = useCallback((query: string): AppointmentTreatmentKey => {
    const q = query.trim().toLowerCase();
    if (!q) return "MUAYENE";
    const exact = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase() === q);
    if (exact) return exact.value;
    const included = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase().includes(q));
    return included?.value || "DIGER";
  }, []);

  const range = useMemo(() => {
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      if (doctorId) params.set("doctorId", doctorId);
      const [aRes, sRes] = await Promise.all([
        fetch("/api/appointments?" + params.toString()),
        fetch("/api/staff"),
      ]);
      const [aJson, sJson] = await Promise.all([aRes.json(), sRes.json()]);
      setAppointments(Array.isArray(aJson) ? aJson : []);
      const staffList = Array.isArray(sJson) ? sJson : (sJson?.staff || []);
      setStaff(staffList.filter((x: Staff) => x.role === "DOKTOR" || x.role === "YONETICI"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally { setLoading(false); }
  }, [doctorId, range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedAppt) return;
    const parsed = parseAppointmentNote(selectedAppt.note);
    setFollowUpStatus(parsed.followUp);
    setFollowUpNote(parsed.detail);
  }, [selectedAppt]);

  const resetForm = () => {
    setPatientId(""); setPatientSearch(""); setPatientResults([]); setPatientDropdownOpen(false);
    setNewDoctorId(""); setNote(""); setConflictWarning(null); setConflictSuggestions([]); setTreatmentKey("MUAYENE");
    setTreatmentQuery(getTreatmentMeta("MUAYENE").label);
    setDurationMinutes(30);
  };

  const createAppointment = async () => {
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
    await fetch("/api/appointments/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
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
    await fetch("/api/appointments/" + id, { method: "DELETE" });
    setSelectedAppt(null);
    await load();
  };

  const weekDays = useMemo(() => {
    if (view !== "HAFTA") return [];
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(range.from); d.setDate(range.from.getDate() + i); return d; });
  }, [view, range.from]);

  const monthDays = useMemo(() => {
    if (view !== "AY") return [];
    const days: Date[] = [];
    const cur = new Date(range.from);
    while (cur <= range.to) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
  }, [view, range.from, range.to]);

  const getApptForSlot = (docId: string | null, slotTime: string, forDate?: Date) => {
    return appointments.filter(a => {
      if (docId && a.doctor?.id !== docId) return false;
      const d = new Date(a.startAt);
      if (forDate && (d.getFullYear() !== forDate.getFullYear() || d.getMonth() !== forDate.getMonth() || d.getDate() !== forDate.getDate())) return false;
      return (String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0")) === slotTime;
    });
  };

  const getApptForDay = (d: Date) => appointments.filter(a => { const ad = new Date(a.startAt); return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth() && ad.getDate() === d.getDate(); });

  const navLabel = () => {
    if (view === "GUN") return date.getDate() + " " + TR_MONTHS[date.getMonth()] + " " + date.getFullYear();
    if (view === "HAFTA") { const e = new Date(range.from); e.setDate(e.getDate() + 6); return range.from.getDate() + " " + TR_MONTHS[range.from.getMonth()] + " - " + e.getDate() + " " + TR_MONTHS[e.getMonth()] + " " + date.getFullYear(); }
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
    SLOT_HOURS.forEach((slot) => {
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
  }, [appointments]);

  const openQuickCreate = (slotTime: string, forDate: Date, slotDoctorId?: string) => {
    const [h, m] = slotTime.split(":").map(Number);
    const start = new Date(forDate);
    start.setHours(h, m, 0, 0);
    const docId = slotDoctorId || doctorId || null;
    const conflict = buildConflictInfo(start.toISOString(), docId || "", 30);
    setConflictWarning(conflict.warning ? `${conflict.warning} Yine de ekleyebilirsiniz.` : null);
    setConflictSuggestions(conflict.suggestions);

    setStartAt(toLocalInput(start));
    setDurationMinutes(30);
    setNewDoctorId(docId || "");
    setShowForm(true);
  };

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
        const end = new Date(range.from);
        end.setDate(end.getDate() + 6);
        return `Haftalik Randevu Cizelgesi - ${range.from.getDate()} ${TR_MONTHS[range.from.getMonth()]} - ${end.getDate()} ${TR_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
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
    if (agendaStatusFilter === "ALL") return appointments;
    return appointments.filter(a => a.status === agendaStatusFilter);
  }, [appointments, agendaStatusFilter]);

  const apptBlock = (a: Appointment) => (
    (() => {
      const parsed = parseAppointmentNote(a.note);
      const meta = getFollowUpMeta(parsed.followUp);
      const treatmentMeta = getTreatmentMeta(parsed.treatment);
      return (
    <div key={a.id} onClick={() => setSelectedAppt(a)}
      className={"rounded p-1 mb-0.5 cursor-pointer " + (STATUS_COLORS[a.status] || "bg-blue-50 border-l-4 border-blue-400")}>
      <p className="font-semibold text-gray-800 truncate text-xs">{a.patient?.fullName || "-"}</p>
      <p className="text-gray-500 text-xs">{new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</p>
      <p className={"mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + treatmentMeta.badge}>{treatmentMeta.label}</p>
      {parsed.followUp !== "YOK" && <p className={"mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + meta.badge}>{meta.label}</p>}
    </div>
      );
    })()
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Randevular</h1>
          <p className="mt-0.5 text-sm text-slate-500">Günlük, haftalık ve aylık randevu takvimi</p>
        </div>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Tüm Doktorlar</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="rounded border px-2 py-1 text-lg hover:bg-gray-100">‹</button>
          <span className="font-bold text-gray-800 min-w-64 text-center text-lg">{navLabel()}</span>
          <button onClick={() => nav(1)} className="rounded border px-2 py-1 text-lg hover:bg-gray-100">›</button>
          <button onClick={() => setDate(new Date())} className="rounded border border-gray-300 px-3 py-1 text-xs font-medium bg-gray-50 hover:bg-gray-100">Bugün</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["GUN","HAFTA","AY","AJANDA"] as const).map(mode => (
            <button key={mode} onClick={() => setView(mode)}
              className={"rounded-lg px-4 py-2 text-sm font-semibold transition-colors " + (view === mode ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
              {mode === "GUN" ? "Gün" : mode === "HAFTA" ? "Hafta" : mode === "AY" ? "Ay" : "Ajanda"}
            </button>
          ))}
          <button
            onClick={printReport}
            disabled={!canExportOrPrint}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Randevu çizelgesini yazdır"}
          >
            Yazdır
          </button>
          <button
            onClick={downloadExcelReport}
            disabled={!canExportOrPrint}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={!canExportOrPrint ? "Sadece Gün veya Hafta görünümünde kullanılabilir" : "Excel olarak dışa aktar"}
          >
            Excel Dışa Aktar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">+ Yeni</button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-bold text-gray-700">Yeni Randevu</h3>
          {conflictWarning && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <span className="mt-0.5 text-base">⚠️</span>
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
                      setDurationMinutes(30);
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
            <select className="rounded-lg border px-3 py-2 text-sm" value={newDoctorId} onChange={e => setNewDoctorId(e.target.value)}>
              <option value="">Doktor seçin</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
            <div className="relative">
              <input
                list="appointment-treatment-options"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Tedavi yazın veya seçin"
                value={treatmentQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setTreatmentQuery(value);
                  const exact = APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.label.toLowerCase() === value.trim().toLowerCase());
                  if (exact) setTreatmentKey(exact.value);
                }}
                onBlur={() => {
                  const resolved = resolveTreatmentKey(treatmentQuery);
                  const meta = getTreatmentMeta(resolved);
                  setTreatmentKey(resolved);
                  setTreatmentQuery(meta.label);
                }}
              />
              <datalist id="appointment-treatment-options">
                {filteredTreatmentOptions.map((item) => (
                  <option key={item.value} value={item.label} />
                ))}
              </datalist>
            </div>
            <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={e => setStartAt(e.target.value)} />
            <select className="rounded-lg border px-3 py-2 text-sm" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value) as 15 | 30 | 45 | 60 | 90 | 120)}>
              <option value={15}>15 dk</option>
              <option value={30}>30 dk</option>
              <option value={45}>45 dk</option>
              <option value={60}>60 dk</option>
              <option value={90}>90 dk</option>
              <option value={120}>120 dk</option>
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
      )}

      {loading && <div className="py-8 text-center text-gray-400">Yükleniyor...</div>}

      {!loading && view === "GUN" && (
        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-100">
              <tr>
                <th className="border px-2 py-2 text-left text-gray-500 w-16">Saat</th>
                {doctors.length === 0 ? <th className="border px-2 py-2 text-gray-400">Doktor bulunamadı</th> :
                  doctors.map(d => <th key={d.id} className="border px-2 py-2 text-center text-gray-700 font-semibold min-w-36">{d.fullName}</th>)}
              </tr>
            </thead>
            <tbody>
              {SLOT_HOURS.map(slot => (
                <tr key={slot} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-gray-400 font-mono align-top whitespace-nowrap">{slot}</td>
                  {doctors.map(d => {
                    const slotAppts = getApptForSlot(d.id, slot);
                    return (
                      <td
                        key={d.id}
                        className="group border p-1 align-top min-h-9"
                      >
                        {slotAppts.map(a => apptBlock(a))}
                        {slotAppts.length === 0 ? (
                          <button
                            onClick={() => openQuickCreate(slot, date, d.id)}
                            className="w-full rounded border border-dashed border-gray-300 px-1 py-1 text-[11px] text-gray-500 transition hover:border-primary hover:text-primary"
                          >
                            + Randevu Oluştur
                          </button>
                        ) : (
                          <button
                            onClick={() => openQuickCreate(slot, date, d.id)}
                            className="mt-0.5 w-full rounded border border-dashed border-yellow-300 px-1 py-0.5 text-[10px] text-yellow-600 transition hover:border-yellow-500 hover:bg-yellow-50"
                          >
                            + Ekle
                          </button>
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

      {!loading && view === "HAFTA" && (
        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-100">
              <tr>
                <th className="border px-2 py-2 text-left text-gray-500 w-16">Saat</th>
                {weekDays.map((d, i) => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <th key={i} onClick={() => { setDate(d); setView("GUN"); }}
                      className={"border px-2 py-2 text-center cursor-pointer hover:bg-primary/10 min-w-28 " + (isToday ? "bg-primary/20 text-primary font-bold" : "text-gray-700")}>
                      {TR_DAYS[i]}<br /><span className="text-sm">{d.getDate()}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SLOT_HOURS.map(slot => (
                <tr key={slot} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-gray-400 font-mono align-top whitespace-nowrap">{slot}</td>
                  {weekDays.map((d, i) => {
                    const slotAppts = getApptForSlot(doctorId || null, slot, d);
                    return (
                      <td
                        key={i}
                        className="group border p-1 align-top min-h-9"
                      >
                        {slotAppts.map(a => apptBlock(a))}
                        {slotAppts.length === 0 ? (
                          <button
                            onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                            className="w-full rounded border border-dashed border-gray-300 px-1 py-1 text-[11px] text-gray-500 transition hover:border-primary hover:text-primary"
                          >
                            + Randevu Oluştur
                          </button>
                        ) : (
                          <button
                            onClick={() => openQuickCreate(slot, d, doctorId || undefined)}
                            className="mt-0.5 w-full rounded border border-dashed border-yellow-300 px-1 py-0.5 text-[10px] text-yellow-600 transition hover:border-yellow-500 hover:bg-yellow-50"
                          >
                            + Ekle
                          </button>
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

      {!loading && view === "AY" && (
        <div className="rounded-xl border bg-white p-2">
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {TR_DAYS.map(d => <div key={d} className="bg-gray-100 text-center text-xs font-semibold py-2 text-gray-600">{d}</div>)}
            {(() => {
              const firstDay = range.from.getDay();
              const offset = firstDay === 0 ? 6 : firstDay - 1;
              return Array.from({length: offset}, (_, i) => <div key={"e"+i} className="bg-white min-h-20" />);
            })()}
            {monthDays.map((d, i) => {
              const dayAppts = getApptForDay(d);
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={i} onClick={() => { setDate(d); setView("GUN"); }}
                  className={"bg-white min-h-20 p-1 cursor-pointer hover:bg-blue-50 " + (isToday ? "ring-2 ring-inset ring-primary" : "")}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className={"text-xs font-bold " + (isToday ? "text-primary" : "text-gray-700")}>{d.getDate()}</div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        openQuickCreate("09:00", d, doctorId || undefined);
                      }}
                      className="rounded border border-dashed border-gray-300 px-1 text-[10px] text-gray-500 hover:border-primary hover:text-primary"
                    >
                      +
                    </button>
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

      {!loading && view === "AJANDA" && (
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

      {selectedAppt && (
        (() => {
          const parsed = parseAppointmentNote(selectedAppt.note);
          const meta = getFollowUpMeta(parsed.followUp);
          const treatmentMeta = getTreatmentMeta(parsed.treatment);
          return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">Randevu Detayi</h3>
              <button onClick={() => setSelectedAppt(null)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>
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
              <select
                value={followUpStatus}
                onChange={(e) => setFollowUpStatus(e.target.value as FollowUpKey)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {FOLLOW_UP_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <textarea
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                rows={3}
                placeholder="Örn: Hasta gelmedi, 2 kez arandı ulaşılmadı. Yarın tekrar aranacak."
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={saveAppointmentFollowUp}
                  disabled={detailSaving}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {detailSaving ? "Kaydediliyor..." : "Takip Notunu Kaydet"}
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <a href={"/hasta-detay?id=" + selectedAppt.patient?.id} className="rounded-lg bg-primary px-3 py-2 text-sm text-white">Hasta Detayi</a>
              <button onClick={() => remove(selectedAppt.id)} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Sil</button>
              <button onClick={() => setSelectedAppt(null)} className="ml-auto rounded-lg border px-3 py-2 text-sm text-gray-600">Kapat</button>
            </div>
          </div>
        </div>
          );
        })()
      )}
    </section>
  );
}
