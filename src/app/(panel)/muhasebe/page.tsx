"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type Payment = {
  id: string; createdAt: string; amount: number; method: string;
  description?: string | null;
  patient?: { id: string; fullName: string } | null;
};
type Expense = {
  id: string; tarih: string; category: string; description?: string | null;
  tutar: number; yontem?: string | null;
};
type FirmaData = { id: string; name: string; phone?: string; borc: number; odenen: number; bakiye: number };
type TaksitItem = { id: string; siraNo: number; vadeDate: string; tutar: number; kalan: number; status: string };
type TaksitPlan = {
  id: string; baslik?: string | null; toplamBorc: number; pesnat: number; status: string;
  patient?: { id: string; fullName: string; phone?: string } | null;
  doctor?: { id: string; fullName: string } | null;
  taksitler: TaksitItem[];
};
type StockItem = { id: string; name: string; quantity: number; minQuantity: number; unitPrice?: number | null; supplier?: string | null };
type Doctor = { id: string; fullName: string; role: string };

// ── Formatters ─────────────────────────────────────────────────────────────
const MONEY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const fmtMoney = (n: number | string | null | undefined) => MONEY.format(Number(n) || 0);
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; } };

const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order", DIGER: "Diğer",
};

const TABS = [
  { id: "genel",       label: "Genel Durum" },
  { id: "tahsilatlar", label: "Tahsilatlar" },
  { id: "giderler",    label: "Giderler" },
  { id: "cari",        label: "Cari Borçlar" },
  { id: "kasa",        label: "Kasa / Banka" },
  { id: "taksit",      label: "Taksit / Alacak" },
  { id: "hakediş",     label: "Doktor Hakedişleri" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function MuhasebePage() {
  const [activeTab, setActiveTab] = useState<TabId>("genel");

  // Summary state
  const [loading, setLoading] = useState(true);
  const [kasaToday, setKasaToday] = useState<{ total: number; byMethod: Record<string, number>; payments: Payment[] }>({ total: 0, byMethod: {}, payments: [] });
  const [expenseToday, setExpenseToday] = useState<{ total: number; expenses: Expense[] }>({ total: 0, expenses: [] });
  const [expenseMonth, setExpenseMonth] = useState<{ total: number; expenses: Expense[] }>({ total: 0, expenses: [] });
  const [firmas, setFirmas] = useState<FirmaData[]>([]);
  const [plans, setPlans] = useState<TaksitPlan[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // Tab-specific state
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [doctorFinance, setDoctorFinance] = useState<Record<string, unknown> | null>(null);
  const [doctorFinanceLoading, setDoctorFinanceLoading] = useState(false);

  // Filters
  const [paymentSearch, setPaymentSearch]     = useState("");
  const [paymentDateFrom, setPaymentDateFrom] = useState("");
  const [paymentDateTo, setPaymentDateTo]     = useState("");
  const [expenseSearch, setExpenseSearch]     = useState("");
  const [expenseDateFrom, setExpenseDateFrom] = useState("");
  const [expenseDateTo, setExpenseDateTo]     = useState("");
  const [taksitFilter, setTaksitFilter]       = useState("HEPSI");
  const [cariSearch, setCariSearch]           = useState("");

  // Quick action modals
  const [quickAction, setQuickAction] = useState<"tahsilat" | "gider" | null>(null);
  const [tahsilatForm, setTahsilatForm] = useState({ method: "NAKIT", amount: "", description: "" });
  const [giderForm, setGiderForm] = useState({ tarih: new Date().toISOString().split("T")[0], category: "", description: "", tutar: "", yontem: "NAKIT" });

  // Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load summary ──────────────────────────────────────────────────────────
  const refreshSummary = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const ms = new Date(); ms.setDate(1);
    const monthStart = ms.toISOString().split("T")[0];
    return Promise.all([
      fetch(`/api/kasa?date=${today}`).then(r => r.json()),
      fetch(`/api/gider?from=${today}&to=${today}`).then(r => r.json()),
      fetch(`/api/gider?from=${monthStart}&to=${today}`).then(r => r.json()),
      fetch("/api/firma").then(r => r.json()),
      fetch("/api/taksit-plani?status=GECIKTI").then(r => r.json()),
      fetch("/api/stock").then(r => r.json()),
    ]).then(([k, gt, gm, fr, tr, sr]) => {
      setKasaToday({ total: Number(k?.total || 0), byMethod: k?.byMethod || {}, payments: Array.isArray(k?.payments) ? k.payments : [] });
      setExpenseToday({ total: Number(gt?.total || 0), expenses: Array.isArray(gt?.expenses) ? gt.expenses : [] });
      setExpenseMonth({ total: Number(gm?.total || 0), expenses: Array.isArray(gm?.expenses) ? gm.expenses : [] });
      setFirmas(Array.isArray(fr) ? fr : []);
      setPlans(Array.isArray(tr) ? tr : []);
      setStockItems(Array.isArray(sr) ? sr : []);
    });
  }, []);

  useEffect(() => {
    // Vadesi geçmiş taksitleri otomatik GECIKTI yap — sayfa açılışında tetikle
    fetch("/api/taksit-plani/mark-gecikti", { method: "POST" }).catch(() => null);
    refreshSummary().finally(() => setLoading(false));
  }, [refreshSummary]);

  // ── Load tab-specific data ────────────────────────────────────────────────
  const loadTabData = useCallback(async (tab: TabId) => {
    if ((tab === "tahsilatlar" || tab === "kasa") && allPayments.length === 0) {
      setTabLoading(true);
      try { const r = await fetch("/api/payments"); const d = await r.json(); setAllPayments(Array.isArray(d) ? d : []); }
      finally { setTabLoading(false); }
    }
    if (tab === "giderler" && allExpenses.length === 0) {
      setTabLoading(true);
      const m3 = new Date(); m3.setMonth(m3.getMonth() - 3);
      const from = m3.toISOString().split("T")[0]; const to = new Date().toISOString().split("T")[0];
      try { const r = await fetch(`/api/gider?from=${from}&to=${to}`); const d = await r.json(); setAllExpenses(Array.isArray(d?.expenses) ? d.expenses : []); }
      finally { setTabLoading(false); }
    }
    if (tab === "hakediş" && doctors.length === 0) {
      setTabLoading(true);
      try { const r = await fetch("/api/staff"); const d = await r.json(); setDoctors(Array.isArray(d) ? d : []); }
      finally { setTabLoading(false); }
    }
  }, [allPayments.length, allExpenses.length, doctors.length]);

  useEffect(() => { loadTabData(activeTab); }, [activeTab, loadTabData]);

  const loadDoctorFinance = useCallback(async (doctorId: string) => {
    if (!doctorId) { setDoctorFinance(null); return; }
    setDoctorFinanceLoading(true);
    try {
      const ms = new Date(); ms.setDate(1);
      const from = ms.toISOString().split("T")[0]; const to = new Date().toISOString().split("T")[0];
      const r = await fetch(`/api/finance?doctorId=${doctorId}&from=${from}&to=${to}`);
      setDoctorFinance(await r.json());
    } finally { setDoctorFinanceLoading(false); }
  }, []);

  useEffect(() => { if (selectedDoctorId) loadDoctorFinance(selectedDoctorId); }, [selectedDoctorId, loadDoctorFinance]);

  // ── Computed totals ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const supplierDebt = firmas.reduce((s, f) => s + Number(f.bakiye || 0), 0);
    const criticalStock = stockItems.filter(i => Number(i.quantity) < Number(i.minQuantity));
    const overdueInstallments = plans.reduce((s, p) => s + (p.taksitler || []).filter(t => t.status === "GECIKTI").length, 0);
    const overdueAmount = plans.reduce((s, p) => s + (p.taksitler || []).filter(t => t.status === "GECIKTI").reduce((inner, t) => inner + Number(t.kalan || 0), 0), 0);
    return { supplierDebt, criticalStock, overdueInstallments, overdueAmount, todayNet: Number(kasaToday.total) - Number(expenseToday.total) };
  }, [firmas, plans, stockItems, kasaToday.total, expenseToday.total]);

  const filteredPayments = useMemo(() => allPayments.filter(p => {
    if (paymentSearch && !p.patient?.fullName?.toLowerCase().includes(paymentSearch.toLowerCase()) && !p.description?.toLowerCase().includes(paymentSearch.toLowerCase())) return false;
    if (paymentDateFrom && p.createdAt < paymentDateFrom) return false;
    if (paymentDateTo && p.createdAt > paymentDateTo + "T23:59:59") return false;
    return true;
  }), [allPayments, paymentSearch, paymentDateFrom, paymentDateTo]);

  const filteredExpenses = useMemo(() => allExpenses.filter(e => {
    if (expenseSearch && !e.category?.toLowerCase().includes(expenseSearch.toLowerCase()) && !e.description?.toLowerCase().includes(expenseSearch.toLowerCase())) return false;
    if (expenseDateFrom && e.tarih < expenseDateFrom) return false;
    if (expenseDateTo && e.tarih > expenseDateTo + "T23:59:59") return false;
    return true;
  }), [allExpenses, expenseSearch, expenseDateFrom, expenseDateTo]);

  const filteredFirmas = useMemo(() => firmas.filter(f => !cariSearch || f.name.toLowerCase().includes(cariSearch.toLowerCase())), [firmas, cariSearch]);

  const todoItems = useMemo(() => {
    const items: { type: "danger" | "warning" | "info"; label: string; detail: string; href: string }[] = [];
    if (totals.overdueInstallments > 0) items.push({ type: "danger", label: `${totals.overdueInstallments} gecikmiş taksit`, detail: `${fmtMoney(totals.overdueAmount)} tahsil edilmeli`, href: "/muhasebe" });
    const topFirma = [...firmas].filter(f => f.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye)[0];
    if (topFirma) items.push({ type: "warning", label: `${topFirma.name} — ödeme bekliyor`, detail: fmtMoney(topFirma.bakiye), href: "/firma" });
    if (totals.criticalStock.length > 0) items.push({ type: "info", label: `${totals.criticalStock.length} stok kalemi kritik seviyede`, detail: "Yeniden sipariş gerekli", href: "/stok" });
    return items;
  }, [totals, firmas]);

  // ── Quick actions ─────────────────────────────────────────────────────────
  const handleTahsilat = async () => {
    if (!tahsilatForm.amount) { showToast("error", "Tutar zorunludur"); return; }
    const r = await fetch("/api/kasa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...tahsilatForm, amount: Number(tahsilatForm.amount) }) });
    if (r.ok) { showToast("success", "Tahsilat kaydedildi"); setQuickAction(null); setTahsilatForm({ method: "NAKIT", amount: "", description: "" }); setAllPayments([]); refreshSummary(); }
    else { const e = await r.json(); showToast("error", e.error || "Hata"); }
  };

  const handleGider = async () => {
    if (!giderForm.category || !giderForm.tutar) { showToast("error", "Kategori ve tutar zorunlu"); return; }
    const r = await fetch("/api/gider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...giderForm, tutar: Number(giderForm.tutar) }) });
    if (r.ok) { showToast("success", "Gider kaydedildi"); setQuickAction(null); setGiderForm({ tarih: new Date().toISOString().split("T")[0], category: "", description: "", tutar: "", yontem: "NAKIT" }); setAllExpenses([]); refreshSummary(); }
    else { const e = await r.json(); showToast("error", e.error || "Hata"); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.text}
        </div>
      )}

      {/* Quick action: Tahsilat */}
      {quickAction === "tahsilat" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-base font-black text-slate-900">Hızlı Tahsilat</h3>
            <div className="space-y-3">
              <select value={tahsilatForm.method} onChange={e => setTahsilatForm(p => ({ ...p, method: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" placeholder="Tutar (TL)" value={tahsilatForm.amount} onChange={e => setTahsilatForm(p => ({ ...p, amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <input placeholder="Açıklama" value={tahsilatForm.description} onChange={e => setTahsilatForm(p => ({ ...p, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setQuickAction(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700">İptal</button>
              <button onClick={handleTahsilat} className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick action: Gider */}
      {quickAction === "gider" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-base font-black text-slate-900">Gider Ekle</h3>
            <div className="space-y-3">
              <input type="date" value={giderForm.tarih} onChange={e => setGiderForm(p => ({ ...p, tarih: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <input placeholder="Kategori (örn: Elektrik)" value={giderForm.category} onChange={e => setGiderForm(p => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <input placeholder="Açıklama" value={giderForm.description} onChange={e => setGiderForm(p => ({ ...p, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="number" placeholder="Tutar (TL)" value={giderForm.tutar} onChange={e => setGiderForm(p => ({ ...p, tutar: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <select value={giderForm.yontem} onChange={e => setGiderForm(p => ({ ...p, yontem: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setQuickAction(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700">İptal</button>
              <button onClick={handleGider} className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-700">Entegre Muhasebe</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Muhasebe Merkezi</h1>
        <p className="mt-1 text-sm text-slate-500">Para ile ilgili her iş tek panelde — tahsilat, gider, cari borç, kasa, taksit ve hakediş.</p>
      </div>

      {/* Summary Cards */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/30 to-emerald-50/20 p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Bugünkü Tahsilat", value: fmtMoney(kasaToday.total), tone: "text-emerald-700", bg: "bg-emerald-50/60" },
            { label: "Bugünkü Gider",    value: fmtMoney(expenseToday.total), tone: "text-red-700",     bg: "bg-red-50/60" },
            { label: "Net Nakit",         value: fmtMoney(totals.todayNet),   tone: totals.todayNet >= 0 ? "text-blue-700" : "text-red-700", bg: "bg-blue-50/60" },
            { label: "Aylık Gider",       value: fmtMoney(expenseMonth.total), tone: "text-slate-800",  bg: "bg-slate-50/60" },
            { label: "Tedarikçi Borcu",   value: fmtMoney(totals.supplierDebt), tone: "text-amber-700", bg: "bg-amber-50/60" },
            { label: "Gecikmiş Taksit",   value: `${totals.overdueInstallments} adet`, tone: "text-violet-700", bg: "bg-violet-50/60" },
          ].map(c => (
            <article key={c.label} className={`${c.bg} rounded-2xl border border-white/70 p-4 backdrop-blur`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`mt-1 text-xl font-black ${c.tone}`}>{c.value}</p>
            </article>
          ))}
        </div>
      </div>

      {/* Yapılacaklar */}
      {!loading && todoItems.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <h3 className="text-sm font-black text-amber-800">Yapılacak Finansal İşler</h3>
          </div>
          <div className="space-y-2">
            {todoItems.map((item, i) => (
              <div key={i} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${item.type === "danger" ? "bg-red-100 text-red-800" : item.type === "warning" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                <div>
                  <span className="font-semibold">{item.label}</span>
                  <span className="ml-2 text-xs opacity-70">{item.detail}</span>
                </div>
                <a href={item.href} className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold hover:bg-white">Git →</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="mr-1 self-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hızlı İşlem</span>
        <button onClick={() => setQuickAction("tahsilat")} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Tahsilat Ekle
        </button>
        <button onClick={() => setQuickAction("gider")} className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Gider Ekle
        </button>
        <Link href="/firma" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700">Satın Alma Gir</Link>
        <Link href="/firma" className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">Firma Ödemesi Yap</Link>
        <Link href="/taksit" className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100">Taksit Tahsil Et</Link>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${activeTab === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Genel Durum ─────────────────────────────────────────────── */}
      {activeTab === "genel" && (
        <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-black text-slate-900">Bugünün Finans Akışı</h2>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{v}</p>
                  <p className="mt-1 text-base font-black text-slate-800">{fmtMoney(kasaToday.byMethod?.[k] || 0)}</p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Kanal</th><th className="px-3 py-2 text-left">Hasta</th><th className="px-3 py-2 text-right">Tutar</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Yükleniyor...</td></tr>
                  : kasaToday.payments.length === 0 ? <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Bugün tahsilat yok</td></tr>
                  : kasaToday.payments.slice(0, 8).map(p => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{METHOD_LABELS[p.method] || p.method}</td>
                      <td className="px-3 py-2 text-slate-600">{p.patient?.fullName || p.description || "—"}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">En Yüksek Tedarikçi Borcu</h2>
                <Link href="/firma" className="text-xs font-semibold text-blue-700">Tedarikçilere Git</Link>
              </div>
              <div className="space-y-2">
                {[...firmas].filter(f => f.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye).slice(0, 4).map(f => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{f.name}</p>
                    <span className="text-sm font-black text-amber-700">{fmtMoney(f.bakiye)}</span>
                  </div>
                ))}
                {firmas.filter(f => f.bakiye > 0).length === 0 && <p className="py-4 text-center text-xs text-slate-400">Açık tedarikçi borcu yok</p>}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-black text-slate-900">Bu Ay Son Giderler</h2>
              <div className="space-y-2">
                {expenseMonth.expenses.slice(0, 4).map(e => (
                  <div key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <div><p className="text-sm font-semibold text-slate-800">{e.category}</p><p className="text-[11px] text-slate-500">{e.description || "—"}</p></div>
                    <span className="text-sm font-black text-red-700">{fmtMoney(e.tutar)}</span>
                  </div>
                ))}
                {expenseMonth.expenses.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Bu dönem gider kaydı yok</p>}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-black text-slate-900">Anlık Riskler</h2>
              <div className="space-y-2">
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-violet-700">Gecikmiş Taksit Tutarı</p>
                  <p className="mt-0.5 text-base font-black text-violet-800">{fmtMoney(totals.overdueAmount)}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Kritik Stok</p>
                  <p className="mt-0.5 text-base font-black text-amber-800">{totals.criticalStock.length} kalem</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── TAB: Tahsilatlar ──────────────────────────────────────────────── */}
      {activeTab === "tahsilatlar" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Hasta Tahsilatları</h2>
            <input placeholder="Hasta / açıklama ara..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} className="w-48 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={paymentDateFrom} onChange={e => setPaymentDateFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={paymentDateTo} onChange={e => setPaymentDateTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <button onClick={() => setQuickAction("tahsilat")} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">+ Tahsilat</button>
          </div>
          {tabLoading ? <div className="py-12 text-center text-sm text-slate-400">Yükleniyor...</div>
          : <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-left">Tarih</th><th className="px-3 py-2.5 text-left">Hasta</th>
                  <th className="px-3 py-2.5 text-left">Yöntem</th><th className="px-3 py-2.5 text-left">Açıklama</th><th className="px-3 py-2.5 text-right">Tutar</th>
                </tr></thead>
                <tbody>
                  {filteredPayments.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                  : filteredPayments.slice(0, 100).map(p => (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5">{fmtDate(p.createdAt)}</td>
                      <td className="px-3 py-2.5 font-medium">{p.patient?.fullName || "—"}</td>
                      <td className="px-3 py-2.5">{METHOD_LABELS[p.method] || p.method}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.description || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>{filteredPayments.length} kayıt</span>
            <span className="font-bold text-emerald-700">{fmtMoney(filteredPayments.reduce((s, p) => s + Number(p.amount), 0))} toplam</span>
          </div>
        </section>
      )}

      {/* ── TAB: Giderler ─────────────────────────────────────────────────── */}
      {activeTab === "giderler" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Gider Hareketleri</h2>
            <input placeholder="Kategori / açıklama ara..." value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)} className="w-52 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={expenseDateFrom} onChange={e => setExpenseDateFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={expenseDateTo} onChange={e => setExpenseDateTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <button onClick={() => setQuickAction("gider")} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">+ Gider</button>
          </div>
          {tabLoading ? <div className="py-12 text-center text-sm text-slate-400">Yükleniyor...</div>
          : <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-left">Tarih</th><th className="px-3 py-2.5 text-left">Kategori</th>
                  <th className="px-3 py-2.5 text-left">Açıklama</th><th className="px-3 py-2.5 text-left">Yöntem</th><th className="px-3 py-2.5 text-right">Tutar</th>
                </tr></thead>
                <tbody>
                  {filteredExpenses.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                  : filteredExpenses.slice(0, 100).map(e => (
                    <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5">{fmtDate(e.tarih)}</td>
                      <td className="px-3 py-2.5 font-medium">{e.category}</td>
                      <td className="px-3 py-2.5 text-slate-500">{e.description || "—"}</td>
                      <td className="px-3 py-2.5">{METHOD_LABELS[e.yontem || ""] || e.yontem || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-700">{fmtMoney(e.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>{filteredExpenses.length} kayıt</span>
            <span className="font-bold text-red-700">{fmtMoney(filteredExpenses.reduce((s, e) => s + Number(e.tutar), 0))} toplam</span>
          </div>
        </section>
      )}

      {/* ── TAB: Cari Borçlar ─────────────────────────────────────────────── */}
      {activeTab === "cari" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Tedarikçi Cari Hesaplar</h2>
            <input placeholder="Firma ara..." value={cariSearch} onChange={e => setCariSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <Link href="/firma" className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">Firma Sayfasına Git</Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">Firma</th><th className="px-3 py-2.5 text-right">Toplam Borç</th>
                <th className="px-3 py-2.5 text-right">Ödenen</th><th className="px-3 py-2.5 text-right">Net Bakiye</th><th className="px-3 py-2.5 text-center">Durum</th>
              </tr></thead>
              <tbody>
                {filteredFirmas.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">Firma bulunamadı</td></tr>
                : filteredFirmas.map(f => (
                  <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold">{f.name}</td>
                    <td className="px-3 py-3 text-right font-bold text-red-700">{fmtMoney(f.borc)}</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">{fmtMoney(f.odenen)}</td>
                    <td className="px-3 py-3 text-right font-black text-slate-900">{fmtMoney(f.bakiye)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${f.bakiye > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {f.bakiye > 0 ? "Borçlu" : "Kapalı"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>{filteredFirmas.length} tedarikçi</span>
            <span className="font-bold text-amber-700">{fmtMoney(filteredFirmas.reduce((s, f) => s + f.bakiye, 0))} toplam bakiye</span>
          </div>
        </section>
      )}

      {/* ── TAB: Kasa / Banka ─────────────────────────────────────────────── */}
      {activeTab === "kasa" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Kasa / Banka Hareketleri</h2>
            <input placeholder="Hasta / açıklama ara..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} className="w-48 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={paymentDateFrom} onChange={e => setPaymentDateFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="date" value={paymentDateTo} onChange={e => setPaymentDateTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="mb-4 grid gap-2 sm:grid-cols-5">
            {Object.entries(METHOD_LABELS).map(([k, v]) => {
              const total = filteredPayments.filter(p => p.method === k).reduce((s, p) => s + Number(p.amount), 0);
              return (
                <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{v}</p>
                  <p className="mt-0.5 text-sm font-black text-slate-800">{fmtMoney(total)}</p>
                </div>
              );
            })}
          </div>
          {tabLoading ? <div className="py-12 text-center text-sm text-slate-400">Yükleniyor...</div>
          : <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-left">Tarih</th><th className="px-3 py-2.5 text-left">Hasta</th>
                  <th className="px-3 py-2.5 text-left">Kanal</th><th className="px-3 py-2.5 text-left">Açıklama</th><th className="px-3 py-2.5 text-right">Tutar</th>
                </tr></thead>
                <tbody>
                  {filteredPayments.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                  : filteredPayments.slice(0, 100).map(p => (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5">{fmtDate(p.createdAt)}</td>
                      <td className="px-3 py-2.5 font-medium">{p.patient?.fullName || "—"}</td>
                      <td className="px-3 py-2.5">{METHOD_LABELS[p.method] || p.method}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.description || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        </section>
      )}

      {/* ── TAB: Taksit / Alacak ──────────────────────────────────────────── */}
      {activeTab === "taksit" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Taksit ve Alacak Takibi</h2>
            <select value={taksitFilter} onChange={e => setTaksitFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400">
              <option value="HEPSI">Tüm Planlar</option>
              <option value="GECIKTI">Gecikmiş</option>
              <option value="BEKLIYOR">Bekleyenler</option>
              <option value="ODENDI">Ödenenler</option>
            </select>
            <Link href="/taksit" className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Taksit Sayfasına Git</Link>
          </div>
          <div className="space-y-3">
            {plans.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">Taksit planı bulunamadı</div>
            : plans.filter(p => {
                if (taksitFilter === "GECIKTI") return (p.taksitler || []).some(t => t.status === "GECIKTI");
                if (taksitFilter === "BEKLIYOR") return (p.taksitler || []).some(t => t.status === "BEKLIYOR");
                if (taksitFilter === "ODENDI") return (p.taksitler || []).every(t => t.status === "ODENDI");
                return true;
              }).slice(0, 30).map(plan => {
                const gecikti = (plan.taksitler || []).filter(t => t.status === "GECIKTI");
                const bekleyen = (plan.taksitler || []).filter(t => t.status === "BEKLIYOR");
                return (
                  <div key={plan.id} className="rounded-2xl border border-slate-100 p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{plan.patient?.fullName || "—"}</p>
                        <p className="text-xs text-slate-500">{plan.baslik || "Taksit Planı"} • Toplam: {fmtMoney(plan.toplamBorc)}</p>
                      </div>
                      <div className="flex gap-1">
                        {gecikti.length > 0 && <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{gecikti.length} gecikmiş</span>}
                        {bekleyen.length > 0 && <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{bekleyen.length} bekliyor</span>}
                      </div>
                    </div>
                    {gecikti.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {gecikti.slice(0, 3).map(t => (
                          <div key={t.id} className="flex items-center justify-between rounded-lg bg-red-50 px-2 py-1.5">
                            <span className="text-[11px] text-red-700">#{t.siraNo} • Vade: {fmtDate(t.vadeDate)}</span>
                            <span className="text-[11px] font-bold text-red-700">{fmtMoney(t.kalan)} kalan</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ── TAB: Doktor Hakedişleri ───────────────────────────────────────── */}
      {activeTab === "hakediş" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Doktor Hakedişleri</h2>
            <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)} className="w-52 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">Doktor seçin...</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
            <Link href="/finans" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Hakediş Sayfasına Git</Link>
          </div>
          {tabLoading ? <div className="py-12 text-center text-sm text-slate-400">Yükleniyor...</div>
          : !selectedDoctorId ? <div className="rounded-2xl bg-slate-50 py-16 text-center text-sm text-slate-400">Görüntülemek için bir doktor seçin</div>
          : doctorFinanceLoading ? <div className="py-12 text-center text-sm text-slate-400">Yükleniyor...</div>
          : doctorFinance ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  { label: "Toplam Üretim",  value: fmtMoney(Number(doctorFinance.totalTreatments) || 0), tone: "text-blue-700",    bg: "bg-blue-50" },
                  { label: "Tahsil Edilen",   value: fmtMoney(Number(doctorFinance.received) || 0),       tone: "text-emerald-700", bg: "bg-emerald-50" },
                  { label: "Tahsil Bekleyen", value: fmtMoney(Number(doctorFinance.toReceive) || 0),      tone: "text-amber-700",   bg: "bg-amber-50" },
                  { label: "Ödenen Hakediş",  value: fmtMoney(Number(doctorFinance.earned) || 0),         tone: "text-slate-800",   bg: "bg-slate-50" },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
                    <p className="text-[10px] font-bold uppercase text-slate-500">{c.label}</p>
                    <p className={`mt-1 text-xl font-black ${c.tone}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              {Array.isArray(doctorFinance.topExaminations) && (doctorFinance.topExaminations as { type: string; count: number }[]).length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-black text-slate-900">En Çok Yapılan Tedaviler</h3>
                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left">Tedavi</th><th className="px-3 py-2 text-right">Adet</th>
                      </tr></thead>
                      <tbody>
                        {(doctorFinance.topExaminations as { type: string; count: number }[]).map(ex => (
                          <tr key={ex.type} className="border-t border-slate-100">
                            <td className="px-3 py-2">{ex.type}</td>
                            <td className="px-3 py-2 text-right font-bold">{ex.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
