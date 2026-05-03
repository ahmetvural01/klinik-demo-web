"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FollowUpKey,
  FOLLOW_UP_OPTIONS,
  buildAppointmentNote,
  getFollowUpMeta,
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
type Patient = { id: string; fullName: string };

const STATUS_COLORS: Record<string, string> = {
  BEKLIYOR: "bg-yellow-50 border-l-4 border-yellow-400",
  GELDI: "bg-green-50 border-l-4 border-green-500",
  GELMEDI: "bg-red-50 border-l-4 border-red-500",
  IPTAL: "bg-gray-100 border-l-4 border-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor", GELDI: "Geldi", GELMEDI: "Gelmedi", IPTAL: "İptal"
};

const TYPE_BADGE: Record<string, string> = {
  STANDART: "bg-blue-100 text-blue-700",
  KONTROL: "bg-yellow-100 text-yellow-700",
  ACIL: "bg-red-100 text-red-700",
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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [newDoctorId, setNewDoctorId] = useState("");
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60000)));
  const [type, setType] = useState<"STANDART" | "KONTROL" | "ACIL">("STANDART");
  const [note, setNote] = useState("");
  const [smsInfo, setSmsInfo] = useState(true);
  const [smsReminder, setSmsReminder] = useState(false);
  const [smsSurvey, setSmsSurvey] = useState(false);
  const [colorCode, setColorCode] = useState("#2a9d8f");
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpKey>("YOK");
  const [followUpNote, setFollowUpNote] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      if (doctorId) params.set("doctorId", doctorId);
      const [aRes, sRes, pRes] = await Promise.all([
        fetch("/api/appointments?" + params.toString()),
        fetch("/api/staff"),
        fetch("/api/patients")
      ]);
      const [aJson, sJson, pJson] = await Promise.all([aRes.json(), sRes.json(), pRes.json()]);
      setAppointments(Array.isArray(aJson) ? aJson : []);
      setStaff(sJson.filter((x: Staff) => x.role === "DOKTOR" || x.role === "YONETICI"));
      setPatients(pJson);
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

  const createAppointment = async () => {
    if (!patientId || !newDoctorId) return setError("Hasta ve doktor seçin");
    setSaving(true); setError(null);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, doctorId: newDoctorId, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), type, colorCode, note, smsInfo, smsReminder, smsSurvey })
    });
    setSaving(false);
    if (!res.ok) { const b = await res.json().catch(() => ({ message: "Kaydedilemedi" })); setError(b.message || "Kaydedilemedi"); return; }
    setShowForm(false); setPatientId(""); setNewDoctorId(""); setNote("");
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
    const nextNote = buildAppointmentNote(followUpStatus, followUpNote);
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

  const openQuickCreate = (slotTime: string, forDate: Date, slotDoctorId?: string) => {
    const [h, m] = slotTime.split(":").map(Number);
    const start = new Date(forDate);
    start.setHours(h, m, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    const docId = slotDoctorId || doctorId || null;
    const existing = getApptForSlot(docId, slotTime, forDate);
    if (existing.length > 0) {
      const names = existing.map(a => a.patient?.fullName || "Hasta").join(", ");
      setConflictWarning(`Bu saatte (${slotTime}) zaten ${existing.length} randevu mevcut: ${names}. Yine de ekleyebilirsiniz.`);
    } else {
      setConflictWarning(null);
    }

    setStartAt(toLocalInput(start));
    setEndAt(toLocalInput(end));
    setNewDoctorId(docId || "");
    setShowForm(true);
  };

  const doctors = doctorId ? staff.filter(s => s.id === doctorId) : staff;

  const apptBlock = (a: Appointment) => (
    (() => {
      const parsed = parseAppointmentNote(a.note);
      const meta = getFollowUpMeta(parsed.followUp);
      return (
    <div key={a.id} onClick={() => setSelectedAppt(a)}
      className={"rounded p-1 mb-0.5 cursor-pointer " + (STATUS_COLORS[a.status] || "bg-blue-50 border-l-4 border-blue-400")}>
      <p className="font-semibold text-gray-800 truncate text-xs">{a.patient?.fullName || "-"}</p>
      <p className="text-gray-500 text-xs">{new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</p>
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
        <div className="flex gap-1">
          {(["GUN","HAFTA","AY","AJANDA"] as const).map(mode => (
            <button key={mode} onClick={() => setView(mode)}
              className={"rounded-lg px-4 py-2 text-sm font-semibold transition-colors " + (view === mode ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
              {mode === "GUN" ? "Gün" : mode === "HAFTA" ? "Hafta" : mode === "AY" ? "Ay" : "Ajanda"}
            </button>
          ))}
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
          {error && <p className="mb-2 text-red-600 text-sm">{error}</p>}
          <div className="grid gap-2 md:grid-cols-3">
            <select className="rounded-lg border px-3 py-2 text-sm" value={patientId} onChange={e => setPatientId(e.target.value)}>
              <option value="">Hasta seçin</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            <select className="rounded-lg border px-3 py-2 text-sm" value={newDoctorId} onChange={e => setNewDoctorId(e.target.value)}>
              <option value="">Doktor seçin</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
            <select className="rounded-lg border px-3 py-2 text-sm" value={type} onChange={e => setType(e.target.value as typeof type)}>
              <option value="STANDART">Standart</option>
              <option value="KONTROL">Kontrol</option>
              <option value="ACIL">Acil</option>
            </select>
            <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={e => setStartAt(e.target.value)} />
            <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={endAt} onChange={e => setEndAt(e.target.value)} />
            <div className="flex items-center gap-1.5">
              {["#2a9d8f","#e76f51","#264653","#e9c46a","#f4a261","#6c757d","#9b5de5","#00bbf9"].map(c => (
                <button key={c} onClick={() => setColorCode(c)} style={{background:c}}
                  className={"h-6 w-6 rounded-full border-2 " + (colorCode === c ? "border-gray-900 scale-125" : "border-transparent")} />
              ))}
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
            <button onClick={() => { setShowForm(false); setConflictWarning(null); }} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">İptal</button>
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
                    <div key={a.id} style={{background: a.colorCode||"#2a9d8f"}}
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
          {appointments.length === 0 && <p className="py-8 text-center text-gray-400">Bu tarih aralığında randevu yok</p>}
          {appointments.map(a => (
            (() => {
              const parsed = parseAppointmentNote(a.note);
              const meta = getFollowUpMeta(parsed.followUp);
              return (
            <div key={a.id} onClick={() => setSelectedAppt(a)}
              className={"flex items-center gap-3 rounded-lg border bg-white p-3 cursor-pointer hover:shadow-sm " + (STATUS_COLORS[a.status] || "")}>
              <div className="flex flex-col items-center min-w-16 text-center">
                <span className="text-xs text-gray-500">{new Date(a.startAt).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}</span>
                <span className="text-sm font-bold text-primary">{new Date(a.startAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{a.patient?.fullName}</p>
                <p className="text-xs text-gray-500">{a.doctor?.fullName} - {a.type}</p>
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
              <div className="flex justify-between"><span className="text-gray-500">Tip:</span><span className={"rounded-full px-2 py-0.5 text-xs " + (TYPE_BADGE[selectedAppt.type]||"")}>{selectedAppt.type}</span></div>
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
