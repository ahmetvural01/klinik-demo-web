"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { cachedGet } from "@/lib/client-cache";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

type PlanStatus = "PLANLANDI" | "DEVAM_EDIYOR" | "TAMAMLANDI" | "IPTAL";
type StepStatus = "BEKLIYOR" | "YAPILDI" | "IPTAL";

type Step = {
  id: string; order: number; treatmentName: string; toothNo?: string;
  amount: number; status: StepStatus; doneAt?: string; note?: string;
};

type Plan = {
  id: string; title: string; status: PlanStatus; totalCost?: number; notes?: string; createdAt: string;
  patient: { id: string; fullName: string; tcNo: string };
  doctor:  { id: string; fullName: string };
  steps:   Step[];
};

type Patient = { id: string; fullName: string; tcNo: string };
type Doctor  = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean | null } | null };

const STATUS_CFG: Record<PlanStatus, { label: string; bg: string; text: string; tone: BadgeTone }> = {
  PLANLANDI:    { label: "Planlandı",    bg: "bg-primary/10",   text: "text-primary",   tone: "info" },
  DEVAM_EDIYOR: { label: "Devam Ediyor", bg: "bg-amber-100",  text: "text-amber-700",  tone: "warning" },
  TAMAMLANDI:   { label: "Tamamlandı",   bg: "bg-emerald-100",text: "text-emerald-700",tone: "success" },
  IPTAL:        { label: "İptal",        bg: "bg-red-100",    text: "text-red-600",    tone: "critical" },
};

const STEP_STATUS: Record<StepStatus, { label: string; tone: BadgeTone }> = {
  BEKLIYOR: { label: "Bekliyor", tone: "neutral" },
  YAPILDI:  { label: "Yapıldı",  tone: "success" },
  IPTAL:    { label: "İptal",    tone: "critical" },
};

const CURRENCY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });

const EMPTY_STATUS_COUNTS: Record<PlanStatus, number> = { PLANLANDI: 0, DEVAM_EDIYOR: 0, TAMAMLANDI: 0, IPTAL: 0 };

