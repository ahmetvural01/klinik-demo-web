"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DoctorReport = {
  id: string; fullName: string;
  examinationCount: number;
  ciro: number; kk: number; nakit: number; havale: number; mo: number;
  kkMasraf: number; labCost: number; genelMasraf: number; toplamGider: number;
  brut: number; hakEdis: number;
  kkYuzde: number; genelYuzde: number; maasYuzde: number;
  labOrderCount: number; uniquePatients: number;
};
type ExpenseCat = { category: string; amount: number };
type FirmaRow   = { name: string; amount: number };
type TopExam    = { treatmentName: string; count: number };
type TopTooth   = { tooth: string; count: number };

type Stats = {
  total: number; totalRevenue: number; totalExpenses: number;
  totalLabCost: number; totalFirmaAlim: number; netCash: number;
  newPatients: number; totalExaminations: number;
  cash: number; card: number; transfer: number; mailOrder: number; other: number;
  doctorReports: DoctorReport[];
  expenseByCategory: ExpenseCat[];
  firmaByName: FirmaRow[];
  topExaminations: TopExam[];
  topTeeth: TopTooth[];
  totalLabOrders: number; overdueInstallments: number;
  outputVAT: number; inputVAT: number; netVAT: number;
  periodNetProfit: number; annualNetProfit: number; gelirVergisi: number;
};

const EMPTY: Stats = {
  total: 0, totalRevenue: 0, totalExpenses: 0, totalLabCost: 0, totalFirmaAlim: 0,
  netCash: 0, newPatients: 0, totalExaminations: 0,
  cash: 0, card: 0, transfer: 0, mailOrder: 0, other: 0,
  doctorReports: [], expenseByCategory: [], firmaByName: [],
  topExaminations: [], topTeeth: [],
  totalLabOrders: 0, overdueInstallments: 0,
  outputVAT: 0, inputVAT: 0, netVAT: 0,
  periodNetProfit: 0, annualNetProfit: 0, gelirVergisi: 0,
};

