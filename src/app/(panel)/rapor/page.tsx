"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { ConsistencyPayload } from "@/lib/data-consistency";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

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

type DayCloseCheck = { key: string; label: string; status: "ok" | "warning" | "critical"; detail: string; href: string };
type DayClose = {
  income: number; expense: number; net: number;
  cash: number; card: number; transfer: number; mailOrder: number; other: number;
  openLabCount: number; openFollowUpCount: number; overdueInstallments: number;
  unpaidTreatmentPatientCount: number;
  checks: DayCloseCheck[];
};
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
  dayClose: DayClose | null;
  consistency: ConsistencyPayload | null;
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
  dayClose: null, consistency: null,
};

const CUR  = (n: number) => "₺" + (n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT  = (n: number, t: number) => t > 0 ? Math.round((n / t) * 100) : 0;
const FMT  = (n: number) => (n || 0).toLocaleString("tr-TR");
const SIGN = (n: number) => n >= 0 ? `+${CUR(n)}` : CUR(n);

type Tab = "genel" | "giderler" | "islemler";

const STATUS_STYLE: Record<DayCloseCheck["status"], { badge: string; dot: string; label: string }> = {
  ok:       { badge: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500", label: "Tamam" },
  warning:  { badge: "bg-amber-50 border-amber-200 text-amber-700",       dot: "bg-amber-500",   label: "Uyarı" },
  critical: { badge: "bg-red-50 border-red-200 text-red-700",             dot: "bg-red-500",      label: "Kritik" },
};
const STATUS_TONE: Record<DayCloseCheck["status"], BadgeTone> = { ok: "success", warning: "warning", critical: "critical" };


export default function RaporPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const [stats,    setStats]    = useState<Stats>(EMPTY);
  const [loading,  setLoading]  = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab,      setTab]      = useState<Tab>("genel");

  const setQuickRange = (period: "bugun" | "hafta" | "ay" | "yil") => {
    const now = new Date();
    let from: Date;
    if (period === "bugun") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (period === "hafta") {
      const day = now.getDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day;
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0);
    } else if (period === "ay") {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    } else {
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    }
    setFromDate(from.toISOString().slice(0, 16));
    setToDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString().slice(0, 16));
  };

  useEffect(() => {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(from.toISOString().slice(0, 16));
    setToDate(now.toISOString().slice(0, 16));
  }, []);

  const load = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/reports?from=${fromDate}&to=${toDate}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Rapor verileri yüklenemedi.");
      setStats({ ...EMPTY, ...data });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Rapor verileri yüklenemedi.");
    }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (fromDate && toDate) void load(); }, [fromDate, toDate]);

  const dayCloseAlertCount = (stats.dayClose?.checks || []).filter(c => c.status !== "ok").length;
  const consistencyAlertCount = (stats.consistency?.summary.critical || 0) + (stats.consistency?.summary.warning || 0);
  const gunSonuAlertTotal = dayCloseAlertCount + consistencyAlertCount;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "genel",     label: "Genel Bakış & Gün Sonu", badge: gunSonuAlertTotal || undefined },
    { id: "giderler",  label: "Giderler & Vergi" },
    { id: "islemler",  label: "İşlem Analizi" },
  ];

  const maxExp = Math.max(...stats.expenseByCategory.map(e => e.amount), 1);
  const headlineMetrics = [
    { label: "Toplam Ciro",    val: stats.totalRevenue,    cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", isCount: false },
    { label: "Net Kasa",       val: stats.netCash,         cls: stats.netCash >= 0 ? "text-primary" : "text-red-700", bg: "bg-primary/5 border-primary/15", isCount: false },
    { label: "Ödenecek KDV",   val: Math.abs(stats.netVAT), cls: stats.netVAT >= 0 ? "text-amber-700" : "text-green-700", bg: "bg-amber-50 border-amber-100", isCount: false },
    { label: "Gecikmiş Taksit", val: stats.overdueInstallments, cls: "text-violet-700", bg: "bg-violet-50 border-violet-100", isCount: true },
  ];
  // Bu 4 kart, eskiden ayrıca "Diğer özet göstergeler" olarak gösteriliyordu —
  // artık kafa karıştırmasınlar diye ilgili sekmenin başlığında bağlamsal
  // rozet olarak gösteriliyor (bkz. giderMetrics / islemMetrics).
  const giderMetrics = [
    { label: "Lab Maliyeti", val: stats.totalLabCost,  cls: "text-red-600" },
    { label: "Giderler",     val: stats.totalExpenses, cls: "text-orange-700" },
    { label: "Firma Alımı",  val: stats.totalFirmaAlim, cls: "text-purple-700" },
  ];
  const islemMetrics = [
    { label: "Muayene",    val: stats.totalExaminations, cls: "text-slate-800" },
    { label: "Yeni Hasta", val: stats.newPatients,       cls: "text-violet-700" },
  ];

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Raporlar</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">Seçili dönem</span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {/* Hızlı dönem butonları */}
          {([
            { key: "bugun", label: "Bugün" },
            { key: "hafta", label: "Bu Hafta" },
            { key: "ay",    label: "Bu Ay" },
            { key: "yil",   label: "Bu Yıl" },
          ] as const).map(p => (
            <Button key={p.key} variant="secondary" onClick={() => setQuickRange(p.key)}>
              {p.label}
            </Button>
          ))}
          <div className="hidden h-6 w-px bg-slate-200 lg:block" />
          <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="min-w-[190px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 lg:flex-none" />
          <span className="text-slate-400 text-sm">—</span>
          <input type="datetime-local" value={toDate} onChange={e => setToDate(e.target.value)}
            className="min-w-[190px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 lg:flex-none" />
          <Button onClick={load} loading={loading} icon={RefreshCw}>
            Yenile
          </Button>
        </div>
      </div>
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Yeniden Dene
          </Button>
        </div>
      )}

      {/* KPI Özet */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {headlineMetrics.map(c => (
            <article key={c.label} className={`rounded-2xl border p-4 shadow-sm ${c.bg}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`mt-1 text-xl font-black ${c.cls}`}>{c.isCount ? FMT(c.val as number) : CUR(c.val as number)}</p>
            </article>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 flex gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === t.id ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
            {Boolean(t.badge) && (
              <Badge tone="critical" solid={tab === t.id} size="sm">
                {t.badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ── GENEL BAKIŞ & GÜN SONU ──────────────────────────────────────── */}
      {tab === "genel" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Gün sonu kontrol listesi</p>
            <p className="mt-1 text-xs text-slate-500">
              Seçili dönem için kasa, laboratuvar, hasta takip ve taksit tarafında kapanmamış açık kalemleri gösterir.
              Kapanış öncesi tüm kalemlerin &quot;Tamam&quot; olması önerilir.
            </p>
          </div>

          {stats.dayClose ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {stats.dayClose.checks.map(check => {
                  const s = STATUS_STYLE[check.status];
                  return (
                    <div key={check.key} className={`rounded-2xl border p-4 shadow-sm ${s.badge}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                          <span className="text-sm font-bold">{check.label}</span>
                        </div>
                        <Badge tone={STATUS_TONE[check.status]} size="sm">{s.label}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed">{check.detail}</p>
                      <Link href={check.href} className="mt-2 inline-block text-xs font-bold underline underline-offset-2">
                        İncele →
                      </Link>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-bold text-slate-800">Kapanış Özeti</h3>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {[
                    { label: "Nakit",      val: stats.dayClose.cash },
                    { label: "Kredi Kartı", val: stats.dayClose.card },
                    { label: "Havale/EFT", val: stats.dayClose.transfer },
                    { label: "Mail Order", val: stats.dayClose.mailOrder },
                  ].map(r => (
                    <div key={r.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[11px] font-bold uppercase text-slate-500">{r.label}</p>
                      <p className="mt-1 text-sm font-black text-slate-800">{CUR(r.val)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    Tahsil edilmemiş tedavi bakiyesi olan hasta sayısı: <span className="font-bold text-slate-700">{FMT(stats.dayClose.unpaidTreatmentPatientCount)}</span>
                  </span>
                  <span className="text-sm font-black text-slate-800">Net: <span className={stats.dayClose.net >= 0 ? "text-emerald-700" : "text-red-600"}>{CUR(stats.dayClose.net)}</span></span>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-slate-400">Gün sonu verisi yüklenemedi.</p>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Veri Tutarlılığı</h3>
                <p className="mt-0.5 text-xs text-slate-500">Kayıtlar arasında kopan bağlantıları ve düzeltilmesi gereken kalemleri gösterir — aynı kontrol Sistem İzleme sayfasında da yer alır.</p>
                <Link href="/sistem-izleme" className="mt-1 inline-block text-xs font-bold text-primary hover:underline">Sistem İzleme&apos;de detaylı gör →</Link>
              </div>
              {stats.consistency && (
                <Badge
                  tone={stats.consistency.summary.critical > 0 ? "critical" : stats.consistency.summary.warning > 0 ? "warning" : "success"}
                  size="md"
                >
                  Skor: {stats.consistency.summary.score}/100
                </Badge>
              )}
            </div>

            {stats.consistency && stats.consistency.issues.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {stats.consistency.summary.critical > 0 && (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{stats.consistency.summary.critical} kritik</span>
                )}
                {stats.consistency.summary.warning > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{stats.consistency.summary.warning} uyarı</span>
                )}
                {stats.consistency.summary.info > 0 && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{stats.consistency.summary.info} bilgi</span>
                )}
                <span className="text-slate-400">— detaylar için Sistem İzleme&apos;ye bakın.</span>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                <p className="text-sm font-semibold text-emerald-700">Kritik veri bağlantısı sorunu bulunamadı.</p>
              </div>
            )}
          </div>

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
                            <span className="text-xs font-bold text-white">{pct}%</span>
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
        </div>
      )}

      {/* ── GİDERLER & VERGİ ─────────────────────────────────────────────── */}
      {tab === "giderler" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-3">
            {giderMetrics.map(m => (
              <div key={m.label} className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                <p className={`text-sm font-black ${m.cls}`}>{CUR(m.val)}</p>
              </div>
            ))}
          </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Gider Kategorileri</h3>
              <Link href="/muhasebe?tab=gider" className="text-xs font-bold text-primary hover:underline">Tüm Giderleri Gör</Link>
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
              <Link href="/firma" className="text-xs font-bold text-primary hover:underline">Tüm Firmaları Gör</Link>
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
                    <p className="text-xs text-slate-400">{r.desc}</p>
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
                { label: "Yıllık Net Kâr (Tahmin)",   val: stats.annualNetProfit, cls: stats.annualNetProfit >= 0 ? "text-primary" : "text-red-600" },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-600">{r.label}</span>
                  <span className={`font-bold ${r.cls}`}>{SIGN(r.val)}</span>
                </div>
              ))}
              <details className="group pt-2">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-slate-700">
                  <span>2026 Vergi Dilimleri</span>
                  <span className="text-[10px] font-medium text-slate-400 group-open:hidden">Göster</span>
                  <span className="hidden text-[10px] font-medium text-slate-400 group-open:inline">Gizle</span>
                </summary>
                <div className="mt-2 space-y-2">
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
              </details>
              <div className="flex justify-between items-center border-t-2 border-slate-200 pt-3">
                <span className="font-black text-slate-900">Hesaplanan Gelir Vergisi</span>
                <span className="text-xl font-black text-red-700">{CUR(stats.gelirVergisi)}</span>
              </div>
              <p className="text-xs text-slate-400">* Tahmini hesaplama. Resmi vergi beyanı için mali müşavir ile görüşünüz.</p>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ── İŞLEM ANALİZİ ──────────────────────────────────────────────── */}
      {tab === "islemler" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-3">
            {islemMetrics.map(m => (
              <div key={m.label} className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                <p className={`text-sm font-black ${m.cls}`}>{FMT(m.val)}</p>
              </div>
            ))}
          </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">En Çok Yapılan İşlemler</h3>
            {stats.topExaminations.length > 0 ? (
              <div className="space-y-2">
                {stats.topExaminations.map((e, i) => {
                  const pct = PCT(e.count, stats.topExaminations[0]?.count || 1);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-5 text-right text-xs font-bold text-slate-400">{i+1}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-5">
                        <div className="h-5 flex items-center rounded-full bg-primary transition-all" style={{ width: Math.max(8, pct) + "%" }}>
                          {pct > 20 && <span className="pl-2 text-xs font-bold text-white">{e.count}</span>}
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
                      <span className="w-5 text-right text-xs font-bold text-slate-400">{i+1}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-5">
                        <div className="h-5 flex items-center rounded-full bg-accent transition-all" style={{ width: Math.max(8, pct) + "%" }}>
                          {pct > 20 && <span className="pl-2 text-xs font-bold text-white">{t.count}</span>}
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
        </div>
      )}
    </section>
  );
}