export default function TedaviPlaniPage() {
  const [plans,    setPlans]    = useState<Plan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"" | PlanStatus>("");
  const [search,   setSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [showNew,  setShowNew]  = useState(false);
  const [page,       setPage]       = useState(1);
  const [pageCount,  setPageCount]  = useState(1);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<PlanStatus, number> }>({ total: 0, byStatus: EMPTY_STATUS_COUNTS });

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter]);

  // New plan form
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [doctors,   setDoctors]   = useState<Doctor[]>([]);
  const [newPlan,   setNewPlan]   = useState({ patientId: "", doctorId: "", title: "", notes: "" });
  const [newSteps,  setNewSteps]  = useState([{ treatmentName: "", toothNo: "", amount: "" }]);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    fetch("/api/patients?limit=200").then(r => r.json()).then(d => setPatients(Array.isArray(d) ? d : (d.patients || []))).catch(() => {});
    cachedGet<unknown>("/api/staff", 60_000).then(d => setDoctors((Array.isArray(d) ? d : []).filter((u: Doctor) => u.role === "DOKTOR" || (u.role === "YONETICI" && u.profile?.hideAsDoctor === false)))).catch(() => {});
  }, []);

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedSearch, page]);

  function fetchPlans() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filter) params.set("status", filter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    fetch(`/api/treatment-plans?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        setPlans(Array.isArray(d.items) ? d.items : []);
        setPageCount(d.pageCount || 1);
        if (d.stats) setStats(d.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const filtered = plans;

  async function submitNew() {
    if (!newPlan.patientId || !newPlan.doctorId || !newPlan.title) return;
    setSaving(true);
    const steps = newSteps.filter(s => s.treatmentName.trim()).map(s => ({ ...s, amount: Number(s.amount) || 0 }));
    await fetch("/api/treatment-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newPlan, steps }) }).catch(() => {});
    setShowNew(false);
    setNewPlan({ patientId: "", doctorId: "", title: "", notes: "" });
    setNewSteps([{ treatmentName: "", toothNo: "", amount: "" }]);
    setSaving(false);
    fetchPlans();
  }

  async function updateStatus(planId: string, status: string) {
    await fetch(`/api/treatment-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => {});
    fetchPlans();
    setSelected(s => s ? { ...s, status: status as PlanStatus } : null);
  }

  async function updateStep(planId: string, stepId: string, status: StepStatus) {
    await fetch(`/api/treatment-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepUpdates: [{ id: stepId, status }] }) }).catch(() => {});
    setSelected(s => {
      if (!s) return null;
      return { ...s, steps: s.steps.map(st => st.id === stepId ? { ...st, status } : st) };
    });
    fetchPlans();
  }

  const inp = "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Tedavi Planları</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{stats.total} plan</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">{stats.byStatus.DEVAM_EDIYOR} devam ediyor</span>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
          Yeni Tedavi Planı
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hasta veya tedavi planı ara" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        {(["", "PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${filter === s ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {s === "" ? "Tümü" : STATUS_CFG[s].label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["PLANLANDI","DEVAM_EDIYOR","TAMAMLANDI","IPTAL"] as PlanStatus[]).map(s => {
          const cfg = STATUS_CFG[s];
          const count = stats.byStatus[s] || 0;
          const cardBorderClass: Record<PlanStatus, string> = {
            PLANLANDI: "bg-primary/5 border-primary/15",
            DEVAM_EDIYOR: "bg-amber-50 border-amber-100",
            TAMAMLANDI: "bg-emerald-50 border-emerald-100",
            IPTAL: "bg-red-50 border-red-100",
          };
          return (
            <div key={s} className={`rounded-2xl border p-4 ${cardBorderClass[s]}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</p>
              <p className={`mt-1 text-2xl font-bold ${cfg.text}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Plans Grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-16 text-slate-300">
              <svg className="mb-3 h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              <p className="text-sm text-slate-400">Tedavi planı bulunamadı</p>
            </div>
          )}
          {filtered.map(plan => {
            const cfg = STATUS_CFG[plan.status];
            const done = plan.steps.filter(s => s.status === "YAPILDI").length;
            const pct  = plan.steps.length > 0 ? Math.round((done / plan.steps.length) * 100) : 0;
            return (
              <button key={plan.id} onClick={() => setSelected(plan)} className="cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:border-primary/20 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 leading-tight">{plan.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{plan.patient.fullName}</p>
                  </div>
                  <Badge tone={cfg.tone} size="sm">{cfg.label}</Badge>
                </div>
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{done}/{plan.steps.length} adım</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{plan.doctor.fullName}</p>
                  {plan.totalCost && <p className="text-xs font-bold text-slate-700">{CURRENCY.format(plan.totalCost)}</p>}
                </div>
              </button>
            );
          })}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Sayfa {page} / {pageCount}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">← Önceki</button>
            <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">Sonraki →</button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        description={selected ? `${selected.patient.fullName} · ${selected.doctor.fullName}` : undefined}
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {/* Status control */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(["PLANLANDI","DEVAM_EDIYOR","TAMAMLANDI","IPTAL"] as PlanStatus[]).map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${selected.status === s ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
            {/* Steps */}
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800">Tedavi Adımları</h3>
              <div className="space-y-2">
                {selected.steps.map(step => {
                  const sCfg = STEP_STATUS[step.status] || STEP_STATUS.BEKLIYOR;
                  return (
                    <div key={step.id} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:items-center">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600">{step.order}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{step.treatmentName}</p>
                        {step.toothNo && <p className="text-[11px] text-slate-400">Diş: {step.toothNo}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-slate-600">{CURRENCY.format(step.amount)}</span>
                      <Badge tone={sCfg.tone} size="sm">{sCfg.label}</Badge>
                      <select value={step.status} onChange={e => updateStep(selected.id, step.id, e.target.value as StepStatus)}
                        disabled={selected.status === "TAMAMLANDI" || selected.status === "IPTAL"}
                        title={selected.status === "TAMAMLANDI" || selected.status === "IPTAL" ? "Tamamlanmış/iptal edilmiş planın adımları değiştirilemez — önce planı yeniden açın" : undefined}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-100">
                        <option value="BEKLIYOR">Bekliyor</option>
                        <option value="YAPILDI">Yapıldı</option>
                        <option value="IPTAL">İptal</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            {selected.totalCost && (
              <div className="rounded-xl bg-primary/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">Toplam Tutar</span>
                <span className="text-xl font-black text-primary-strong">{CURRENCY.format(selected.totalCost)}</span>
              </div>
            )}
            {selected.notes && <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{selected.notes}</p>}
          </div>
        )}
      </Modal>

      {/* New Plan Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Yeni Tedavi Planı" size="md">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta</label>
              <select value={newPlan.patientId} onChange={e => setNewPlan(p => ({ ...p, patientId: e.target.value }))} className={inp + " w-full"}>
                <option value="">Seçiniz…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor</label>
              <select value={newPlan.doctorId} onChange={e => setNewPlan(p => ({ ...p, doctorId: e.target.value }))} className={inp + " w-full"}>
                <option value="">Seçiniz…</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Plan Başlığı</label>
            <input value={newPlan.title} onChange={e => setNewPlan(p => ({ ...p, title: e.target.value }))} placeholder="Örn: İmplant + Kuron Tedavisi" className={inp + " w-full"} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Tedavi Adımları</label>
              <Button variant="ghost" size="sm" onClick={() => setNewSteps(s => [...s, { treatmentName: "", toothNo: "", amount: "" }])}>Adım Ekle</Button>
            </div>
            <div className="space-y-2">
              {newSteps.map((step, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)_90px_110px_auto] sm:items-center">
                  <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>
                  <input value={step.treatmentName} onChange={e => setNewSteps(s => s.map((x, j) => j === i ? { ...x, treatmentName: e.target.value } : x))} placeholder="Tedavi adı" className={inp + " flex-1"} />
                  <input value={step.toothNo} onChange={e => setNewSteps(s => s.map((x, j) => j === i ? { ...x, toothNo: e.target.value } : x))} placeholder="Diş no" className={inp + " w-full"} />
                  <input type="number" value={step.amount} onChange={e => setNewSteps(s => s.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="Tutar" className={inp + " w-full"} />
                  {newSteps.length > 1 && <Button variant="danger" size="sm" onClick={() => setNewSteps(s => s.filter((_, j) => j !== i))}>Sil</Button>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Notlar</label>
            <textarea value={newPlan.notes} onChange={e => setNewPlan(p => ({ ...p, notes: e.target.value }))} rows={2} className={inp + " w-full resize-none"} placeholder="İsteğe bağlı not…" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowNew(false)} fullWidth>İptal</Button>
            <Button variant="primary" onClick={() => void submitNew()} loading={saving} fullWidth>
              Oluştur
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
