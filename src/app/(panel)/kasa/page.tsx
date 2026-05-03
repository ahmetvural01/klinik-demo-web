"use client";

import { useEffect, useState } from "react";

type PaymentMethod = "NAKIT" | "KREDI_KARTI" | "HAVALE_EFT";

type Payment = {
  id: string; method: PaymentMethod; amount: number; description?: string; createdAt: string;
  patient?: { id: string; fullName: string } | null;
};

type KasaData = {
  date: string; total: number;
  byMethod: Record<string, number>;
  payments: Payment[];
};

type Patient = { id: string; fullName: string };

const METHOD_CFG: Record<PaymentMethod, { label: string; icon: string; bg: string; text: string }> = {
  NAKIT:       { label: "Nakit",         icon: "💵", bg: "bg-emerald-100", text: "text-emerald-700" },
  KREDI_KARTI: { label: "Kredi Kartı",   icon: "💳", bg: "bg-blue-100",    text: "text-blue-700"    },
  HAVALE_EFT:  { label: "Havale/EFT",    icon: "🏦", bg: "bg-violet-100",  text: "text-violet-700"  },
};

const CURRENCY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function KasaPage() {
  const [data,    setData]    = useState<KasaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date,    setDate]    = useState(toInputDate(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [posDevices, setPosDevices] = useState<{ id: string; name: string }[]>([]);
  const [form,    setForm]    = useState({ patientId: "", method: "NAKIT", amount: "", description: "", posId: "" });
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { fetchData(); }, [date]);
  useEffect(() => {
    fetch("/api/patients?limit=200").then(r => r.json()).then(d => setPatients(Array.isArray(d) ? d : (d.patients || []))).catch(() => {});
    fetch("/api/pos-devices").then(r => r.ok ? r.json() : []).then((devs: { id: string; name: string; isActive: boolean }[]) => setPosDevices(devs.filter(d => d.isActive))).catch(() => {});
  }, []);

  function fetchData() {
    setLoading(true);
    fetch(`/api/kasa?date=${date}`).then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false));
  }

  async function submitNew() {
    if (!form.amount || !form.method) return;
    setSaving(true);
    const payload: Record<string, unknown> = { ...form };
    if (!payload.posId) delete payload.posId;
    await fetch("/api/kasa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    setShowNew(false);
    setForm({ patientId: "", method: "NAKIT", amount: "", description: "", posId: "" });
    setSaving(false);
    fetchData();
  }

  function navDate(offset: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(toInputDate(d));
  }

  const isToday = date === toInputDate(new Date());
  const inp = "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";

  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Kasa</h1>
          <p className="mt-0.5 text-sm text-slate-500">Günlük nakit akışı ve tahsilat takibi</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Tahsilat Ekle
        </button>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <button onClick={() => navDate(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <span className="flex-1 text-center text-sm font-semibold text-slate-700">{displayDate}</span>
        {!isToday && (
          <button onClick={() => navDate(1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
          </button>
        )}
        <button onClick={() => setDate(toInputDate(new Date()))} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isToday ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          Bugün
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-sm text-slate-400">Yükleniyor…</div>}

      {!loading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="grad-green rounded-2xl p-5 text-white">
              <p className="text-xs font-bold uppercase opacity-80">Toplam Tahsilat</p>
              <p className="mt-1 text-xl font-bold">{CURRENCY.format(data.total)}</p>
              <p className="mt-0.5 text-[11px] opacity-70">{data.payments.length} işlem</p>
            </div>
            {(["NAKIT","KREDI_KARTI","HAVALE_EFT"] as PaymentMethod[]).map(m => {
              const cfg = METHOD_CFG[m];
              const val = data.byMethod[m] || 0;
              const pct = data.total > 0 ? Math.round((val / data.total) * 100) : 0;
              return (
                <div key={m} className={`rounded-2xl border p-5 ${cfg.bg} border-transparent`}>
                  <p className={`text-xs font-bold uppercase ${cfg.text} opacity-80`}>{cfg.label}</p>
                  <p className={`mt-1 text-xl font-bold ${cfg.text}`}>{CURRENCY.format(val)}</p>
                  <p className={`mt-0.5 text-[11px] ${cfg.text} opacity-70`}>{pct}% pay</p>
                </div>
              );
            })}
          </div>

          {/* Chart bar */}
          {data.total > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Ödeme Yöntemi Dağılımı</p>
              <div className="flex h-8 w-full overflow-hidden rounded-xl">
                {(["NAKIT","KREDI_KARTI","HAVALE_EFT"] as PaymentMethod[]).map(m => {
                  const pct = data.total > 0 ? (data.byMethod[m] || 0) / data.total * 100 : 0;
                  const colors: Record<string, string> = { NAKIT: "bg-emerald-500", KREDI_KARTI: "bg-blue-500", HAVALE_EFT: "bg-violet-500" };
                  return pct > 0 ? <div key={m} className={`${colors[m]} transition-all`} style={{ width: `${pct}%` }} title={`${METHOD_CFG[m].label}: ${CURRENCY.format(data.byMethod[m] || 0)}`} /> : null;
                })}
              </div>
              <div className="mt-3 flex gap-4">
                {(["NAKIT","KREDI_KARTI","HAVALE_EFT"] as PaymentMethod[]).map(m => {
                  const colors: Record<string, string> = { NAKIT: "bg-emerald-500", KREDI_KARTI: "bg-blue-500", HAVALE_EFT: "bg-violet-500" };
                  return (
                    <div key={m} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${colors[m]}`} />
                      <span className="text-[11px] text-slate-500">{METHOD_CFG[m].label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payments table */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Günün Tahsilatları</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{data.payments.length}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  {["Saat","Hasta","Açıklama","Yöntem","Tutar"].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">Bu tarihte tahsilat kaydı yok</td></tr>
                )}
                {data.payments.map(p => {
                  const cfg = METHOD_CFG[p.method] || METHOD_CFG.NAKIT;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(p.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.patient?.fullName || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{p.description || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">{CURRENCY.format(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {data.payments.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">Toplam</td>
                    <td className="px-4 py-3 text-right text-lg font-black text-slate-900">{CURRENCY.format(data.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {/* New Payment Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-black text-slate-900">Tahsilat Ekle</h2>
              <button onClick={() => setShowNew(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta (isteğe bağlı)</label>
                <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} className={inp + " w-full"}>
                  <option value="">Hasta seçin…</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                <div className="flex gap-2">
                  {(["NAKIT","KREDI_KARTI","HAVALE_EFT"] as PaymentMethod[]).map(m => {
                    const cfg = METHOD_CFG[m];
                    return (
                      <button key={m} onClick={() => setForm(f => ({ ...f, method: m, posId: "" }))} className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${form.method === m ? `${cfg.bg} ${cfg.text} ring-2 ring-offset-1 ring-current` : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {cfg.icon} {cfg.label}
                      </button>
                    );
                  })}
                </div>
                {form.method === "KREDI_KARTI" && posDevices.length > 0 && (
                  <select value={form.posId} onChange={e => setForm(f => ({ ...f, posId: e.target.value }))} className={inp + " w-full mt-2"}>
                    <option value="">— POS Cihazı Seçin —</option>
                    {posDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar (₺) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inp + " w-full text-lg font-bold"} placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp + " w-full"} placeholder="Tedavi türü, fatura no…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={submitNew} disabled={saving} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
