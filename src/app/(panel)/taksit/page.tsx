"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Patient = { id: string; fullName: string; phone: string };
type Doctor = { id: string; fullName: string; role: string };
type TaksitItem = {
  id: string; siraNo: number; vadeDate: string;
  tutar: number; odenen: number; kalan: number; status: string;
  odemeler?: { id: string; tarih: string; tutar: number; yontem: string }[];
};
type Plan = {
  id: string; baslik?: string; toplamBorc: number; pesnat: number;
  taksitSayisi: number; period: string; startDate: string;
  notes?: string; status: string; createdAt: string;
  patient: Patient; doctor: Doctor;
  taksitler: TaksitItem[];
};
type Reminder = {
  id: string; note: string; reminderDate: string; status: string;
  patient?: { fullName: string };
};

const PERIODS: Record<string, string> = {
  HAFTALIK: "Haftalık", IKIHALFTALIK: "2 Haftalık",
  AYLIK: "Aylık", IKIAYLIK: "2 Aylık",
  UCAYLIK: "3 Aylık", ALTIAYLIK: "6 Aylık", YILLIK: "Yıllık"
};

const STATUS_BADGE: Record<string, string> = {
  AKTIF: "bg-blue-100 text-blue-700",
  DEVAM_EDIYOR: "bg-amber-100 text-amber-700",
  TAMAMLANDI: "bg-emerald-100 text-emerald-700",
  IPTAL: "bg-red-100 text-red-700",
  BEKLIYOR: "bg-slate-100 text-slate-700",
  ODENDI: "bg-emerald-100 text-emerald-700",
  GECIKTI: "bg-red-100 text-red-700",
};

