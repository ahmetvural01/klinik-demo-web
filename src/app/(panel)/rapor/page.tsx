"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Printer } from "lucide-react";
import type { ConsistencyIssue, ConsistencyPayload } from "@/lib/data-consistency";
import { CONSISTENCY_SEVERITY_STYLE } from "@/lib/consistency-ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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

type Tab = "genel" | "gunsonu" | "doktorlar" | "giderler" | "kdv" | "islemler";

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
  const [tab,      setTab]      = useState<Tab>("genel");
  const [printDr,  setPrintDr]  = useState<DoctorReport | null>(null);

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
    try {
      const res = await fetch(`/api/reports?from=${fromDate}&to=${toDate}`);
      const data = await res.json();
      setStats({ ...EMPTY, ...data });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (fromDate && toDate) void load(); }, [fromDate, toDate]);

  const dayCloseAlertCount = (stats.dayClose?.checks || []).filter(c => c.status !== "ok").length;
  const consistencyAlertCount = (stats.consistency?.summary.critical || 0) + (stats.consistency?.summary.warning || 0);
  const gunSonuAlertTotal = dayCloseAlertCount + consistencyAlertCount;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "genel",     label: "Genel Bakış" },
    { id: "gunsonu",   label: "Gün Sonu & Kontrol", badge: gunSonuAlertTotal || undefined },
    { id: "doktorlar", label: "Doktor Hakediş" },
    { id: "giderler",  label: "Giderler & Alımlar" },
    { id: "kdv",       label: "KDV & Vergi" },
    { id: "islemler",  label: "İşlem Analizi" },
  ];

  const maxDr  = Math.max(...stats.doctorReports.map(d => d.ciro), 1);
  const maxExp = Math.max(...stats.expenseByCategory.map(e => e.amount), 1);
  const headlineMetrics = [
    { label: "Toplam Ciro",    val: stats.totalRevenue,    cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", isCount: false },
    { label: "Net Kasa",       val: stats.netCash,         cls: stats.netCash >= 0 ? "text-primary" : "text-red-700", bg: "bg-primary/5 border-primary/15", isCount: false },
    { label: "Ödenecek KDV",   val: Math.abs(stats.netVAT), cls: stats.netVAT >= 0 ? "text-amber-700" : "text-green-700", bg: "bg-amber-50 border-amber-100", isCount: false },
    { label: "Gecikmiş Taksit", val: stats.overdueInstallments, cls: "text-violet-700", bg: "bg-violet-50 border-violet-100", isCount: true },
  ];
  const detailMetrics = [
    { label: "Lab Maliyeti",   val: stats.totalLabCost,    cls: "text-red-600",     bg: "bg-red-50 border-red-100", isCount: false },
    { label: "Giderler",       val: stats.totalExpenses,   cls: "text-orange-700",  bg: "bg-orange-50 border-orange-100", isCount: false },
    { label: "Firma Alımı",    val: stats.totalFirmaAlim,  cls: "text-purple-700",  bg: "bg-purple-50 border-purple-100", isCount: false },
    { label: "Muayene",        val: stats.totalExaminations, cls: "text-slate-800", bg: "bg-slate-50 border-slate-100", isCount: true },
    { label: "Yeni Hasta",     val: stats.newPatients,     cls: "text-violet-700",  bg: "bg-violet-50 border-violet-100", isCount: true },
  ];

  return (
    <>
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
        <details className="group rounded-2xl border border-slate-100 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
            <span>Diğer özet göstergeler</span>
            <span className="text-xs font-medium text-slate-400 group-open:hidden">Aç</span>
            <span className="hidden text-xs font-medium text-slate-400 group-open:inline">Kapat</span>
          </summary>
          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
            {detailMetrics.map(c => (
              <article key={c.label} className={`rounded-2xl border p-4 ${c.bg}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
                <p className={`mt-1 text-lg font-black ${c.cls}`}>{c.isCount ? FMT(c.val as number) : CUR(c.val as number)}</p>
              </article>
            ))}
          </div>
        </details>
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
      )}

      {/* ── GÜN SONU & VERİ KONTROLÜ ──────────────────────────────────── */}
      {tab === "gunsonu" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Gün sonu kontrol listesi</p>
            <p className="mt-1 text-xs text-slate-500">
              Seçili dönem için kasa, laboratuvar, hasta takip ve taksit tarafında kapanmamış açık kalemleri gösterir.
              Kapanış öncesi tüm kalemlerin "Tamam" olması önerilir.
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
                <p className="mt-0.5 text-xs text-slate-500">Kayıtlar arasında kopan bağlantıları ve düzeltilmesi gereken kalemleri gösterir.</p>
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
              <div className="space-y-2.5">
                {stats.consistency.issues.map(issue => {
                  const s = CONSISTENCY_SEVERITY_STYLE[issue.severity];
                  return (
                    <div key={issue.id} className={`rounded-xl border p-3.5 ${s.badge}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                          <span className="text-xs font-black uppercase tracking-wide">{s.label}</span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-semibold text-slate-500">{issue.area}</span>
                        </div>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-black">{issue.count} kayıt</span>
                      </div>
                      <p className="mt-1.5 text-sm font-bold">{issue.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed">{issue.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs italic">{issue.action}</span>
                        {issue.href && (
                          <Link href={issue.href} className="text-xs font-bold underline underline-offset-2">
                            İlgili ekrana git →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                <p className="text-sm font-semibold text-emerald-700">Kritik veri bağlantısı sorunu bulunamadı.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DOKTOR HAKEDİŞ ──────────────────────────────────────────────── */}
      {tab === "doktorlar" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-sm font-bold text-amber-800">Hakediş modeli</p>
            <p className="mt-1 text-xs text-amber-700">
              Cirodan kart masrafı, lab ve genel giderler düşülür; kalan brüt tutar maaş oranıyla hakedişe çevrilir.
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Oranları <Link href="/personel" className="font-bold underline">Personel</Link> üzerinden güncelleyebilirsiniz.
            </p>
          </div>

          {stats.doctorReports.length > 0 ? (
            <>
              {/* Özet tablo */}
              <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-700">Dönem: {fromDate?.slice(0,10)} — {toDate?.slice(0,10)}</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Printer}
                    onClick={() => {
                      const win = window.open("", "_blank");
                      if (!win) return;
                      const rows = stats.doctorReports.map(dr => `
                        <tr>
                          <td>${dr.fullName}</td>
                          <td class="r">${dr.ciro.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${dr.kkMasraf.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${dr.labCost.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${dr.genelMasraf.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${dr.toplamGider.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${dr.brut.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">%${dr.maasYuzde}</td>
                          <td class="r bold">${dr.hakEdis.toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                        </tr>`).join("");
                      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Doktor Hakediş Raporu</title>
                        <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h2{margin-bottom:4px}p.sub{color:#666;font-size:10px;margin-bottom:16px}
                        table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:5px 8px}th{background:#f5f5f5;font-weight:bold}
                        .r{text-align:right}.bold{font-weight:bold}tfoot td{background:#f0f0f0;font-weight:bold}
                        @media print{.no-print{display:none}}</style></head><body>
                        <h2>Doktor Hakediş Raporu</h2>
                        <p class="sub">Dönem: ${fromDate?.slice(0,10)} — ${toDate?.slice(0,10)}</p>
                        <table><thead><tr>
                          <th>Doktor</th><th>Ciro (₺)</th><th>KK Masraf</th><th>Lab</th><th>Genel Masraf</th><th>Toplam Gider</th><th>Brüt</th><th>Maaş%</th><th>Hakediş (₺)</th>
                        </tr></thead><tbody>${rows}</tbody>
                        <tfoot><tr>
                          <td>TOPLAM</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.ciro,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.kkMasraf,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.labCost,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.genelMasraf,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.toplamGider,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td class="r">${stats.doctorReports.reduce((s,d)=>s+d.brut,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                          <td></td>
                          <td class="r bold">${stats.doctorReports.reduce((s,d)=>s+d.hakEdis,0).toLocaleString("tr-TR", {minimumFractionDigits:2})}</td>
                        </tr></tfoot></table>
                        <script>window.onload=()=>window.print()<\/script></body></html>`);
                      win.document.close();
                    }}
                  >
                    PDF / Yazdır
                  </Button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Doktor","Ciro","KK Masraf","Lab","Genel Masraf","Toplam Gider","Brüt","Maaş%","Hakediş",""].map(h => (
                        <th key={h} className={`px-3 py-2.5 font-bold text-slate-500 uppercase ${h==="Doktor"||h===""?"text-left":"text-right"}`}>{h}</th>
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
                              <p className="text-xs text-slate-400">KK: %{dr.kkYuzde} · Genel: %{dr.genelYuzde}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-semibold">{CUR(dr.ciro)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">{CUR(dr.kkMasraf)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-500">{CUR(dr.labCost)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">{CUR(dr.genelMasraf)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-600 font-semibold">{CUR(dr.toplamGider)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-primary font-semibold">{CUR(dr.brut)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">%{dr.maasYuzde}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-black text-sm ${dr.hakEdis >= 0 ? "text-emerald-700" : "text-red-600"}`}>{CUR(dr.hakEdis)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Button variant="secondary" size="sm" onClick={() => setPrintDr(dr)}>
                            Doktor Detayı
                          </Button>
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
                      <td className="px-3 py-2.5" />
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
                            {" → "}Hakediş: <span className="font-bold text-primary">{CUR(dr.hakEdis)}</span>
                            {" "}({Math.round((dr.toplamGider / (dr.ciro || 1)) * 100)}% gider)
                          </span>
                        </div>
                        <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">
                          <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-emerald-400/50 transition-all"
                            style={{ width: Math.max(4, pctCiro) + "%" }} />
                          <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-primary transition-all"
                            style={{ width: Math.max(2, Math.round(pctCiro * pctHakedis / 100)) + "%" }}>
                            {pctHakedis > 30 && <span className="pl-2 text-xs font-bold text-white">%{pctHakedis}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
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
              <Link href="/muhasebe?tab=gider" className="text-xs font-bold text-primary hover:underline">Tümünü Aç</Link>
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
              <Link href="/firma" className="text-xs font-bold text-primary hover:underline">Tümünü Aç</Link>
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
              <p className="text-xs text-slate-400">* Tahmini hesaplama. Resmi vergi beyanı için mali müşavir ile görüşünüz.</p>
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
      )}
    </section>

      {/* ── DOKTOR DETAY MODAL ───────────────────────────────────────── */}
      {printDr && (
        <Modal
          open={Boolean(printDr)}
          onClose={() => setPrintDr(null)}
          title={printDr.fullName}
          description={`Dönem: ${fromDate?.slice(0,10)} — ${toDate?.slice(0,10)}`}
          footer={
            <>
              <Button
                variant="primary"
                size="sm"
                icon={Printer}
                onClick={() => {
                  const dr = printDr;
                  const win = window.open("", "_blank");
                  if (!win) return;
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
                  <title>${dr.fullName} - Hakediş Raporu</title>
                  <style>
                    body{font-family:Arial,sans-serif;font-size:12px;margin:30px;color:#222}
                    h2{margin:0 0 4px;font-size:18px} p.sub{color:#666;margin:0 0 20px;font-size:11px}
                    table{width:100%;border-collapse:collapse;margin-top:10px}
                    th,td{border:1px solid #ccc;padding:7px 10px} th{background:#f0f0f0}
                    .r{text-align:right} .gr{color:#16a34a;font-weight:bold} .rd{color:#dc2626}
                    .info{background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;margin-bottom:16px}
                    .info-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9}
                  </style></head><body>
                  <h2>${dr.fullName} — Hakediş Raporu</h2>
                  <p class="sub">Dönem: ${fromDate?.slice(0,10)} — ${toDate?.slice(0,10)}</p>
                  <div class="info">
                    <div class="info-row"><span>Komisyon Oranları</span><span>KK: %${dr.kkYuzde} · Genel: %${dr.genelYuzde} · Maaş: %${dr.maasYuzde}</span></div>
                    <div class="info-row"><span>Muayene Sayısı</span><span>${dr.examinationCount}</span></div>
                    <div class="info-row"><span>Benzersiz Hasta</span><span>${dr.uniquePatients}</span></div>
                  </div>
                  <table>
                    <tbody>
                      <tr><th style="text-align:left">Toplam Ciro</th><td class="r gr">₺${dr.ciro.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><td>— KK Masrafı (KK × %${dr.kkYuzde})</td><td class="r rd">₺${dr.kkMasraf.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><td>— Lab Maliyeti</td><td class="r rd">₺${dr.labCost.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><td>— Genel Masraf (Ciro × %${dr.genelYuzde})</td><td class="r rd">₺${dr.genelMasraf.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><th style="text-align:left">Toplam Gider</th><td class="r rd">₺${dr.toplamGider.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><th style="text-align:left">Brüt (Ciro − Gider)</th><td class="r" style="color:#1d4ed8">₺${dr.brut.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                      <tr><th style="text-align:left;font-size:14px">HAKEDİŞ (Brüt × %${dr.maasYuzde})</th>
                        <td class="r ${dr.hakEdis>=0?"gr":"rd"}" style="font-size:16px">₺${dr.hakEdis.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td></tr>
                    </tbody>
                  </table>
                  <script>window.onload=()=>window.print()<\/script></body></html>`);
                  win.document.close();
                }}
              >
                PDF / Yazdır
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPrintDr(null)}>Kapat</Button>
            </>
          }
        >
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center rounded-lg bg-slate-50 px-4 py-2 text-xs">
              <span className="text-slate-500">Komisyon Oranları</span>
              <span className="font-semibold text-slate-700">KK: %{printDr.kkYuzde} · Genel: %{printDr.genelYuzde} · Maaş: %{printDr.maasYuzde}</span>
            </div>
            <div className="flex justify-between items-center rounded-lg bg-slate-50 px-4 py-2 text-xs">
              <span className="text-slate-500">Muayene / Hasta</span>
              <span className="font-semibold text-slate-700">{printDr.examinationCount} işlem · {printDr.uniquePatients} hasta</span>
            </div>

            {/* Hesap özeti */}
            <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
              {[
                { label: "Toplam Ciro",                    val: printDr.ciro,        cls: "text-emerald-700 font-black text-base" },
                { label: `KK Masrafı (KK × %${printDr.kkYuzde})`,  val: -printDr.kkMasraf,   cls: "text-red-600" },
                { label: "Lab Maliyeti",                   val: -printDr.labCost,    cls: "text-red-600" },
                { label: `Genel Masraf (Ciro × %${printDr.genelYuzde})`, val: -printDr.genelMasraf, cls: "text-red-600" },
                { label: "Toplam Gider",                   val: -printDr.toplamGider, cls: "text-red-700 font-semibold" },
                { label: "Brüt (Ciro − Gider)",            val: printDr.brut,        cls: "text-primary font-semibold" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center px-4 py-2 text-xs">
                  <span className="text-slate-600">{r.label}</span>
                  <span className={r.cls}>{r.val < 0 ? "−" : ""}{CUR(Math.abs(r.val))}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3 bg-emerald-50 rounded-b-lg">
                <span className="text-sm font-black text-slate-800">HAKEDİŞ (Brüt × %{printDr.maasYuzde})</span>
                <span className={`text-xl font-black ${printDr.hakEdis >= 0 ? "text-emerald-700" : "text-red-600"}`}>{CUR(printDr.hakEdis)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