const CUR  = (n: number) => "₺" + (n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT  = (n: number, t: number) => t > 0 ? Math.round((n / t) * 100) : 0;
const FMT  = (n: number) => (n || 0).toLocaleString("tr-TR");
const SIGN = (n: number) => n >= 0 ? `+${CUR(n)}` : CUR(n);

type Tab = "genel" | "doktorlar" | "giderler" | "kdv" | "islemler";

export default function RaporPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const [stats,    setStats]    = useState<Stats>(EMPTY);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState<Tab>("genel");

  useEffect(() => {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(from.toISOString().slice(0, 16));
    setToDate(now.toISOString().slice(0, 16));
  }, []);

  const load = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?from=${fromDate}&to=${toDate}`);
      const data = await res.json();
      setStats({ ...EMPTY, ...data });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (fromDate && toDate) void load(); }, [fromDate, toDate]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "genel",     label: "Genel Bakış" },
    { id: "doktorlar", label: "Doktor Hakediş" },
    { id: "giderler",  label: "Giderler & Alımlar" },
    { id: "kdv",       label: "KDV & Vergi" },
    { id: "islemler",  label: "İşlem Analizi" },
  ];

  const maxDr  = Math.max(...stats.doctorReports.map(d => d.ciro), 1);
  const maxExp = Math.max(...stats.expenseByCategory.map(e => e.amount), 1);

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-slate-900">Yönetim Raporları</h1>
          <p className="mt-0.5 text-xs text-slate-500">Hakediş hesabı · KDV özeti · Gelir vergisi tahmini · Doktor bazlı tam döküm</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <span className="text-slate-400 text-sm">—</span>
          <input type="datetime-local" value={toDate} onChange={e => setToDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50">
            {loading
              ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2a10 10 0 0110 10"/></svg>
              : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>}
            Yenile
          </button>
        </div>
      </div>

      {/* KPI Özet */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Toplam Ciro",    val: stats.totalRevenue,    cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
          { label: "Lab Maliyeti",   val: stats.totalLabCost,    cls: "text-red-600",     bg: "bg-red-50 border-red-100" },
          { label: "Giderler",       val: stats.totalExpenses,   cls: "text-orange-700",  bg: "bg-orange-50 border-orange-100" },
          { label: "Firma Alımı",    val: stats.totalFirmaAlim,  cls: "text-purple-700",  bg: "bg-purple-50 border-purple-100" },
          { label: "Net Kasa",       val: stats.netCash,         cls: stats.netCash >= 0 ? "text-blue-700" : "text-red-700", bg: "bg-blue-50 border-blue-100" },
          { label: "Muayene",        val: stats.totalExaminations, cls: "text-slate-800", bg: "bg-slate-50 border-slate-100", isCount: true },
          { label: "Yeni Hasta",     val: stats.newPatients,     cls: "text-violet-700",  bg: "bg-violet-50 border-violet-100", isCount: true },
          { label: "Ödenecek KDV",   val: stats.netVAT,          cls: stats.netVAT >= 0 ? "text-amber-700" : "text-green-700", bg: "bg-amber-50 border-amber-100" },
        ].map(c => (
          <article key={c.label} className={`rounded-xl border p-3 shadow-sm ${c.bg}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={`mt-1 text-lg font-black ${c.cls}`}>
              {c.isCount ? FMT(c.val as number) : CUR(c.val as number)}
            </p>
          </article>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-100 bg-white p-1 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GENEL BAKIŞ ───────────────────────────────────────────────── */}
      {tab === "genel" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">Ödeme Yöntemi Dağılımı</h3>
            {stats.totalRevenue > 0 ? (
              <div className="space-y-3">
                {[
                  { label: "Nakit",       val: stats.cash,      color: "bg-emerald-500" },
                  { label: "Kredi Kartı", val: stats.card,      color: "bg-blue-500" },
                  { label: "Havale/EFT",  val: stats.transfer,  color: "bg-violet-500" },
                  { label: "Mail Order",  val: stats.mailOrder, color: "bg-cyan-500" },
                  { label: "Diğer",       val: stats.other,     color: "bg-amber-500" },
                ].filter(i => i.val > 0).map(item => {
                  const pct = PCT(item.val, stats.totalRevenue);
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-slate-600">{item.label}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-5">
                        <div className={`h-5 flex items-center justify-end pr-2 rounded-full ${item.color} transition-all`}
                          style={{ width: Math.max(8, pct) + "%" }}>
                          <span className="text-[10px] font-bold text-white">{pct}%</span>
                        </div>
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs font-bold text-slate-800">{CUR(item.val)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">Seçili dönemde ödeme verisi yok</p>}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">Net Kasa Hesabı</h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: "+ Toplam Ciro",      val: stats.totalRevenue,   cls: "text-emerald-700" },
                { label: "− Giderler",         val: stats.totalExpenses,  cls: "text-orange-700" },
                { label: "− Firma / Tedarik",  val: stats.totalFirmaAlim, cls: "text-purple-700" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-slate-600">{r.label}</span>
                  <span className={`font-bold ${r.cls}`}>{CUR(r.val)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-slate-800">= Net Kasa</span>
                <span className={`text-xl font-black ${stats.netCash >= 0 ? "text-emerald-700" : "text-red-600"}`}>{CUR(stats.netCash)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700">Not: Lab maliyeti doktor hakedişi hesabında ayrıca düşülür; kasa hesabında firma alımlarına dahildir.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── DOKTOR HAKEDİŞ ──────────────────────────────────────────────── */}
      {tab === "doktorlar" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-800">Hakediş Hesaplama Formülü</p>
            <p className="mt-1 text-xs text-amber-700">
              Toplam Ciro → KK Masrafı (KK × KK%) + Lab Masrafı + Genel Masraf (Ciro × Genel%) = Toplam Gider → Brüt = Ciro − Gider → <strong>Hakediş = Brüt × Maaş%</strong>
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Doktor yüzdelerini <Link href="/personel" className="underline font-bold">Personel sayfasından</Link> ayarlayabilirsiniz.
            </p>
          </div>

          {stats.doctorReports.length > 0 ? (
            <>
              {/* Özet tablo */}
              <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Doktor","Ciro","KK Masraf","Lab","Genel Masraf","Toplam Gider","Brüt","Maaş%","Hakediş"].map(h => (
                        <th key={h} className={`px-3 py-2.5 font-bold text-slate-500 uppercase ${h==="Doktor"?"text-left":"text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {stats.doctorReports.map(dr => (
                      <tr key={dr.id} className="hover:bg-slate-50 transition">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                              {dr.fullName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-xs">{dr.fullName}</p>
                              <p className="text-[10px] text-slate-400">KK:{dr.kkYuzde}% Genel:{dr.genelYuzde}%</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-semibold">{CUR(dr.ciro)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">{CUR(dr.kkMasraf)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-500">{CUR(dr.labCost)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">{CUR(dr.genelMasraf)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-600 font-semibold">{CUR(dr.toplamGider)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-700 font-semibold">{CUR(dr.brut)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">%{dr.maasYuzde}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-black text-sm ${dr.hakEdis >= 0 ? "text-emerald-700" : "text-red-600"}`}>{CUR(dr.hakEdis)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-700">TOPLAM</td>
                      {[
                        stats.doctorReports.reduce((s,d)=>s+d.ciro,0),
                        stats.doctorReports.reduce((s,d)=>s+d.kkMasraf,0),
                        stats.doctorReports.reduce((s,d)=>s+d.labCost,0),
                        stats.doctorReports.reduce((s,d)=>s+d.genelMasraf,0),
                        stats.doctorReports.reduce((s,d)=>s+d.toplamGider,0),
                        stats.doctorReports.reduce((s,d)=>s+d.brut,0),
                      ].map((v,i) => <td key={i} className="px-3 py-2.5 text-right text-xs font-bold">{CUR(v)}</td>)}
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-right text-sm font-black text-emerald-700">{CUR(stats.doctorReports.reduce((s,d)=>s+d.hakEdis,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Görsel hakediş karşılaştırma */}
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-bold text-slate-800">Doktor Ciro & Hakediş Karşılaştırması</h3>
                <div className="space-y-4">
                  {stats.doctorReports.map(dr => {
                    const pctCiro   = PCT(dr.ciro,    maxDr);
                    const pctHakedis = PCT(dr.hakEdis, dr.ciro > 0 ? dr.ciro : 1);
                    return (
                      <div key={dr.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">{dr.fullName}</span>
                          <span className="text-slate-500">
                            Ciro: <span className="font-bold text-emerald-700">{CUR(dr.ciro)}</span>
                            {" → "}Hakediş: <span className="font-bold text-blue-700">{CUR(dr.hakEdis)}</span>
                            {" "}({Math.round((dr.toplamGider / (dr.ciro || 1)) * 100)}% gider)
                          </span>
                        </div>
                        <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">
                          <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-emerald-400/50 transition-all"
                            style={{ width: Math.max(4, pctCiro) + "%" }} />
                          <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-blue-600 transition-all"
                            style={{ width: Math.max(2, Math.round(pctCiro * pctHakedis / 100)) + "%" }}>
                            {pctHakedis > 30 && <span className="pl-2 text-[10px] text-white font-bold">%{pctHakedis}</span>}
                          </div>
                        </div>
                        <div className="flex gap-4 text-[10px] text-slate-500">
                          <span>KK: {CUR(dr.kkMasraf)}</span>
                          <span>Lab: {CUR(dr.labCost)}</span>
                          <span>Genel: {CUR(dr.genelMasraf)}</span>
                          <span>Muayene: {FMT(dr.examinationCount)} · Hasta: {FMT(dr.uniquePatients)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <p className="text-sm text-slate-400">Seçili dönemde doktor verisi bulunamadı</p>
            </div>
          )}
        </div>
      )}

      {/* ── GİDERLER & ALIMLAR ──────────────────────────────────────────── */}
      {tab === "giderler" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Gider Kategorileri</h3>
              <Link href="/muhasebe?tab=gider" className="text-xs text-primary hover:underline">Tümü →</Link>
            </div>
            {stats.expenseByCategory.length > 0 ? (
              <div className="space-y-3">
                {stats.expenseByCategory.map(e => {
                  const pct = PCT(e.amount, maxExp);
                  return (
                    <div key={e.category} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-slate-600 truncate">{e.category}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-4">
                        <div className="h-4 rounded-full bg-orange-400 transition-all" style={{ width: Math.max(4, pct) + "%" }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs font-bold">{CUR(e.amount)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-xs font-bold">Toplam Gider</span>
                  <span className="text-sm font-black text-orange-700">{CUR(stats.totalExpenses)}</span>
                </div>
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">Gider kaydı yok</p>}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Firma / Tedarikçi Alımları</h3>
              <Link href="/firma" className="text-xs text-primary hover:underline">Tümü →</Link>
            </div>
            {stats.firmaByName && stats.firmaByName.length > 0 ? (
              <div className="space-y-2.5">
                {stats.firmaByName.map(f => {
                  const pct = PCT(f.amount, stats.totalFirmaAlim || 1);
                  return (
                    <div key={f.name} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-slate-600 truncate">{f.name}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-4">
                        <div className="h-4 rounded-full bg-purple-400 transition-all" style={{ width: Math.max(4, pct) + "%" }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs font-bold">{CUR(f.amount)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-xs font-bold">Toplam Alım</span>
                  <span className="text-sm font-black text-purple-700">{CUR(stats.totalFirmaAlim)}</span>
                </div>
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">Firma alım kaydı yok</p>}
          </div>
        </div>
      )}

      {/* ── KDV & VERGİ ─────────────────────────────────────────────────── */}
      {tab === "kdv" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">KDV Özeti (Dönem)</h3>
            <div className="space-y-3 text-sm">
              {[
                { label: "Çıkan KDV (Tahsil Edilen)",  val: stats.outputVAT,  sign: "+", cls: "text-emerald-700", desc: "Gelirden %10 KDV" },
                { label: "Girdi KDV (Ödenen)",          val: stats.inputVAT,   sign: "−", cls: "text-red-600",    desc: "Gider + alım faturalarından" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-start py-2 border-b border-slate-50">
                  <div>
                    <span className="text-slate-700">{r.sign} {r.label}</span>
                    <p className="text-[10px] text-slate-400">{r.desc}</p>
                  </div>
                  <span className={`font-bold ${r.cls}`}>{CUR(r.val)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <div>
                  <span className="font-black text-slate-800">= {stats.netVAT >= 0 ? "Ödenecek KDV" : "Devreden KDV (Sonraki Dönem)"}</span>
                </div>
                <span className={`text-xl font-black ${stats.netVAT >= 0 ? "text-red-600" : "text-green-600"}`}>{CUR(Math.abs(stats.netVAT))}</span>
              </div>
              {stats.netVAT < 0 && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <p className="text-xs text-green-700">Girdi KDV &gt; Çıkan KDV: Bu dönem ödemeniz gereken KDV yoktur, fazla kısım sonraki döneme devredilir.</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">Gelir Vergisi Tahmini (2026)</h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: "Dönem Net Kâr (KDV hariç)", val: stats.periodNetProfit, cls: stats.periodNetProfit >= 0 ? "text-emerald-700" : "text-red-600" },
                { label: "Yıllık Net Kâr (Tahmin)",   val: stats.annualNetProfit, cls: stats.annualNetProfit >= 0 ? "text-blue-700" : "text-red-600" },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-600">{r.label}</span>
                  <span className={`font-bold ${r.cls}`}>{SIGN(r.val)}</span>
                </div>
              ))}
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold text-slate-700">2026 Vergi Dilimleri:</p>
                {[
                  ["0 – 190.000 TL",        "% 15"],
                  ["190.001 – 400.000 TL",  "% 20"],
                  ["400.001 – 1.500.000 TL","% 27"],
                  ["1.500.001 – 5.300.000 TL","% 35"],
                  ["5.300.001 TL üzeri",    "% 40"],
                ].map(([label, rate]) => (
                  <div key={label} className="flex justify-between text-xs text-slate-500">
                    <span>{label}</span><span className="font-semibold">{rate}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center border-t-2 border-slate-200 pt-3">
                <span className="font-black text-slate-900">Hesaplanan Gelir Vergisi</span>
                <span className="text-xl font-black text-red-700">{CUR(stats.gelirVergisi)}</span>
              </div>
              <p className="text-[10px] text-slate-400">* Tahmini hesaplama. Resmi vergi beyanı için mali müşavir ile görüşünüz.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── İŞLEM ANALİZİ ──────────────────────────────────────────────── */}
      {tab === "islemler" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">En Çok Yapılan İşlemler</h3>
            {stats.topExaminations.length > 0 ? (
              <div className="space-y-2">
                {stats.topExaminations.map((e, i) => {
                  const pct = PCT(e.count, stats.topExaminations[0]?.count || 1);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-5 text-right text-[10px] font-bold text-slate-400">{i+1}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-5">
                        <div className="h-5 flex items-center rounded-full bg-primary transition-all" style={{ width: Math.max(8, pct) + "%" }}>
                          {pct > 20 && <span className="pl-2 text-[10px] font-bold text-white">{e.count}</span>}
                        </div>
                      </div>
                      <span className="w-7 text-right text-xs font-bold">{e.count}</span>
                      <span className="w-36 truncate text-xs text-slate-600">{e.treatmentName}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">Veri yok</p>}
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">En Çok İşlem Gören Dişler</h3>
            {stats.topTeeth.length > 0 ? (
              <div className="space-y-2">
                {stats.topTeeth.map((t, i) => {
                  const pct = PCT(t.count, stats.topTeeth[0]?.count || 1);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-5 text-right text-[10px] font-bold text-slate-400">{i+1}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-5">
                        <div className="h-5 flex items-center rounded-full bg-accent transition-all" style={{ width: Math.max(8, pct) + "%" }}>
                          {pct > 20 && <span className="pl-2 text-[10px] font-bold text-white">{t.count}</span>}
                        </div>
                      </div>
                      <span className="w-7 text-right text-xs font-bold">{t.count}</span>
                      <span className="font-mono text-xs text-slate-700">Diş #{t.tooth}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">Veri yok</p>}
          </div>
        </div>
      )}
    </section>
  );
}