const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("tr-TR") : "-";
const isLate = (vade: string, status: string) =>
  status === "BEKLIYOR" && new Date(vade) < new Date();

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TaksitPage() {
  const [tab, setTab] = useState<"liste" | "olustur" | "hatirlatma">("liste");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  };

  // filters
  const [filterStatus, setFilterStatus] = useState("HEPSI");
  const [filterSearch, setFilterSearch] = useState("");

  // selected plan
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [planDetail, setPlanDetail] = useState<Plan | null>(null);

  // modals
  const [showOdeModal, setShowOdeModal] = useState<TaksitItem | null>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);

  // new plan form
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState({
    patientId: "", doctorId: "", baslik: "",
    toplamBorc: "", pesnat: "0", taksitSayisi: "6",
    period: "AYLIK", startDate: new Date().toISOString().split("T")[0], notes: ""
  });

  // payment form
  const [odeForm, setOdeForm] = useState({ tutar: "", yontem: "NAKIT", note: "" });

  // reminder form
  const [remForm, setRemForm] = useState({
    patientId: "", note: "", reminderDate: new Date().toISOString().split("T")[0]
  });

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterStatus !== "HEPSI" ? `?status=${filterStatus}` : "";
      const r = await fetch(`/api/taksit-plani${qs}`);
      const d = await r.json();
      setPlans(d);
    } finally { setLoading(false); }
  }, [filterStatus]);

  const loadReminders = useCallback(async () => {
    const r = await fetch("/api/reminder?status=HEPSI");
    const d = await r.json();
    setReminders(d);
  }, []);

  useEffect(() => {
    // Vadesi geçen taksitleri otomatik GECIKTI olarak işaretle
    fetch("/api/taksit-plani/mark-gecikti", { method: "POST" }).catch(() => null);
    loadPlans();
  }, [loadPlans]);
  useEffect(() => { if (tab === "hatirlatma") loadReminders(); }, [tab, loadReminders]);

  useEffect(() => {
    fetch("/api/patients?limit=500").then(r => r.json()).then(d => setPatients(d.patients || d));
    fetch("/api/staff").then(r => r.json()).then(d => setDoctors((Array.isArray(d) ? d : []).filter((u: Doctor) => u.role === "DOKTOR")));
  }, []);

  const loadPlanDetail = async (id: string) => {
    const r = await fetch(`/api/taksit-plani/${id}`);
    const d = await r.json();
    setPlanDetail(d);
    setSelectedPlan(d);
  };

  // KPI hesapla
  const geciken = plans.filter(p =>
    p.taksitler.some(t => isLate(t.vadeDate, t.status))
  ).length;
  const toplamKalan = plans
    .filter(p => p.status !== "TAMAMLANDI" && p.status !== "IPTAL")
    .flatMap(p => p.taksitler)
    .reduce((s, t) => s + Number(t.kalan), 0);
  const bekleyen = plans.flatMap(p => p.taksitler).filter(t => t.status === "BEKLIYOR").length;
  const bugunVade = plans.flatMap(p => p.taksitler).filter(t => {
    const v = new Date(t.vadeDate); const now = new Date();
    return t.status === "BEKLIYOR" &&
      v.getDate() === now.getDate() && v.getMonth() === now.getMonth() && v.getFullYear() === now.getFullYear();
  }).length;

  const filteredPlans = plans.filter(p => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return p.patient.fullName.toLowerCase().includes(q) ||
      p.doctor.fullName.toLowerCase().includes(q) ||
      (p.baslik || "").toLowerCase().includes(q);
  });

  // Create plan
  const handleCreatePlan = async () => {
    if (!form.patientId || !form.doctorId || !form.toplamBorc || !form.taksitSayisi) {
      showToast("error", "Lütfen zorunlu alanları doldurun."); return;
    }
    const r = await fetch("/api/taksit-plani", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: form.patientId, doctorId: form.doctorId,
        baslik: form.baslik || null,
        toplamBorc: Number(form.toplamBorc), pesnat: Number(form.pesnat || 0),
        taksitSayisi: Number(form.taksitSayisi), period: form.period,
        startDate: form.startDate, notes: form.notes || null
      })
    });
    if (r.ok) {
      showToast("success", "Taksit planı oluşturuldu.");
      setForm({ patientId: "", doctorId: "", baslik: "", toplamBorc: "", pesnat: "0", taksitSayisi: "6", period: "AYLIK", startDate: new Date().toISOString().split("T")[0], notes: "" });
      setTab("liste");
      loadPlans();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  // Pay taksit
  const handleOde = async () => {
    if (!showOdeModal || !odeForm.tutar) return;
    const r = await fetch(`/api/taksit-plani/${selectedPlan?.id}/taksitler/${showOdeModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tutar: Number(odeForm.tutar), yontem: odeForm.yontem, note: odeForm.note || null })
    });
    if (r.ok) {
      setShowOdeModal(null);
      setOdeForm({ tutar: "", yontem: "NAKIT", note: "" });
      if (selectedPlan) loadPlanDetail(selectedPlan.id);
      loadPlans();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  // Add reminder
  const handleAddReminder = async () => {
    if (!remForm.note || !remForm.reminderDate) return;
    const r = await fetch("/api/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: remForm.patientId || null,
        note: remForm.note,
        reminderDate: remForm.reminderDate
      })
    });
    if (r.ok) {
      setShowReminderModal(false);
      setRemForm({ patientId: "", note: "", reminderDate: new Date().toISOString().split("T")[0] });
      loadReminders();
    }
  };

  const completeReminder = async (id: string) => {
    await fetch(`/api/reminder/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "TAMAMLANDI" })
    });
    loadReminders();
  };

  const cancelPlan = async (id: string) => {
    if (!confirm("Bu plani iptal etmek istediginizden emin misiniz?")) return;
    await fetch(`/api/taksit-plani/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IPTAL" })
    });
    loadPlans();
    if (selectedPlan?.id === id) setSelectedPlan(null);
  };

  return (
    <div className="p-4 space-y-4">
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>{toast.type === "success" ? "✓" : "✕"} {toast.text}</div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Taksit Yönetimi</h1>
        <button onClick={() => setTab("olustur")}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
          + Yeni Plan
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Toplam Kalan", value: fmt(toplamKalan), color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Bekleyen Taksit", value: bekleyen.toString(), color: "text-amber-700", bg: "bg-amber-50" },
          { label: "Geciken", value: geciken.toString(), color: "text-red-700", bg: "bg-red-50" },
          { label: "Bugün Vadeli", value: bugunVade.toString(), color: "text-emerald-700", bg: "bg-emerald-50" },
        ].map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 border border-slate-100`}>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{k.label}</p>
            <p className={`text-xl font-bold ${k.color} mt-0.5`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "liste", label: "Plan Listesi" },
          { key: "olustur", label: "Yeni Plan Olustur" },
          { key: "hatirlatma", label: `Hatirlatmalar (${reminders.filter(r => r.status === "AKTIF").length})` },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as "liste" | "olustur" | "hatirlatma")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${tab === t.key ? "bg-white border border-b-white border-slate-200 text-blue-600 -mb-px" : "text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Liste ─── */}
      {tab === "liste" && (
        <div className="flex gap-4">
          {/* Sol: Plan listesi */}
          <div className="flex-1 min-w-0">
            {/* Filtreler */}
            <div className="flex flex-wrap gap-2 mb-3">
              <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="Hasta/doktor ara..." className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="HEPSI">Tum Durumlar</option>
                <option value="AKTIF">Aktif</option>
                <option value="DEVAM_EDIYOR">Devam Ediyor</option>
                <option value="TAMAMLANDI">Tamamlandi</option>
                <option value="IPTAL">Iptal</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Yukleniyor...</div>
            ) : filteredPlans.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">Kayit bulunamadi</div>
            ) : (
              <div className="space-y-2">
                {filteredPlans.map(plan => {
                  const kalan = plan.taksitler.reduce((s, t) => s + Number(t.kalan), 0);
                  const odenen = plan.taksitler.reduce((s, t) => s + Number(t.odenen), 0);
                  const gec = plan.taksitler.filter(t => isLate(t.vadeDate, t.status)).length;
                  const bek = plan.taksitler.filter(t => t.status === "BEKLIYOR").length;
                  const isSelected = selectedPlan?.id === plan.id;

                  return (
                    <div key={plan.id}
                      onClick={() => { setSelectedPlan(plan); loadPlanDetail(plan.id); }}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-800 truncate">{plan.patient.fullName}</span>
                            {plan.baslik && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{plan.baslik}</span>}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[plan.status]}`}>{plan.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                            <span>Dr: {plan.doctor.fullName}</span>
                            <span>{plan.taksitSayisi} taksit / {PERIODS[plan.period]}</span>
                            <span>Toplam: {fmt(plan.toplamBorc)}</span>
                            <span>Odenen: {fmt(odenen)}</span>
                            <span className={kalan > 0 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>
                              Kalan: {fmt(kalan)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {gec > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">{gec} Gecikti</span>}
                          {bek > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{bek} Bekliyor</span>}
                          <button onClick={e => { e.stopPropagation(); cancelPlan(plan.id); }}
                            className="text-[10px] text-red-400 hover:text-red-600 mt-1">Iptal</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sag: Plan detay & tahsilat */}
          {planDetail && (
            <div className="w-80 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700">Taksit Detay</h3>
                  <button onClick={() => { setSelectedPlan(null); setPlanDetail(null); }}
                    className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
                </div>
                <div className="text-[10px] text-slate-500 space-y-0.5">
                  <p><b>Hasta:</b> {planDetail.patient.fullName}</p>
                  <p><b>Doktor:</b> {planDetail.doctor.fullName}</p>
                  <p><b>Toplam Borc:</b> {fmt(planDetail.toplamBorc)}</p>
                  {planDetail.pesnat > 0 && <p><b>Pesnat:</b> {fmt(planDetail.pesnat)}</p>}
                  <p><b>Periyot:</b> {PERIODS[planDetail.period]}</p>
                  <p><b>Baslangic:</b> {fmtDate(planDetail.startDate)}</p>
                </div>

                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {planDetail.taksitler.map(t => {
                    const late = isLate(t.vadeDate, t.status);
                    return (
                      <div key={t.id} className={`rounded-lg border p-2 text-[10px] ${late ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">#{t.siraNo} — {fmtDate(t.vadeDate)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_BADGE[t.status] ?? ""}`}>{t.status}</span>
                        </div>
                        <div className="flex justify-between mt-0.5 text-slate-500">
                          <span>Tutar: {fmt(Number(t.tutar))}</span>
                          <span>Kalan: <b className={Number(t.kalan) > 0 ? "text-amber-600" : "text-emerald-600"}>{fmt(Number(t.kalan))}</b></span>
                        </div>
                        {t.status !== "ODENDI" && t.status !== "IPTAL" && (
                          <button
                            onClick={() => { setShowOdeModal(t); setOdeForm({ tutar: String(t.kalan), yontem: "NAKIT", note: "" }); }}
                            className="mt-1.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold py-1 rounded">
                            Tahsilat Yap
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: Yeni Plan ─── */}
      {tab === "olustur" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-lg space-y-3">
          <h2 className="text-sm font-bold text-slate-700 mb-2">Yeni Taksit Plani Olustur</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Hasta *</label>
              <select value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">-- Secin --</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Doktor *</label>
              <select value={form.doctorId} onChange={e => setForm({ ...form, doctorId: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">-- Secin --</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Baslik (Opsiyonel)</label>
              <input value={form.baslik} onChange={e => setForm({ ...form, baslik: e.target.value })}
                placeholder="orn: Implant Tedavisi" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Toplam Borc (TL) *</label>
              <input type="number" value={form.toplamBorc} onChange={e => setForm({ ...form, toplamBorc: e.target.value })}
                placeholder="0.00" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Pesnat (TL)</label>
              <input type="number" value={form.pesnat} onChange={e => setForm({ ...form, pesnat: e.target.value })}
                placeholder="0.00" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Taksit Sayisi *</label>
              <input type="number" min="1" max="60" value={form.taksitSayisi} onChange={e => setForm({ ...form, taksitSayisi: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Odeme Periyodu</label>
              <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Ilk Taksit Tarihi *</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Onizleme */}
          {form.toplamBorc && form.taksitSayisi && Number(form.taksitSayisi) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[10px] text-blue-700 space-y-0.5">
              <p className="font-semibold">Onizleme:</p>
              <p>Kalan borc: {fmt(Number(form.toplamBorc) - Number(form.pesnat || 0))}</p>
              <p>Her taksit: {fmt((Number(form.toplamBorc) - Number(form.pesnat || 0)) / Number(form.taksitSayisi))}</p>
              <p>{form.taksitSayisi} taksit × {PERIODS[form.period]}</p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Notlar</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setTab("liste")}
              className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-lg hover:bg-slate-50">
              Iptal
            </button>
            <button onClick={handleCreatePlan}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg">
              Plan Olustur
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB: Hatirlatmalar ─── */}
      {tab === "hatirlatma" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Hatirlatmalar</h2>
            <button onClick={() => setShowReminderModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              + Hatirlatma Ekle
            </button>
          </div>

          {reminders.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Hatirlatma bulunamadi</div>
          ) : (
            <div className="space-y-2">
              {reminders.map(r => {
                const isToday = new Date(r.reminderDate).toDateString() === new Date().toDateString();
                const isPast = new Date(r.reminderDate) < new Date() && r.status === "AKTIF";
                return (
                  <div key={r.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${isPast ? "border-red-200 bg-red-50" : isToday ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-700">{r.note}</p>
                      <div className="flex gap-3 text-[10px] text-slate-500 mt-0.5">
                        {r.patient && <span>Hasta: {r.patient.fullName}</span>}
                        <span>Tarih: {fmtDate(r.reminderDate)}</span>
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${r.status === "AKTIF" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{r.status}</span>
                      </div>
                    </div>
                    {r.status === "AKTIF" && (
                      <button onClick={() => completeReminder(r.id)}
                        className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-semibold">
                        Tamamla
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Modal: Tahsilat ─── */}
      {showOdeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Tahsilat Yap — Taksit #{showOdeModal.siraNo}</h3>
            <div className="text-[10px] text-slate-500 space-y-0.5">
              <p>Vade Tarihi: {fmtDate(showOdeModal.vadeDate)}</p>
              <p>Taksit Tutari: {fmt(Number(showOdeModal.tutar))}</p>
              <p>Kalan: <b>{fmt(Number(showOdeModal.kalan))}</b></p>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Tahsilat Tutari (TL) *</label>
              <input type="number" value={odeForm.tutar} onChange={e => setOdeForm({ ...odeForm, tutar: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Odeme Yontemi</label>
              <select value={odeForm.yontem} onChange={e => setOdeForm({ ...odeForm, yontem: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="NAKIT">Nakit</option>
                <option value="KREDI_KARTI">Kredi Karti</option>
                <option value="HAVALE_EFT">Havale/EFT</option>
                <option value="MAIL_ORDER">Mail Order</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Not</label>
              <input value={odeForm.note} onChange={e => setOdeForm({ ...odeForm, note: e.target.value })}
                placeholder="Opsiyonel..." className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowOdeModal(null)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs py-2 rounded-lg hover:bg-slate-50">
                Vazgec
              </button>
              <button onClick={handleOde}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-lg">
                Tahsilat Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Hatirlatma Ekle ─── */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Hatirlatma Ekle</h3>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Hasta (Opsiyonel)</label>
              <select value={remForm.patientId} onChange={e => setRemForm({ ...remForm, patientId: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">-- Hasta Secin --</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Not *</label>
              <textarea value={remForm.note} onChange={e => setRemForm({ ...remForm, note: e.target.value })}
                rows={3} className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Tarih *</label>
              <input type="date" value={remForm.reminderDate} onChange={e => setRemForm({ ...remForm, reminderDate: e.target.value })}
                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowReminderModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs py-2 rounded-lg">Vazgec</button>
              <button onClick={handleAddReminder}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
