"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
type Payment = {
  id: string; createdAt: string; amount: number; method: string;
  description?: string | null;
  patient?: { id: string; fullName: string } | null;
};
type Expense = {
  id: string; tarih: string; category: string; description?: string | null;
  tutar: number; yontem?: string | null; faturaNo?: string | null; kdvOrani?: number | null;
};
type GiderKategori = { id: string; name: string; isActive: boolean };
type PatientOption = { id: string; fullName: string };
type PosDevice = { id: string; name: string; isActive: boolean };
type FirmaData = { id: string; name: string; borc: number; odenen: number; bakiye: number };
type TaksitItem = {
  id: string; siraNo: number; vadeDate: string;
  tutar: number; odenen: number; kalan: number; status: string;
};
type TaksitPlan = {
  id: string; baslik?: string | null; toplamBorc: number; pesnat: number;
  taksitSayisi: number; period: string; startDate: string;
  notes?: string | null; status: string; createdAt: string;
  patient: { id: string; fullName: string; phone: string };
  doctor: { id: string; fullName: string };
  taksitler: TaksitItem[];
};
type Reminder = {
  id: string; note: string; reminderDate: string; status: string;
  patient?: { fullName: string } | null;
};
type Doctor = { id: string; fullName: string; role: string };
type StockItem = { id: string; quantity: number; minQuantity: number };
type TrendMonth = { label: string; gelir: number; gider: number };
type AlacakRow = { id: string; fullName: string; phone: string; brutTedavi: number; indirim: number; netTedavi: number; odenen: number; bakiye: number; discountRate: number; };

// ─── Constants ────────────────────────────────────────────────────────────────
const MONEY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const fmt = (n: number | string | null | undefined) => MONEY.format(Number(n) || 0);
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; } };

const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order", DIGER: "Diğer",
};
const KDV_OPTIONS = [
  { value: "0",  label: "%0  — KDV Yok" },
  { value: "10", label: "%10" },
  { value: "20", label: "%20" },
];
const PERIODS: Record<string, string> = {
  HAFTALIK: "Haftalık", IKIHALFTALIK: "2 Haftalık",
  AYLIK: "Aylık", IKIAYLIK: "2 Aylık",
  UCAYLIK: "3 Aylık", ALTIAYLIK: "6 Aylık", YILLIK: "Yıllık",
};
const TAKSIT_STATUS_BADGE: Record<string, string> = {
  AKTIF: "bg-blue-100 text-blue-700",
  DEVAM_EDIYOR: "bg-amber-100 text-amber-700",
  TAMAMLANDI: "bg-emerald-100 text-emerald-700",
  IPTAL: "bg-red-100 text-red-700",
  BEKLIYOR: "bg-slate-100 text-slate-700",
  ODENDI: "bg-emerald-100 text-emerald-700",
  GECIKTI: "bg-red-100 text-red-700",
};

const INP = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:bg-white focus:outline-none";
const MUHASEBE_CACHE_KEY = "muhasebe:page:v1";

function readMuhasebeCache() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(MUHASEBE_CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as {
      userRole?: string;
      kasaToday?: { total: number; byMethod: Record<string, number>; payments: Payment[] };
      expenseToday?: { total: number };
      expenseMonth?: { total: number; expenses: Expense[] };
      firmas?: FirmaData[];
      stockItems?: StockItem[];
      taksitOverdue?: { count: number; amount: number };
      trendData?: TrendMonth[];
      alacaklar?: AlacakRow[];
      alacakTotal?: number;
      patients?: PatientOption[];
      posDevices?: PosDevice[];
      taksitPlans?: TaksitPlan[];
      reminders?: Reminder[];
      taksitDoctors?: Doctor[];
    };
    return {
      userRole: cached.userRole || "",
      kasaToday: cached.kasaToday || { total: 0, byMethod: {}, payments: [] },
      expenseToday: cached.expenseToday || { total: 0 },
      expenseMonth: cached.expenseMonth || { total: 0, expenses: [] },
      firmas: Array.isArray(cached.firmas) ? cached.firmas : [],
      stockItems: Array.isArray(cached.stockItems) ? cached.stockItems : [],
      taksitOverdue: cached.taksitOverdue || { count: 0, amount: 0 },
      trendData: Array.isArray(cached.trendData) ? cached.trendData : [],
      alacaklar: Array.isArray(cached.alacaklar) ? cached.alacaklar : [],
      alacakTotal: Number(cached.alacakTotal || 0),
      patients: Array.isArray(cached.patients) ? cached.patients : [],
      posDevices: Array.isArray(cached.posDevices) ? cached.posDevices : [],
      taksitPlans: Array.isArray(cached.taksitPlans) ? cached.taksitPlans : [],
      reminders: Array.isArray(cached.reminders) ? cached.reminders : [],
      taksitDoctors: Array.isArray(cached.taksitDoctors) ? cached.taksitDoctors : [],
    };
  } catch {
    return null;
  }
}

