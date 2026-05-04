"use client";

import { useEffect, useState } from "react";

type Doctor = { id: string; fullName: string; role?: string; institutionId?: string };
type FinanceData = { receivable: number; received: number; toReceive: number; totalTreatments: number; earned: number; topExaminations: any[]; topTeeth: any[]; payments: any[]; patientPayments: any[] };

export default function FinansPage() {
  const [staff, setStaff] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDesc, setPaymentDesc] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((s) => {
        const doctors = s.filter((x: Doctor) => x.role === "DOKTOR" || x.role === "YONETICI");
        setStaff(doctors);
      });
    fetch("/api/auth/me").then(r=>r.json()).then(d=>{
      if (d?.role) setUserRole(d.role);
      if (d?.role === "DOKTOR" && d?.id) setSelectedDoctor(d.id);
    }).catch(()=>{});
  }, []);

  const loadFinance = () => {
    if (!selectedDoctor) return;
    setLoading(true);
    const params = new URLSearchParams({ doctorId: selectedDoctor });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    fetch(`/api/finance?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ receivable: 0, received: 0, toReceive: 0, totalTreatments: 0, earned: 0, topExaminations: [], topTeeth: [], payments: [], patientPayments: [] }))
      .finally(() => setLoading(false));
  };

  const handlePayment = async () => {
    if (!selectedDoctor || !paymentAmount) return;
    setPaymentLoading(true);
    setPayError("");
    const res = await fetch("/api/payments", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ doctorId: selectedDoctor, amount: Number(paymentAmount), description: paymentDesc }) });
    setPaymentLoading(false);
    if (res.ok) { setPaymentModal(false); setPaymentAmount(""); setPaymentDesc(""); loadFinance(); }
    else { const d = await res.json(); setPayError(d.error || "Ödeme kaydedilemedi"); }
  };

  return (
    <section className="space-y-5">
      {/* Header + Filtreler */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex-1">
          <h1 className="text-xl font-black text-slate-900">Doktor Finansal Özeti</h1>
          <p className="mt-0.5 text-xs text-slate-500">Doktor bazlı muayene cirosu, tahsilat ve hakediş takibi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {userRole === "DOKTOR" ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {staff.find(s => s.id === selectedDoctor)?.fullName || "Yükleniyor..."}
            </span>
          ) : (
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
            >
              <option value="">Doktor seçin</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          )}
          <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={fromDate} onChange={e => setFromDate(e.target.value)} title="Başlangıç tarihi" />
          <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={toDate} onChange={e => setToDate(e.target.value)} title="Bitiş tarihi" />
          <button onClick={loadFinance} disabled={!selectedDoctor} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50">
            Getir
          </button>
          {userRole === "YONETICI" && selectedDoctor && (
            <button onClick={() => setPaymentModal(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700">
              + Ödeme Yap
            </button>
          )}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-sm text-slate-400">Yükleniyor…</div>}

      {!loading && data && (
        <div className="space-y-5">
          {/* KPI kartları */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Toplam Muayene Cirosu",   val: data.totalTreatments, color: "text-slate-800",   bg: "bg-slate-50",    help: "Seçilen dönemde yapılan tüm muayenelerin toplam tutarı" },
              { label: "Hastalardan Tahsil",        val: data.received,        color: "text-emerald-700", bg: "bg-emerald-50",  help: "Bu doktorun hastalarından tahsil edilen toplam ödeme" },
              { label: "Hastalardan Alacak",        val: data.toReceive,       color: "text-amber-700",  bg: "bg-amber-50",    help: "Hastalardan henüz tahsil edilemeyen kalan bakiye" },
              { label: "Klinikten Alınan Hakediş",  val: data.earned,          color: "text-primary",    bg: "bg-primary/8",   help: "Klinik tarafından doktora yapılan toplam hakediş ödemesi" },
              { label: "Klinik Net Alacağı",        val: data.receivable,      color: "text-violet-700", bg: "bg-violet-50",   help: "Toplam ciro eksi ödenen hakediş: doktorun klinikten kalan alacağı" },
            ].map(c => (
              <article key={c.label} className={"rounded-xl border border-slate-100 bg-white p-4 shadow-sm"} title={c.help}>
                <p className="text-[11px] font-medium text-slate-500">{c.label}</p>
                <p className={"mt-1 text-2xl font-black " + c.color}>₺{(c.val || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0 })}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* En çok yapılan muayeneler */}
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">En Çok Yaptığım 10 Muayene</h3>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left font-bold uppercase text-slate-400 tracking-wide">Muayene Türü</th><th className="px-3 py-2 text-right font-bold uppercase text-slate-400 tracking-wide">Sayı</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data.topExaminations || []).length === 0
                      ? <tr><td colSpan={2} className="py-6 text-center text-slate-400">Veri bulunamadı</td></tr>
                      : (data.topExaminations || []).map((e: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 font-medium text-slate-700">{e.type || "Bilinmiyor"}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{e.count || 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* En çok muayene edilen dişler */}
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">En Çok Muayene Ettiğim 5 Diş</h3>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left font-bold uppercase text-slate-400 tracking-wide">Diş No</th><th className="px-3 py-2 text-right font-bold uppercase text-slate-400 tracking-wide">Sayı</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data.topTeeth || []).length === 0
                      ? <tr><td colSpan={2} className="py-6 text-center text-slate-400">Veri bulunamadı</td></tr>
                      : (data.topTeeth || []).map((t: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 font-medium text-slate-700">Diş #{t.tooth || "?"}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{t.count || 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Kurumun ödemeleri */}
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Kurumun Bana Yaptığı Ödemeler</h3>
              <div className="overflow-auto rounded-lg border border-slate-100" style={{ maxHeight: "240px" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="px-3 py-2.5 text-left font-bold uppercase text-slate-400 tracking-wide">Tarih</th><th className="px-3 py-2.5 text-left font-bold uppercase text-slate-400 tracking-wide">Açıklama</th><th className="px-3 py-2.5 text-right font-bold uppercase text-slate-400 tracking-wide">Tutar</th><th className="px-3 py-2.5 text-left font-bold uppercase text-slate-400 tracking-wide">Durum</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data.payments || []).length === 0
                      ? <tr><td colSpan={4} className="py-6 text-center text-slate-400">Veri bulunamadı</td></tr>
                      : (data.payments || []).map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{new Date(p.date || p.createdAt).toLocaleDateString("tr-TR")}</td>
                          <td className="px-3 py-2.5 text-slate-700">{p.description || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700">₺{(p.amount || 0).toLocaleString("tr-TR")}</td>
                          <td className="px-3 py-2.5"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Ödendi</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hasta ödemeleri */}
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Hasta Ödemeleri</h3>
              <div className="overflow-auto rounded-lg border border-slate-100" style={{ maxHeight: "240px" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="px-3 py-2.5 text-left font-bold uppercase text-slate-400 tracking-wide">Tarih</th><th className="px-3 py-2.5 text-left font-bold uppercase text-slate-400 tracking-wide">Hasta</th><th className="px-3 py-2.5 text-right font-bold uppercase text-slate-400 tracking-wide">Tutar</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data.patientPayments || []).length === 0
                      ? <tr><td colSpan={3} className="py-6 text-center text-slate-400">Veri bulunamadı</td></tr>
                      : (data.patientPayments || []).map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{new Date(p.date || p.createdAt).toLocaleDateString("tr-TR")}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">{p.patientName || p.patient?.fullName || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">₺{(p.amount || 0).toLocaleString("tr-TR")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-black text-slate-900">Ödeme Yap</h3>
            <p className="mb-5 text-xs text-slate-500">Seçili doktora ödeme kaydı oluşturun</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Tutar (₺)</label>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Açıklama</label>
                <input value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ödeme açıklaması" />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={handlePayment} disabled={paymentLoading || !paymentAmount} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                {paymentLoading ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button onClick={() => { setPaymentModal(false); setPayError(""); }} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">İptal</button>
            </div>
            {payError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{payError}</p>}
          </div>
        </div>
      )}
    </section>
  );
}