const TABS = [
  { id: "genel",    label: "Genel Bakış",      hint: "Tüm finansal özet" },
  { id: "gelir",    label: "Gelir / Tahsilat", hint: "Hasta ödemeleri ve kasa hareketleri" },
  { id: "gider",    label: "Gider",            hint: "Klinik giderleri" },
  { id: "taksit",   label: "Taksit / Alacak",  hint: "Taksitli ödeme planları" },
  { id: "alacak",   label: "Hasta Alacakları", hint: "Taksit dışı dahil, tüm hasta borç bakiyeleri" },
  { id: "cari",     label: "Tedarikçi / Cari", hint: "Tedarikçilerle olan cari hesap bakiyeleri" },
  { id: "hakedis",  label: "Hakedişler",       hint: "Doktorların işlem başına kazanç/komisyon dökümü" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─────────────────────────────────────────────────────────────────────────────
export default function MuhasebePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // URL ?tab= parametresinden başlangıç tab'ı belirle
  const initialTab = (): TabId => {
    const t = searchParams.get("tab") as TabId | null;
    return t && TABS.some(x => x.id === t) ? t : "genel";
  };

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Tab değişiminde URL'yi güncelle (push değil replace, back history kirlenmez)
  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/muhasebe?tab=${tab}`, { scroll: false });
  }, [router]);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Summary state ─────────────────────────────────────────────────────────
  const [loading,       setLoading]       = useState(true);
  // Başlangıçta sessionStorage'dan oku — flash'siz render
  const [userRole,      setUserRole]      = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("dev-preview-role") || "") : ""
  );

  const visibleTabs = useMemo(() => {
    if (userRole === "BANKO") return TABS.filter(tab => !["gider", "cari", "hakedis"].includes(tab.id));
    if (userRole === "DOKTOR" || userRole === "ASISTAN") return TABS.filter(() => false);
    return TABS;
  }, [userRole]);
  const [kasaToday,     setKasaToday]     = useState<{ total: number; byMethod: Record<string, number>; payments: Payment[] }>({ total: 0, byMethod: {}, payments: [] });
  const [expenseToday,  setExpenseToday]  = useState<{ total: number }>({ total: 0 });
  const [expenseMonth,  setExpenseMonth]  = useState<{ total: number; expenses: Expense[] }>({ total: 0, expenses: [] });
  const [firmas,        setFirmas]        = useState<FirmaData[]>([]);
  const [stockItems,    setStockItems]    = useState<StockItem[]>([]);
  const [taksitOverdue, setTaksitOverdue] = useState<{ count: number; amount: number }>({ count: 0, amount: 0 });

  const refreshSummary = useCallback(async (role?: string) => {
    // Anlık rol: parametre > state > sessionStorage
    const effectiveRole = role || (typeof window !== "undefined" ? (sessionStorage.getItem("dev-preview-role") || "") : "");
    const isBankoRole = effectiveRole === "BANKO";
    const today = new Date().toISOString().split("T")[0];
    const ms = new Date(); ms.setDate(1);
    const monthStart = ms.toISOString().split("T")[0];
    const [k, gt, gm, fr, sr, tr] = await Promise.all([
      fetch(`/api/kasa?date=${today}`).then(r => r.json()).catch(() => ({})),
      // BANKO için /api/gider yasak — çekilmez
      !isBankoRole ? fetch(`/api/gider?from=${today}&to=${today}`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
      !isBankoRole ? fetch(`/api/gider?from=${monthStart}&to=${today}`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
      // BANKO için /api/firma ve /api/stock yasak — çekilmez
      !isBankoRole ? fetch("/api/firma").then(r => r.json()).catch(() => []) : Promise.resolve([]),
      !isBankoRole ? fetch("/api/stock").then(r => r.json()).catch(() => []) : Promise.resolve([]),
      fetch("/api/taksit-plani?status=GECIKTI").then(r => r.json()).catch(() => []),
    ]);
    setKasaToday({ total: Number(k?.total || 0), byMethod: k?.byMethod || {}, payments: Array.isArray(k?.payments) ? k.payments : [] });
    setExpenseToday({ total: Number(gt?.total || 0) });
    setExpenseMonth({ total: Number(gm?.total || 0), expenses: Array.isArray(gm?.expenses) ? gm.expenses : [] });
    setFirmas(Array.isArray(fr) ? fr : []);
    setStockItems(Array.isArray(sr) ? sr : []);
    if (Array.isArray(tr)) {
      const items = (tr as TaksitPlan[]).flatMap(p => (p.taksitler || []).filter(t => t.status === "GECIKTI"));
      setTaksitOverdue({ count: items.length, amount: items.reduce((s, t) => s + Number(t.kalan || 0), 0) });
    }
  }, []);

  const supplierDebt  = useMemo(() => firmas.reduce((s, f) => s + Number(f.bakiye || 0), 0), [firmas]);
  const criticalStock = useMemo(() => stockItems.filter(i => Number(i.quantity) < Number(i.minQuantity)), [stockItems]);
  const todayNet      = kasaToday.total - expenseToday.total;

  // ── Trend (aylık 6 ay) ───────────────────────────────────────────────────
  const [trendData, setTrendData] = useState<TrendMonth[]>([]);
  const loadTrend = useCallback(async () => {
    const r = await fetch("/api/muhasebe/trend").catch(() => null);
    if (r?.ok) { const d = await r.json(); if (Array.isArray(d)) setTrendData(d); }
  }, []);

  useEffect(() => {
    const syncRole = () => {
      fetch("/api/auth/me")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
          if (preview || d?.role) setUserRole(preview || d.role);
        })
        .catch(() => null);
    };

    syncRole();
    fetch("/api/taksit-plani/mark-gecikti", { method: "POST" }).catch(() => null);
    refreshSummary().finally(() => setLoading(false));
    loadTrend();

    const onPreview = () => syncRole();
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, [refreshSummary, loadTrend]);

  useEffect(() => {
    if (userRole === "DOKTOR" || userRole === "ASISTAN") {
      router.replace("/yetkisiz");
    }
  }, [router, userRole]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      changeTab(visibleTabs[0].id);
    }
  }, [activeTab, changeTab, visibleTabs]);

  // ── Hasta Alacakları ─────────────────────────────────────────────────────
  const [alacaklar,      setAlacaklar]      = useState<AlacakRow[]>([]);
  const [alacakTotal,    setAlacakTotal]    = useState(0);
  const [alacakLoading,  setAlacakLoading]  = useState(false);
  const [alacakSearch,   setAlacakSearch]   = useState("");

  const loadAlacaklar = useCallback(async () => {
    setAlacakLoading(true);
    const r = await fetch("/api/muhasebe/alacaklar").catch(() => null);
    if (r?.ok) { const d = await r.json(); setAlacaklar(d.rows || []); setAlacakTotal(d.toplamAlacak || 0); }
    setAlacakLoading(false);
  }, []);

  const filteredAlacaklar = useMemo(() => {
    if (!alacakSearch) return alacaklar;
    const q = alacakSearch.toLowerCase();
    return alacaklar.filter(a => a.fullName.toLowerCase().includes(q) || a.phone.includes(q));
  }, [alacaklar, alacakSearch]);

  // ── Shared: patients & pos ────────────────────────────────────────────────
  const [patients,   setPatients]   = useState<PatientOption[]>([]);
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);

  const ensurePatients = useCallback(() => {
    if (patients.length === 0)
      fetch("/api/patients").then(r => r.json()).then(d => setPatients(Array.isArray(d) ? d : (d.patients || []))).catch(() => {});
  }, [patients.length]);

  const ensurePos = useCallback(() => {
    fetch("/api/pos-devices").then(r => r.ok ? r.json() : []).then((devs: PosDevice[]) => setPosDevices((devs || []).filter(d => d.isActive))).catch(() => {});
  }, []);

  // Sayfa açılınca hemen yükle — form açıkken boş dropdown sorununu önler
  useEffect(() => {
    ensurePatients();
    ensurePos();
    fetch("/api/staff").then(r => r.json()).then(d => setTaksitDoctors((Array.isArray(d) ? d : []).filter((u: Doctor) => u.role === "DOKTOR"))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TAB: Gelir / Tahsilat ─────────────────────────────────────────────────
  const [allPayments,  setAllPayments]  = useState<Payment[]>([]);
  const [showTahForm,  setShowTahForm]  = useState(false);
  const [tahForm,      setTahForm]      = useState({ patientId: "", doctorId: "", method: "NAKIT", amount: "", description: "", posId: "" });
  const [tahSaving,    setTahSaving]    = useState(false);
  const [pmtSearch,    setPmtSearch]    = useState("");
  const [pmtFrom,      setPmtFrom]      = useState("");
  const [pmtTo,        setPmtTo]        = useState("");

  const loadPayments = useCallback(async () => {
    const r = await fetch("/api/payments").catch(() => null);
    if (r?.ok) { const d = await r.json(); setAllPayments(Array.isArray(d) ? d : []); }
  }, []);

  const submitTahsilat = async () => {
    if (!tahForm.amount || Number(tahForm.amount) <= 0) { showToast("error", "Geçerli bir tutar giriniz"); return; }
    if (!tahForm.doctorId) { showToast("error", "Lütfen bir doktor seçin"); return; }
    setTahSaving(true);
    const payload: Record<string, unknown> = { ...tahForm, amount: Number(tahForm.amount) };
    if (!payload.patientId) delete payload.patientId;
    if (!payload.posId)     delete payload.posId;
    const r = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    setTahSaving(false);
    if (r?.ok) {
      showToast("success", "Tahsilat kaydedildi");
      setShowTahForm(false);
      setTahForm({ patientId: "", doctorId: "", method: "NAKIT", amount: "", description: "", posId: "" });
      loadPayments(); refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || e?.message || "Tahsilat kaydedilemedi");
    }
  };

  const filteredPayments = useMemo(() => allPayments.filter(p => {
    if (pmtSearch && !p.patient?.fullName?.toLowerCase().includes(pmtSearch.toLowerCase()) && !p.description?.toLowerCase().includes(pmtSearch.toLowerCase())) return false;
    const pDate = p.createdAt.substring(0, 10);
    if (pmtFrom && pDate < pmtFrom) return false;
    if (pmtTo   && pDate > pmtTo)   return false;
    return true;
  }), [allPayments, pmtSearch, pmtFrom, pmtTo]);

  // ── TAB: Gider ────────────────────────────────────────────────────────────
  const [allExpenses,   setAllExpenses]   = useState<Expense[]>([]);
  const [giderKats,     setGiderKats]     = useState<GiderKategori[]>([]);
  const [showGiderForm, setShowGiderForm] = useState(false);
  const [showCatMgr,    setShowCatMgr]    = useState(false);
  const [newCatName,    setNewCatName]    = useState("");
  const [giderForm,     setGiderForm]     = useState({
    tarih: new Date().toISOString().split("T")[0],
    categoryId: "", category: "", description: "",
    tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0",
  });
  const [giderSaving, setGiderSaving] = useState(false);
  const [expSearch,   setExpSearch]   = useState("");
  const [expFrom,     setExpFrom]     = useState("");
  const [expTo,       setExpTo]       = useState("");

  const loadExpenses = useCallback(async () => {
    const m3 = new Date(); m3.setMonth(m3.getMonth() - 3);
    const from = m3.toISOString().split("T")[0];
    const to   = new Date().toISOString().split("T")[0];
    const r = await fetch(`/api/gider?from=${from}&to=${to}`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setAllExpenses(Array.isArray(d?.expenses) ? d.expenses : []); }
  }, []);

  const loadGiderKats = useCallback(async () => {
    const r = await fetch("/api/gider-kategorileri").catch(() => null);
    if (r?.ok) { const d = await r.json(); setGiderKats(Array.isArray(d) ? d : []); }
  }, []);

  const submitGider = async () => {
    const isManualCat = giderForm.categoryId === "__manual" || giderForm.categoryId === "";
    const catValid    = isManualCat ? giderForm.category.trim() !== "" : true;
    if (!giderForm.tarih || !giderForm.tutar || Number(giderForm.tutar) <= 0 || !catValid) {
      showToast("error", "Tarih, geçerli tutar ve kategori zorunlu"); return;
    }
    setGiderSaving(true);
    const realCatId = (giderForm.categoryId && giderForm.categoryId !== "__manual") ? giderForm.categoryId : null;
    const cat = realCatId
      ? giderKats.find(c => c.id === realCatId)?.name || giderForm.category
      : giderForm.category.trim();
    const r = await fetch("/api/gider", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: giderForm.tarih, categoryId: realCatId,
        category: cat, description: giderForm.description || null,
        tutar: Number(giderForm.tutar), yontem: giderForm.yontem,
        faturaNo: giderForm.faturaNo || null, kdvOrani: Number(giderForm.kdvOrani),
      }),
    }).catch(() => null);
    setGiderSaving(false);
    if (r?.ok) {
      showToast("success", "Gider kaydedildi");
      setShowGiderForm(false);
      setGiderForm({ tarih: new Date().toISOString().split("T")[0], categoryId: "", category: "", description: "", tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0" });
      loadExpenses(); refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || "Gider kaydedilemedi");
    }
  };

  const deleteGider = async (id: string) => {
    if (!confirm("Bu gider kaydını silmek istediğinizden emin misiniz?")) return;
    const r = await fetch(`/api/gider/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) { showToast("success", "Gider silindi"); loadExpenses(); refreshSummary(); }
    else showToast("error", "Silme işlemi başarısız");
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await fetch("/api/gider-kategorileri", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    setNewCatName(""); loadGiderKats();
  };

  const filteredExpenses = useMemo(() => allExpenses.filter(e => {
    if (expSearch && !e.category?.toLowerCase().includes(expSearch.toLowerCase()) && !e.description?.toLowerCase().includes(expSearch.toLowerCase())) return false;
    if (expFrom && e.tarih < expFrom) return false;
    if (expTo   && e.tarih > expTo + "T23:59:59") return false;
    return true;
  }), [allExpenses, expSearch, expFrom, expTo]);

  // ── TAB: Taksit / Alacak ──────────────────────────────────────────────────
  const [taksitPlans,   setTaksitPlans]   = useState<TaksitPlan[]>([]);
  const [taksitSubTab,  setTaksitSubTab]  = useState<"liste" | "olustur" | "hatirlatma">("liste");
  const [taksitLoading, setTaksitLoading] = useState(false);
  const [taksitSearch,  setTaksitSearch]  = useState("");
  const [taksitStatus,  setTaksitStatus]  = useState("HEPSI");
  const [selectedPlan,  setSelectedPlan]  = useState<TaksitPlan | null>(null);
  const [planDetail,    setPlanDetail]    = useState<TaksitPlan | null>(null);
  const [showOdeModal,  setShowOdeModal]  = useState<TaksitItem | null>(null);
  const [odeForm,       setOdeForm]       = useState({ tutar: "", yontem: "NAKIT", note: "" });
  const [taksitDoctors, setTaksitDoctors] = useState<Doctor[]>([]);
  const [newPlanForm,   setNewPlanForm]   = useState({
    patientId: "", doctorId: "", baslik: "", toplamBorc: "", pesnat: "0",
    taksitSayisi: "6", period: "AYLIK", startDate: new Date().toISOString().split("T")[0], notes: "",
  });
  const [reminders,    setReminders]    = useState<Reminder[]>([]);
  const [showRemModal, setShowRemModal] = useState(false);
  const [remForm,      setRemForm]      = useState({ patientId: "", note: "", reminderDate: new Date().toISOString().split("T")[0] });

  const loadTaksitPlans = useCallback(async () => {
    setTaksitLoading(true);
    try {
      const qs = taksitStatus !== "HEPSI" ? `?status=${taksitStatus}` : "";
      const r = await fetch(`/api/taksit-plani${qs}`); const d = await r.json();
      setTaksitPlans(Array.isArray(d) ? d : []);
    } finally { setTaksitLoading(false); }
  }, [taksitStatus]);

  const loadReminders = useCallback(async () => {
    const r = await fetch("/api/reminder?status=HEPSI"); const d = await r.json();
    setReminders(Array.isArray(d) ? d : []);
  }, []);

  const loadPlanDetail = async (id: string) => {
    const r = await fetch(`/api/taksit-plani/${id}`); const d = await r.json();
    setPlanDetail(d); setSelectedPlan(d);
  };

  const handleCreatePlan = async () => {
    if (!newPlanForm.patientId || !newPlanForm.doctorId) {
      showToast("error", "Hasta ve doktor seçimi zorunlu"); return;
    }
    if (!newPlanForm.toplamBorc || Number(newPlanForm.toplamBorc) <= 0) {
      showToast("error", "Geçerli bir toplam borç tutarı giriniz"); return;
    }
    if (!newPlanForm.taksitSayisi || Number(newPlanForm.taksitSayisi) <= 0 || Number(newPlanForm.taksitSayisi) > 120) {
      showToast("error", "Taksit sayısı 1–120 arasında olmalı"); return;
    }
    if (Number(newPlanForm.pesnat) < 0) {
      showToast("error", "Peşinat negatif olamaz"); return;
    }
    if (Number(newPlanForm.pesnat) >= Number(newPlanForm.toplamBorc)) {
      showToast("error", "Peşinat toplam borçtan küçük olmalı"); return;
    }
    const r = await fetch("/api/taksit-plani", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: newPlanForm.patientId, doctorId: newPlanForm.doctorId,
        baslik: newPlanForm.baslik || null,
        toplamBorc: Number(newPlanForm.toplamBorc), pesnat: Number(newPlanForm.pesnat || 0),
        taksitSayisi: Number(newPlanForm.taksitSayisi), period: newPlanForm.period,
        startDate: newPlanForm.startDate, notes: newPlanForm.notes || null,
      }),
    });
    if (r.ok) {
      showToast("success", "Taksit planı oluşturuldu");
      setNewPlanForm({ patientId: "", doctorId: "", baslik: "", toplamBorc: "", pesnat: "0", taksitSayisi: "6", period: "AYLIK", startDate: new Date().toISOString().split("T")[0], notes: "" });
      setTaksitSubTab("liste"); loadTaksitPlans(); refreshSummary();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  const handleOde = async () => {
    if (!showOdeModal || !selectedPlan) return;
    if (!odeForm.tutar || Number(odeForm.tutar) <= 0) { showToast("error", "Geçerli bir tahsilat tutarı giriniz"); return; }
    if (Number(odeForm.tutar) > Number(showOdeModal.kalan) + 0.01) { showToast("error", `Kalan tutardan fazla girilemez (Kalan: ${fmt(showOdeModal.kalan)})`); return; }
    const r = await fetch(`/api/taksit-plani/${selectedPlan.id}/taksitler/${showOdeModal.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tutar: Number(odeForm.tutar), yontem: odeForm.yontem, note: odeForm.note || null }),
    });
    if (r.ok) {
      setShowOdeModal(null); setOdeForm({ tutar: "", yontem: "NAKIT", note: "" });
      loadPlanDetail(selectedPlan.id); loadTaksitPlans(); refreshSummary();
      showToast("success", "Taksit tahsil edildi");
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  const handleAddReminder = async () => {
    if (!remForm.note.trim()) { showToast("error", "Not alanı zorunlu"); return; }
    if (!remForm.reminderDate) { showToast("error", "Tarih zorunlu"); return; }
    const r = await fetch("/api/reminder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: remForm.patientId || null, note: remForm.note.trim(), reminderDate: remForm.reminderDate }),
    }).catch(() => null);
    if (r?.ok) {
      showToast("success", "Hatırlatma eklendi");
      setShowRemModal(false);
      setRemForm({ patientId: "", note: "", reminderDate: new Date().toISOString().split("T")[0] });
      loadReminders();
    } else {
      showToast("error", "Hatırlatma eklenemedi");
    }
  };

  const completeReminder = async (id: string) => {
    const r = await fetch(`/api/reminder/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "TAMAMLANDI" }) }).catch(() => null);
    if (r?.ok) { showToast("success", "Hatırlatma tamamlandı"); loadReminders(); }
    else showToast("error", "Güncelleme başarısız");
  };

  const cancelPlan = async (id: string) => {
    if (!confirm("Bu planı iptal etmek istediğinizden emin misiniz?")) return;
    const r = await fetch(`/api/taksit-plani/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IPTAL" }) }).catch(() => null);
    if (r?.ok) {
      showToast("success", "Plan iptal edildi");
      loadTaksitPlans();
      if (selectedPlan?.id === id) { setSelectedPlan(null); setPlanDetail(null); }
    } else {
      showToast("error", "İptal işlemi başarısız");
    }
  };

  const taksitKPIs = useMemo(() => {
    const geciken     = taksitPlans.filter(p => p.taksitler.some(t => t.status === "GECIKTI")).length;
    const toplamKalan = taksitPlans.filter(p => p.status !== "TAMAMLANDI" && p.status !== "IPTAL").flatMap(p => p.taksitler).reduce((s, t) => s + Number(t.kalan), 0);
    const bekleyen    = taksitPlans.flatMap(p => p.taksitler).filter(t => t.status === "BEKLIYOR").length;
    const bugunVade   = taksitPlans.flatMap(p => p.taksitler).filter(t => {
      const v = new Date(t.vadeDate); const now = new Date();
      return t.status === "BEKLIYOR" && v.toDateString() === now.toDateString();
    }).length;
    return { geciken, toplamKalan, bekleyen, bugunVade };
  }, [taksitPlans]);

  const filteredTaksitPlans = useMemo(() => taksitPlans.filter(p => {
    if (!taksitSearch) return true;
    const q = taksitSearch.toLowerCase();
    return p.patient.fullName.toLowerCase().includes(q) || p.doctor.fullName.toLowerCase().includes(q) || (p.baslik || "").toLowerCase().includes(q);
  }), [taksitPlans, taksitSearch]);

  // ── TAB: Tedarikçi / Cari ─────────────────────────────────────────────────
  const [cariSearch, setCariSearch] = useState("");
  const filteredFirmas = useMemo(() => firmas.filter(f => !cariSearch || f.name.toLowerCase().includes(cariSearch.toLowerCase())), [firmas, cariSearch]);

  // ── TAB: Hakedişler ──────────────────────────────────────────────────────
  const [hakDoctors,     setHakDoctors]     = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [doctorFinance,  setDoctorFinance]  = useState<Record<string, unknown> | null>(null);
  const [hakLoading,     setHakLoading]     = useState(false);
  const [showHakOdeModal, setShowHakOdeModal] = useState(false);
  const [hakOdeForm,      setHakOdeForm]      = useState({ tutar: "", aciklama: "" });
  const [hakOdeSaving,    setHakOdeSaving]    = useState(false);

  const summaryCards = [
    { label: "Bugün Gelir",     value: fmt(kasaToday.total),       tone: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-100", banko: true  },
    { label: "Bugün Net",       value: fmt(todayNet),              tone: todayNet >= 0 ? "text-blue-700" : "text-red-700", bg: "bg-blue-50", border: "border-blue-100", banko: true },
    { label: "Gecikmiş Taksit", value: `${taksitOverdue.count} adet`, tone: "text-violet-700", bg: "bg-violet-50", border: "border-violet-100", banko: true  },
    { label: "Tedarikçi Borcu", value: fmt(supplierDebt),          tone: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-100",   banko: false },
    { label: "Bugün Gider",     value: fmt(expenseToday.total),    tone: "text-red-700",     bg: "bg-red-50",      border: "border-red-100",     banko: false },
    { label: "Aylık Gider",     value: fmt(expenseMonth.total),    tone: "text-slate-800",   bg: "bg-slate-50",    border: "border-slate-100",   banko: false },
  ].filter(c => userRole !== "BANKO" || c.banko);

  const primarySummaryCards = summaryCards.slice(0, 4);
  const secondarySummaryCards = summaryCards.slice(4);

  useLayoutEffect(() => {
    const cached = readMuhasebeCache();
    if (!cached) return;
    setUserRole(cached.userRole);
    setKasaToday(cached.kasaToday);
    setExpenseToday(cached.expenseToday);
    setExpenseMonth(cached.expenseMonth);
    setFirmas(cached.firmas);
    setStockItems(cached.stockItems);
    setTaksitOverdue(cached.taksitOverdue);
    setTrendData(cached.trendData);
    setAlacaklar(cached.alacaklar);
    setAlacakTotal(cached.alacakTotal);
    setPatients(cached.patients);
    setPosDevices(cached.posDevices);
    setTaksitPlans(cached.taksitPlans);
    setReminders(cached.reminders);
    setHakDoctors(cached.taksitDoctors);
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(MUHASEBE_CACHE_KEY, JSON.stringify({
        userRole,
        kasaToday,
        expenseToday,
        expenseMonth,
        firmas,
        stockItems,
        taksitOverdue,
        trendData,
        alacaklar,
        alacakTotal,
        patients,
        posDevices,
        taksitPlans,
        reminders,
        taksitDoctors: hakDoctors,
      }));
    } catch {
      // Cache başarısız olsa da sayfa çalışmaya devam etsin.
    }
  }, [
    userRole,
    kasaToday,
    expenseToday,
    expenseMonth,
    firmas,
    stockItems,
    taksitOverdue,
    trendData,
    alacaklar,
    alacakTotal,
    patients,
    posDevices,
    taksitPlans,
    reminders,
    hakDoctors,
  ]);

  const loadDoctorFinance = useCallback(async (id: string) => {
    if (!id) { setDoctorFinance(null); return; }
    setHakLoading(true);
    const ms = new Date(); ms.setDate(1);
    const from = ms.toISOString().split("T")[0]; const to = new Date().toISOString().split("T")[0];
    const r = await fetch(`/api/finance?doctorId=${id}&from=${from}&to=${to}`);
    setDoctorFinance(await r.json()); setHakLoading(false);
  }, []);

  const handleHakOde = async () => {
    if (!selectedDoctor) return;
    if (!hakOdeForm.tutar || Number(hakOdeForm.tutar) <= 0) { showToast("error", "Geçerli bir tutar giriniz"); return; }
    setHakOdeSaving(true);
    const r = await fetch("/api/payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: selectedDoctor, amount: Number(hakOdeForm.tutar), description: hakOdeForm.aciklama || "Hakediş ödemesi" }),
    }).catch(() => null);
    setHakOdeSaving(false);
    if (r?.ok) {
      showToast("success", "Hakediş ödemesi kaydedildi");
      setShowHakOdeModal(false);
      setHakOdeForm({ tutar: "", aciklama: "" });
      loadDoctorFinance(selectedDoctor);
    } else {
      showToast("error", "Ödeme kaydedilemedi");
    }
  };

  useEffect(() => { if (selectedDoctor) loadDoctorFinance(selectedDoctor); }, [selectedDoctor, loadDoctorFinance]);

  // ── Lazy tab data loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "gelir") {
      if (allPayments.length === 0) loadPayments();
    }
    if (activeTab === "gider") {
      if (allExpenses.length === 0) loadExpenses();
      if (giderKats.length === 0) loadGiderKats();
    }
    if (activeTab === "taksit") {
      if (taksitPlans.length === 0) loadTaksitPlans();
      ensurePatients();
    }
    if (activeTab === "alacak") {
      if (alacaklar.length === 0) loadAlacaklar();
    }
    if (activeTab === "hakedis" && hakDoctors.length === 0)
      fetch("/api/staff").then(r => r.json()).then(d => setHakDoctors((Array.isArray(d) ? d : []).filter((u: Doctor) => u.role === "DOKTOR"))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => { if (taksitSubTab === "hatirlatma") loadReminders(); }, [taksitSubTab, loadReminders]);
  useEffect(() => { if (activeTab === "taksit") loadTaksitPlans(); }, [activeTab, loadTaksitPlans]);

  // Başka bir personel ödeme/gider/taksit/borç kaydı ekleyince aktif sekmeyi
  // sessizce (sayfa yenilemeden) tazele.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refreshSummary();
        if (activeTab === "gelir") loadPayments();
        if (activeTab === "gider") { loadExpenses(); loadGiderKats(); }
        if (activeTab === "taksit") loadTaksitPlans();
        if (activeTab === "alacak") loadAlacaklar();
        if (activeTab === "hakedis" && selectedDoctor) loadDoctorFinance(selectedDoctor);
      }, 500);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDoctor]);

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.text}
        </div>
      )}

      {/* Compact Page Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Muhasebe</h1>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Bugün {fmt(kasaToday.total)}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">{taksitOverdue.count} gecikmiş taksit</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => changeTab("taksit")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Taksitler</button>
          <button onClick={() => changeTab("cari")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Cari</button>
          <button onClick={() => changeTab("gider")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Gider</button>
          <Link href="/rapor" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100">Raporlar</Link>
        </div>
      </div>

      {/* KPI Summary */}
      {loading
        ? <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {primarySummaryCards.map(c => (
                <article key={c.label} className={`${c.bg} ${c.border} rounded-2xl border p-4 shadow-sm`}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
                  <p className={`mt-1 text-xl font-black ${c.tone}`}>{c.value}</p>
                </article>
              ))}
            </div>
            <details className="group rounded-2xl border border-slate-100 bg-white shadow-sm" open={userRole === "BANKO"}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
                <span>Diğer finans göstergeleri</span>
                <span className="text-xs font-medium text-slate-400 group-open:hidden">Aç</span>
                <span className="text-xs font-medium text-slate-400 hidden group-open:inline">Kapat</span>
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-2">
                {secondarySummaryCards.map(c => (
                  <article key={c.label} className={`${c.bg} ${c.border} rounded-2xl border p-4`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
                    <p className={`mt-1 text-xl font-black ${c.tone}`}>{c.value}</p>
                  </article>
                ))}
              </div>
            </details>
          </div>
        )
      }

      {/* Alerts */}
      {!loading && (taksitOverdue.count > 0 || supplierDebt > 0 || criticalStock.length > 0) && (
        <div className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-800">Dikkat Gerektiren İşler</p>
          {taksitOverdue.count > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">
              <span><b>{taksitOverdue.count}</b> gecikmiş taksit — {fmt(taksitOverdue.amount)} tahsil edilmeli</span>
              <button onClick={() => changeTab("taksit")} className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold hover:bg-white">Taksit →</button>
            </div>
          )}
          {supplierDebt > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">
              <span>Toplam <b>{fmt(supplierDebt)}</b> tedarikçi borcu bekliyor</span>
              <button onClick={() => changeTab("cari")} className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold hover:bg-white">Cari →</button>
            </div>
          )}
          {criticalStock.length > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-blue-100 px-3 py-2 text-sm text-blue-800">
              <span><b>{criticalStock.length}</b> stok kalemi kritik seviyede</span>
              <Link href="/stok" className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold hover:bg-white">Stok →</Link>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
        <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        {visibleTabs.map(tab => (
          <button key={tab.id} onClick={() => changeTab(tab.id)} title={tab.hint}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: GENEL BAKIŞ
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "genel" && (
        <div className="space-y-5">
          {/* 6 Aylık Trend */}
          {trendData.length > 0 && (() => {
            const maxVal = Math.max(...trendData.map(t => Math.max(t.gelir, t.gider)), 1);
            return (
              <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900">6 Aylık Gelir / Gider Trendi</h2>
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5 text-xs"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />Gelir</span>
                    <span className="flex items-center gap-1.5 text-xs"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" />Gider</span>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  {trendData.map((m, i) => {
                    const gelirH = Math.max(4, Math.round((m.gelir / maxVal) * 120));
                    const giderH = Math.max(4, Math.round((m.gider / maxVal) * 120));
                    const net = m.gelir - m.gider;
                    return (
                      <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden w-40 rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-xl group-hover:block">
                          <p className="font-bold text-slate-800 mb-1">{m.label}</p>
                          <p className="text-emerald-600">Gelir: {fmt(m.gelir)}</p>
                          <p className="text-red-600">Gider: {fmt(m.gider)}</p>
                          <p className={`font-bold ${net >= 0 ? "text-blue-700" : "text-red-700"}`}>Net: {fmt(net)}</p>
                        </div>
                        <div className="flex w-full items-end justify-center gap-0.5">
                          <div className="w-[45%] rounded-t-md bg-emerald-400 transition-all" style={{ height: `${gelirH}px` }} />
                          <div className="w-[45%] rounded-t-md bg-red-400 transition-all" style={{ height: `${giderH}px` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-500">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-black text-slate-900">Bugünün Gelir Akışı</h2>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {(["NAKIT","KREDI_KARTI","HAVALE_EFT"] as const).map(k => (
                <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-bold uppercase text-slate-500">{METHOD_LABELS[k]}</p>
                  <p className="mt-1 text-base font-black text-slate-800">{fmt(kasaToday.byMethod?.[k] || 0)}</p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Yöntem</th>
                  <th className="px-3 py-2 text-left">Hasta</th>
                  <th className="px-3 py-2 text-right">Tutar</th>
                </tr></thead>
                <tbody>
                  {kasaToday.payments.length === 0
                    ? <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Bugün tahsilat yok</td></tr>
                    : kasaToday.payments.slice(0, 8).map(p => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{METHOD_LABELS[p.method] || p.method}</td>
                        <td className="px-3 py-2 text-slate-600">{p.patient?.fullName || p.description || "—"}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(p.amount)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            {kasaToday.payments.length > 8 && (
              <button onClick={() => changeTab("gelir")} className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Tümünü Gör ({kasaToday.payments.length} kayıt)
              </button>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">Bu Ay Giderler</h2>
                <button onClick={() => changeTab("gider")} className="text-xs font-bold text-blue-700 hover:underline">Tümünü Aç</button>
              </div>
              <div className="space-y-2">
                {expenseMonth.expenses.length === 0
                  ? <p className="py-4 text-center text-xs text-slate-400">Bu ay gider kaydı yok</p>
                  : expenseMonth.expenses.slice(0, 5).map(e => (
                    <div key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{e.category}</p>
                        <p className="text-xs text-slate-500">{e.description || "—"}</p>
                      </div>
                      <span className="text-sm font-black text-red-700">{fmt(e.tutar)}</span>
                    </div>
                  ))
                }
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">Tedarikçi Bakiyeleri</h2>
                <button onClick={() => changeTab("cari")} className="text-xs font-bold text-blue-700 hover:underline">Tümünü Aç</button>
              </div>
              <div className="space-y-2">
                {firmas.filter(f => f.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye).slice(0, 4).map(f => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{f.name}</p>
                    <span className="text-sm font-black text-amber-700">{fmt(f.bakiye)}</span>
                  </div>
                ))}
                {firmas.filter(f => f.bakiye > 0).length === 0 && <p className="py-4 text-center text-xs text-slate-400">Açık tedarikçi borcu yok</p>}
              </div>
            </section>
          </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: GELİR / TAHSİLAT
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "gelir" && (
        <div className="space-y-4">
          {!showTahForm ? (
            <button onClick={() => setShowTahForm(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Tahsilat Ekle
            </button>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">Yeni Tahsilat</h2>
                <button onClick={() => setShowTahForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta (isteğe bağlı)</label>
                  <select value={tahForm.patientId} onChange={e => setTahForm(f => ({ ...f, patientId: e.target.value }))} className={INP}>
                    <option value="">— Hasta seçin —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor <span className="text-red-500">*</span></label>
                  <select value={tahForm.doctorId} onChange={e => setTahForm(f => ({ ...f, doctorId: e.target.value }))} className={INP}>
                    <option value="">— Doktor seçin —</option>
                    {taksitDoctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar (₺) *</label>
                  <input type="number" value={tahForm.amount} onChange={e => setTahForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={INP + " text-lg font-bold"} />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                  <div className="flex flex-wrap gap-2">
                    {(["NAKIT","KREDI_KARTI","HAVALE_EFT","MAIL_ORDER","DIGER"] as const).map(m => (
                      <button key={m} type="button" onClick={() => setTahForm(f => ({ ...f, method: m, posId: "" }))}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${tahForm.method === m ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                        {m === "NAKIT" ? "Nakit" : m === "KREDI_KARTI" ? "Kart" : m === "HAVALE_EFT" ? "Havale" : m === "MAIL_ORDER" ? "Mail Order" : "Diğer"}
                      </button>
                    ))}
                  </div>
                  {(tahForm.method === "KREDI_KARTI" || tahForm.method === "MAIL_ORDER") && (
                    <select value={tahForm.posId} onChange={e => setTahForm(f => ({ ...f, posId: e.target.value }))} className={INP + " mt-2"}>
                      <option value="">— POS Cihazı Seçin —</option>
                      {posDevices.length === 0
                        ? <option disabled>Kayıtlı POS cihazı yok</option>
                        : posDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <input value={tahForm.description} onChange={e => setTahForm(f => ({ ...f, description: e.target.value }))} placeholder="Tedavi türü, notlar…" className={INP} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowTahForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={submitTahsilat} disabled={tahSaving} className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {tahSaving ? "Kaydediliyor…" : "Tahsilat Kaydet"}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="mr-auto text-sm font-black text-slate-900">Tahsilat Kayıtları</h2>
              <input placeholder="Hasta / açıklama ara…" value={pmtSearch} onChange={e => setPmtSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-400" />
              <input type="date" value={pmtFrom} onChange={e => setPmtFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none" />
              <input type="date" value={pmtTo}   onChange={e => setPmtTo(e.target.value)}   className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none" />
              <button onClick={() => {
                const rows = [["Tarih","Hasta","Yöntem","Açıklama","Tutar"], ...filteredPayments.map(p => [fmtDate(p.createdAt), p.patient?.fullName || "", METHOD_LABELS[p.method] || p.method, p.description || "", String(p.amount)])];
                const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv); a.download = "tahsilatlar.csv"; a.click();
              }} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                ↓ CSV
              </button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
              {(["NAKIT","KREDI_KARTI","HAVALE_EFT","MAIL_ORDER"] as const).map(m => {
                const total = filteredPayments.filter(p => p.method === m).reduce((s, p) => s + Number(p.amount), 0);
                return (
                  <div key={m} className="px-4 py-3">
                    <p className="text-xs font-bold uppercase text-slate-500">{METHOD_LABELS[m]}</p>
                    <p className="mt-0.5 text-base font-black text-slate-800">{fmt(total)}</p>
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Hasta</th>
                  <th className="px-4 py-3 text-left">Yöntem</th>
                  <th className="px-4 py-3 text-left">Açıklama</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0
                    ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                    : filteredPayments.slice(0, 150).map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-400">{fmtDate(p.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{p.patient?.fullName || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{METHOD_LABELS[p.method] || p.method}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{p.description || "—"}</td>
                        <td className="px-4 py-3 text-right font-black text-emerald-700">{fmt(p.amount)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
              <span className="text-xs text-slate-500">{filteredPayments.length} kayıt</span>
              <span className="text-sm font-black text-emerald-700">{fmt(filteredPayments.reduce((s, p) => s + Number(p.amount), 0))} toplam</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: GİDER
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "gider" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {!showGiderForm && (
              <button onClick={() => setShowGiderForm(true)}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Gider Ekle
              </button>
            )}
            <button onClick={() => setShowCatMgr(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Kategoriler
            </button>
          </div>

          {showGiderForm && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">Yeni Gider</h2>
                <button onClick={() => setShowGiderForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih *</label>
                  <input type="date" value={giderForm.tarih} onChange={e => setGiderForm(f => ({ ...f, tarih: e.target.value }))} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Kategori *</label>
                  <select value={giderForm.categoryId} onChange={e => {
                    const cat = giderKats.find(c => c.id === e.target.value);
                    setGiderForm(f => ({ ...f, categoryId: e.target.value, category: cat?.name || "" }));
                  }} className={INP}>
                    <option value="">— Kategori seçin —</option>
                    {giderKats.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__manual">Manuel Gir…</option>
                  </select>
                  {giderForm.categoryId === "__manual" && (
                    <input value={giderForm.category} onChange={e => setGiderForm(f => ({ ...f, category: e.target.value }))} placeholder="Kategori adı" className={INP + " mt-2"} />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <input value={giderForm.description} onChange={e => setGiderForm(f => ({ ...f, description: e.target.value }))} placeholder="Gider detayı…" className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar (₺) *</label>
                  <input type="number" value={giderForm.tutar} onChange={e => setGiderForm(f => ({ ...f, tutar: e.target.value }))} placeholder="0.00" className={INP + " text-lg font-bold"} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                  <select value={giderForm.yontem} onChange={e => setGiderForm(f => ({ ...f, yontem: e.target.value }))} className={INP}>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Fatura No</label>
                  <input value={giderForm.faturaNo} onChange={e => setGiderForm(f => ({ ...f, faturaNo: e.target.value }))} placeholder="Opsiyonel" className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">KDV Oranı</label>
                  <select value={giderForm.kdvOrani} onChange={e => setGiderForm(f => ({ ...f, kdvOrani: e.target.value }))} className={INP}>
                    {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowGiderForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={submitGider} disabled={giderSaving} className="rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                  {giderSaving ? "Kaydediliyor…" : "Gider Kaydet"}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="mr-auto text-sm font-black text-slate-900">Gider Kayıtları</h2>
              <input placeholder="Kategori / açıklama ara…" value={expSearch} onChange={e => setExpSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-red-400" />
              <input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none" />
              <input type="date" value={expTo}   onChange={e => setExpTo(e.target.value)}   className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none" />
              <button onClick={() => {
                const rows = [["Tarih","Kategori","Açıklama","Yöntem","KDV","Fatura No","Tutar"], ...filteredExpenses.map(e => [fmtDate(e.tarih), e.category, e.description || "", METHOD_LABELS[e.yontem || ""] || "", e.kdvOrani != null ? `%${e.kdvOrani}` : "", e.faturaNo || "", String(e.tutar)])];
                const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv); a.download = "giderler.csv"; a.click();
              }} className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                ↓ CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Kategori</th>
                  <th className="px-4 py-3 text-left">Açıklama</th>
                  <th className="px-4 py-3 text-left">Yöntem</th>
                  <th className="px-4 py-3 text-center">KDV</th>
                  <th className="px-4 py-3 text-left">Fatura</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0
                    ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                    : filteredExpenses.slice(0, 150).map(e => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-400">{fmtDate(e.tarih)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{e.category}</span>
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-slate-500">{e.description || "—"}</td>
                        <td className="px-4 py-3">{METHOD_LABELS[e.yontem || ""] || e.yontem || "—"}</td>
                        <td className="px-4 py-3 text-center">{e.kdvOrani != null ? `%${e.kdvOrani}` : "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{e.faturaNo || "—"}</td>
                        <td className="px-4 py-3 text-right font-black text-red-700">{fmt(e.tutar)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => deleteGider(e.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700">Sil</button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
              <span className="text-xs text-slate-500">{filteredExpenses.length} kayıt</span>
              <span className="text-sm font-black text-red-700">{fmt(filteredExpenses.reduce((s, e) => s + Number(e.tutar), 0))} toplam</span>
            </div>
          </div>

          {/* Kategori Yönetimi Modal */}
          {showCatMgr && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-base font-black text-slate-900">Gider Kategorileri</h3>
                <div className="flex gap-2">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                    placeholder="Yeni kategori adı…" className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                  <button onClick={handleAddCategory} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Ekle</button>
                </div>
                <div className="max-h-56 space-y-1.5 overflow-y-auto">
                  {giderKats.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <span className={`text-sm ${c.isActive ? "text-slate-700" : "text-slate-400 line-through"}`}>{c.name}</span>
                      <button onClick={async () => {
                        await fetch(`/api/gider-kategorileri/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !c.isActive }) });
                        loadGiderKats();
                      }} className={`text-xs font-semibold ${c.isActive ? "text-red-500" : "text-emerald-600"}`}>
                        {c.isActive ? "Devre Dışı" : "Aktif Et"}
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowCatMgr(false)} className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Kapat</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: TAKSİT / ALACAK
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "taksit" && (
        <div className="space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Toplam Kalan",  value: fmt(taksitKPIs.toplamKalan), color: "text-blue-700",    bg: "bg-blue-50"    },
              { label: "Bekleyen",      value: String(taksitKPIs.bekleyen), color: "text-amber-700",   bg: "bg-amber-50"   },
              { label: "Gecikmiş Plan", value: String(taksitKPIs.geciken),  color: "text-red-700",     bg: "bg-red-50"     },
              { label: "Bugün Vadeli",  value: String(taksitKPIs.bugunVade),color: "text-emerald-700", bg: "bg-emerald-50" },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-2xl border border-slate-100 p-4`}>
                <p className="text-xs font-bold uppercase text-slate-500">{k.label}</p>
                <p className={`mt-0.5 text-xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Borç Yaşlandırma */}
          {(() => {
            const now = new Date();
            const allTaksitler = taksitPlans.flatMap(p => p.taksitler.filter(t => t.kalan > 0 && t.status !== "ODENDI" && t.status !== "IPTAL").map(t => ({ ...t, vade: new Date(t.vadeDate) })));
            const buckets = [
              { label: "Bugün Vadeli",  count: 0, amount: 0, color: "bg-amber-500" },
              { label: "1–30 Gün Geç", count: 0, amount: 0, color: "bg-orange-500" },
              { label: "31–60 Gün",    count: 0, amount: 0, color: "bg-red-500"    },
              { label: "60+ Gün",      count: 0, amount: 0, color: "bg-red-900"    },
              { label: "Gelecek",      count: 0, amount: 0, color: "bg-blue-400"   },
            ];
            for (const t of allTaksitler) {
              const diffDays = Math.floor((now.getTime() - t.vade.getTime()) / 86400000);
              const kalan = Number(t.kalan);
              if (t.vade.toDateString() === now.toDateString())     { buckets[0].count++; buckets[0].amount += kalan; }
              else if (diffDays > 0 && diffDays <= 30)              { buckets[1].count++; buckets[1].amount += kalan; }
              else if (diffDays > 30 && diffDays <= 60)             { buckets[2].count++; buckets[2].amount += kalan; }
              else if (diffDays > 60)                               { buckets[3].count++; buckets[3].amount += kalan; }
              else                                                   { buckets[4].count++; buckets[4].amount += kalan; }
            }
            const totalAmt = buckets.reduce((s, b) => s + b.amount, 0) || 1;
            if (allTaksitler.length === 0) return null;
            return (
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-black text-slate-800">Alacak Yaşlandırma Tablosu</p>
                <div className="mb-2 flex h-4 overflow-hidden rounded-full">
                  {buckets.map(b => b.amount > 0 && <div key={b.label} className={`${b.color} transition-all`} style={{ width: `${(b.amount / totalAmt) * 100}%` }} />)}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {buckets.map(b => (
                    <div key={b.label} className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                      <div className={`mx-auto mb-1 h-2 w-2 rounded-full ${b.color}`} />
                      <p className="text-xs font-semibold text-slate-500">{b.label}</p>
                      <p className="text-xs font-black text-slate-800">{b.count} taksit</p>
                      <p className="text-xs text-slate-600">{fmt(b.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Sub-tabs */}
          <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
            {([
              { key: "liste",      label: "Plan Listesi" },
              { key: "olustur",    label: "Yeni Plan" },
              { key: "hatirlatma", label: `Hatırlatmalar (${reminders.filter(r => r.status === "AKTIF").length})` },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTaksitSubTab(t.key)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${taksitSubTab === t.key ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Plan Listesi */}
          {taksitSubTab === "liste" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap gap-2">
                  <input value={taksitSearch} onChange={e => setTaksitSearch(e.target.value)}
                    placeholder="Hasta, doktor veya plan ara" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400 sm:w-64" />
                  <select value={taksitStatus} onChange={e => setTaksitStatus(e.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="HEPSI">Tüm Durumlar</option>
                    <option value="AKTIF">Aktif</option>
                    <option value="DEVAM_EDIYOR">Devam Ediyor</option>
                    <option value="TAMAMLANDI">Tamamlandı</option>
                    <option value="IPTAL">İptal</option>
                  </select>
                </div>
                {filteredTaksitPlans.length === 0
                    ? <div className="py-10 text-center text-sm text-slate-400">Taksit planı bulunamadı</div>
                    : (
                      <div className="space-y-2">
                        {filteredTaksitPlans.map(plan => {
                          const kalan  = plan.taksitler.reduce((s, t) => s + Number(t.kalan), 0);
                          const gec    = plan.taksitler.filter(t => t.status === "GECIKTI").length;
                          const bek    = plan.taksitler.filter(t => t.status === "BEKLIYOR").length;
                          return (
                            <div key={plan.id} onClick={() => { setSelectedPlan(plan); loadPlanDetail(plan.id); }}
                              className={`cursor-pointer rounded-2xl border p-4 transition-all ${selectedPlan?.id === plan.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-black text-slate-900">{plan.patient.fullName}</span>
                                    {plan.baslik && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{plan.baslik}</span>}
                                    <span className={`rounded-lg px-2 py-1 text-xs font-bold ${TAKSIT_STATUS_BADGE[plan.status]}`}>{plan.status}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                    <span>Dr: {plan.doctor.fullName}</span>
                                    <span>{plan.taksitSayisi} taksit / {PERIODS[plan.period]}</span>
                                    <span className={kalan > 0 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>Kalan: {fmt(kalan)}</span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {gec > 0 && <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-700">{gec} gecikti</span>}
                                  {bek > 0 && <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">{bek} bekliyor</span>}
                                  <button onClick={e => { e.stopPropagation(); cancelPlan(plan.id); }} className="mt-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700">Planı İptal Et</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                }
              </div>

              {/* Plan Detay */}
              {planDetail && (
                <div className="min-w-0">
                  <div className="sticky top-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">Taksit Detayı</h3>
                      <button onClick={() => { setSelectedPlan(null); setPlanDetail(null); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Detayı kapat">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p><b>Hasta:</b> {planDetail.patient.fullName}</p>
                      <p><b>Doktor:</b> {planDetail.doctor.fullName}</p>
                      <p><b>Toplam Borç:</b> {fmt(planDetail.toplamBorc)}</p>
                      {planDetail.pesnat > 0 && <p><b>Peşinat:</b> {fmt(planDetail.pesnat)}</p>}
                      <p><b>Periyot:</b> {PERIODS[planDetail.period]}</p>
                    </div>
                    <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                      {planDetail.taksitler.map(t => (
                        <div key={t.id} className={`rounded-xl border p-3 text-xs ${t.status === "GECIKTI" ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">#{t.siraNo} — {fmtDate(t.vadeDate)}</span>
                            <span className={`rounded-lg px-2 py-1 text-xs font-bold ${TAKSIT_STATUS_BADGE[t.status] ?? ""}`}>{t.status}</span>
                          </div>
                          <div className="mt-0.5 flex justify-between text-slate-500">
                            <span>Tutar: {fmt(t.tutar)}</span>
                            <span>Kalan: <b className={Number(t.kalan) > 0 ? "text-amber-600" : "text-emerald-600"}>{fmt(t.kalan)}</b></span>
                          </div>
                          {t.status !== "ODENDI" && t.status !== "IPTAL" && (
                            <button onClick={() => { setShowOdeModal(t); setOdeForm({ tutar: String(t.kalan), yontem: "NAKIT", note: "" }); }}
                              className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                              Tahsilat Yap
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Yeni Plan Oluştur */}
          {taksitSubTab === "olustur" && (
            <div className="max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-black text-slate-800">Yeni Taksit Planı</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta *</label>
                  <select value={newPlanForm.patientId} onChange={e => setNewPlanForm(f => ({ ...f, patientId: e.target.value }))} className={INP}>
                    <option value="">— Hasta seçin —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor *</label>
                  <select value={newPlanForm.doctorId} onChange={e => setNewPlanForm(f => ({ ...f, doctorId: e.target.value }))} className={INP}>
                    <option value="">— Doktor seçin —</option>
                    {taksitDoctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Başlık</label>
                  <input value={newPlanForm.baslik} onChange={e => setNewPlanForm(f => ({ ...f, baslik: e.target.value }))} placeholder="örn: İmplant" className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Toplam Borç (₺) *</label>
                  <input type="number" value={newPlanForm.toplamBorc} onChange={e => setNewPlanForm(f => ({ ...f, toplamBorc: e.target.value }))} placeholder="0.00" className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Peşinat (₺)</label>
                  <input type="number" value={newPlanForm.pesnat} onChange={e => setNewPlanForm(f => ({ ...f, pesnat: e.target.value }))} placeholder="0.00" className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Taksit Sayısı *</label>
                  <input type="number" min="1" max="60" value={newPlanForm.taksitSayisi} onChange={e => setNewPlanForm(f => ({ ...f, taksitSayisi: e.target.value }))} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Periyot</label>
                  <select value={newPlanForm.period} onChange={e => setNewPlanForm(f => ({ ...f, period: e.target.value }))} className={INP}>
                    {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">İlk Taksit Tarihi</label>
                  <input type="date" value={newPlanForm.startDate} onChange={e => setNewPlanForm(f => ({ ...f, startDate: e.target.value }))} className={INP} />
                </div>
              </div>
              {newPlanForm.toplamBorc && Number(newPlanForm.toplamBorc) > 0 && Number(newPlanForm.taksitSayisi) > 0 && Number(newPlanForm.toplamBorc) > Number(newPlanForm.pesnat || 0) && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                  <p className="font-bold mb-1">Önizleme</p>
                  <p>Kalan borç: {fmt(Number(newPlanForm.toplamBorc) - Number(newPlanForm.pesnat || 0))}</p>
                  <p>Her taksit: {fmt((Number(newPlanForm.toplamBorc) - Number(newPlanForm.pesnat || 0)) / Number(newPlanForm.taksitSayisi))}</p>
                  <p>{newPlanForm.taksitSayisi} taksit × {PERIODS[newPlanForm.period]}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setTaksitSubTab("liste")} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={handleCreatePlan} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Plan Oluştur</button>
              </div>
            </div>
          )}

          {/* Hatırlatmalar */}
          {taksitSubTab === "hatirlatma" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Hatırlatmalar</h2>
                <button onClick={() => setShowRemModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Hatırlatma Ekle</button>
              </div>
              {reminders.length === 0
                ? <div className="py-10 text-center text-sm text-slate-400">Hatırlatma bulunamadı</div>
                : (
                  <div className="space-y-2">
                    {reminders.map(r => {
                      const isPast  = new Date(r.reminderDate) < new Date() && r.status === "AKTIF";
                      const isToday = new Date(r.reminderDate).toDateString() === new Date().toDateString();
                      return (
                        <div key={r.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${isPast ? "border-red-200 bg-red-50" : isToday ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-800">{r.note}</p>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                              {r.patient && <span>Hasta: {r.patient.fullName}</span>}
                              <span>Tarih: {fmtDate(r.reminderDate)}</span>
                              <span className={`rounded px-1.5 py-0.5 font-semibold ${r.status === "AKTIF" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{r.status}</span>
                            </div>
                          </div>
                          {r.status === "AKTIF" && (
                            <button onClick={() => completeReminder(r.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Tamamla</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          )}

          {/* Modal: Taksit Tahsilat */}
          {showOdeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-sm font-black text-slate-900">Taksit Tahsilatı — #{showOdeModal.siraNo}</h3>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                  <p>Vade: {fmtDate(showOdeModal.vadeDate)}</p>
                  <p>Taksit Tutarı: <b>{fmt(showOdeModal.tutar)}</b></p>
                  <p>Kalan: <b className="text-amber-600">{fmt(showOdeModal.kalan)}</b></p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tahsilat Tutarı (₺) *</label>
                  <input type="number" value={odeForm.tutar} onChange={e => setOdeForm(f => ({ ...f, tutar: e.target.value }))} className={INP + " text-lg font-bold"} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                  <select value={odeForm.yontem} onChange={e => setOdeForm(f => ({ ...f, yontem: e.target.value }))} className={INP}>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Not</label>
                  <input value={odeForm.note} onChange={e => setOdeForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsiyonel…" className={INP} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowOdeModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Vazgeç</button>
                  <button onClick={handleOde} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Tahsil Et</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Hatırlatma Ekle */}
          {showRemModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-sm font-black text-slate-900">Hatırlatma Ekle</h3>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta (opsiyonel)</label>
                  <select value={remForm.patientId} onChange={e => setRemForm(f => ({ ...f, patientId: e.target.value }))} className={INP}>
                    <option value="">— Hasta Seçin —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Not *</label>
                  <textarea value={remForm.note} onChange={e => setRemForm(f => ({ ...f, note: e.target.value }))} rows={3} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih *</label>
                  <input type="date" value={remForm.reminderDate} onChange={e => setRemForm(f => ({ ...f, reminderDate: e.target.value }))} className={INP} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRemModal(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Vazgeç</button>
                  <button onClick={handleAddReminder} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Kaydet</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HASTA ALACAKLARI
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "alacak" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">Hasta Alacak Takibi</h2>
              <p className="mt-0.5 text-xs text-slate-500">Tedavi tutarı eksi ödemelerden kalan hasta borçları</p>
            </div>
            <div className="flex gap-2">
              <input placeholder="Hasta / tel ara…" value={alacakSearch} onChange={e => setAlacakSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-400" />
              <button onClick={loadAlacaklar} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">↻ Yenile</button>
              <button onClick={() => {
                const rows = [["Hasta","Tel","Tedavi Toplamı","İndirim","Net Tedavi","Ödenen","Bakiye"], ...filteredAlacaklar.map(a => [a.fullName, a.phone, String(a.brutTedavi), String(a.indirim), String(a.netTedavi), String(a.odenen), String(a.bakiye)])];
                const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                const el = document.createElement("a"); el.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv); el.download = "hasta-alacaklar.csv"; el.click();
              }} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                ↓ CSV
              </button>
            </div>
          </div>

          {/* Özet KPI */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Toplam Alacak</p>
              <p className="mt-1 text-xl font-black text-violet-700">{fmt(alacakTotal)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Borçlu Hasta</p>
              <p className="mt-1 text-xl font-black text-slate-800">{alacaklar.length} kişi</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Ortalama Bakiye</p>
              <p className="mt-1 text-xl font-black text-amber-700">{fmt(alacaklar.length > 0 ? alacakTotal / alacaklar.length : 0)}</p>
            </div>
          </div>

          {alacakLoading
            ? <div className="py-12 text-center text-sm text-slate-400">Hesaplanıyor…</div>
            : (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Hasta</th>
                    <th className="px-4 py-3 text-left">Telefon</th>
                    <th className="px-4 py-3 text-right">Tedavi Toplamı</th>
                    <th className="px-4 py-3 text-right">İndirim</th>
                    <th className="px-4 py-3 text-right">Net Tedavi</th>
                    <th className="px-4 py-3 text-right">Ödenen</th>
                    <th className="px-4 py-3 text-right font-black">Bakiye (Alacak)</th>
                    <th className="px-4 py-3" />
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAlacaklar.length === 0
                      ? <tr><td colSpan={8} className="py-10 text-center text-slate-400">
                          {alacaklar.length === 0 ? "Alacak kaydı bulunamadı" : "Arama sonucu yok"}
                        </td></tr>
                      : filteredAlacaklar.map(a => {
                        const pctOdendi = a.netTedavi > 0 ? Math.min(100, Math.round((a.odenen / a.netTedavi) * 100)) : 0;
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <Link href={`/hasta-detay/${a.id}`} className="font-semibold text-slate-800 hover:text-blue-700 hover:underline">{a.fullName}</Link>
                              {a.discountRate > 0 && <span className="ml-1.5 rounded-lg bg-green-100 px-2 py-1 text-xs text-green-700">%{a.discountRate} indirim</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{a.phone}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{fmt(a.brutTedavi)}</td>
                            <td className="px-4 py-3 text-right text-green-600">{a.indirim > 0 ? `-${fmt(a.indirim)}` : "—"}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(a.netTedavi)}</td>
                            <td className="px-4 py-3 text-right">
                              <div>
                                <span className="font-semibold text-emerald-600">{fmt(a.odenen)}</span>
                                <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pctOdendi}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-black text-violet-700">{fmt(a.bakiye)}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => { setShowTahForm(true); changeTab("gelir"); setTahForm(f => ({ ...f, patientId: a.id })); ensurePatients(); ensurePos(); }}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                                Tahsilat
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
                  <span className="text-xs text-slate-500">{filteredAlacaklar.length} hasta</span>
                  <span className="text-sm font-black text-violet-700">{fmt(filteredAlacaklar.reduce((s, a) => s + a.bakiye, 0))} toplam alacak</span>
                </div>
              </div>
            )
          }
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: TEDARİKÇİ / CARİ
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "cari" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-900">Tedarikçi Cari Hesaplar</h2>
            <div className="flex gap-2">
              <input placeholder="Firma ara…" value={cariSearch} onChange={e => setCariSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
              <Link href="/firma" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Satın Alma / Ödeme</Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Toplam Tedarikçi Borcu", value: fmt(filteredFirmas.reduce((s, f) => s + f.bakiye, 0)), tone: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-100"   },
              { label: "Toplam Alınan",           value: fmt(filteredFirmas.reduce((s, f) => s + f.borc, 0)),  tone: "text-red-700",     bg: "bg-red-50",     border: "border-red-100"     },
              { label: "Toplam Ödenen",           value: fmt(filteredFirmas.reduce((s, f) => s + f.odenen, 0)),tone: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} ${c.border} rounded-2xl border p-4`}>
                <p className="text-xs font-bold uppercase text-slate-500">{c.label}</p>
                <p className={`mt-1 text-xl font-black ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Firma</th>
                <th className="px-4 py-3 text-right">Toplam Alınan</th>
                <th className="px-4 py-3 text-right">Toplam Ödenen</th>
                <th className="px-4 py-3 text-right">Net Bakiye</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFirmas.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Firma bulunamadı</td></tr>
                  : filteredFirmas.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{f.name}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{fmt(f.borc)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(f.odenen)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{fmt(f.bakiye)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${f.bakiye > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {f.bakiye > 0 ? "Borçlu" : "Kapalı"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href="/firma" className="text-xs font-bold text-blue-600 hover:underline">Detay</Link>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HAKEDİŞLER
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "hakedis" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Doktor Hakedişleri</h2>
            <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}
              className="w-52 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Doktor seçin —</option>
              {hakDoctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
            {selectedDoctor && (
              <button onClick={() => setShowHakOdeModal(true)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Hakediş Öde
              </button>
            )}
          </div>
          {!selectedDoctor
            ? <div className="rounded-2xl bg-slate-50 py-16 text-center text-sm text-slate-400">Görüntülemek için bir doktor seçin</div>
            : doctorFinance && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "Toplam Üretim",  value: fmt(Number(doctorFinance.totalTreatments) || 0), tone: "text-blue-700",    bg: "bg-blue-50"    },
                      { label: "Tahsil Edilen",   value: fmt(Number(doctorFinance.received) || 0),        tone: "text-emerald-700", bg: "bg-emerald-50" },
                      { label: "Tahsil Bekleyen", value: fmt(Number(doctorFinance.toReceive) || 0),       tone: "text-amber-700",   bg: "bg-amber-50"   },
                      { label: "Ödenen Hakediş",  value: fmt(Number(doctorFinance.earned) || 0),          tone: "text-slate-900",   bg: "bg-slate-100"  },
                    ].map(c => (
                      <div key={c.label} className={`${c.bg} rounded-2xl p-5`}>
                        <p className="text-xs font-bold uppercase text-slate-500">{c.label}</p>
                        <p className={`mt-1 text-2xl font-black ${c.tone}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  {Array.isArray(doctorFinance.topExaminations) && (doctorFinance.topExaminations as { type: string; count: number }[]).length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <h3 className="text-sm font-black text-slate-900">En Çok Yapılan Tedaviler</h3>
                      </div>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 text-left">Tedavi</th>
                          <th className="px-4 py-3 text-right">Adet</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {(doctorFinance.topExaminations as { type: string; count: number }[]).map(ex => (
                            <tr key={ex.type} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-700">{ex.type}</td>
                              <td className="px-4 py-3 text-right font-black text-slate-900">{ex.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
          }

          {/* Modal: Hakediş Öde */}
          {showHakOdeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-sm font-black text-slate-900">Hakediş Ödemesi</h3>
                <p className="text-xs text-slate-500">
                  {hakDoctors.find(d => d.id === selectedDoctor)?.fullName} için hakediş ödemesi kaydedilecek.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Tutarı (₺) *</label>
                  <input type="number" value={hakOdeForm.tutar} onChange={e => setHakOdeForm(f => ({ ...f, tutar: e.target.value }))} placeholder="0.00" className={INP + " text-lg font-bold"} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <input value={hakOdeForm.aciklama} onChange={e => setHakOdeForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="örn: Mayıs 2026 hakediş" className={INP} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowHakOdeModal(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Vazgeç</button>
                  <button onClick={handleHakOde} disabled={hakOdeSaving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {hakOdeSaving ? "Kaydediliyor…" : "Ödemeyi Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
