"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { ListPager } from "@/components/ui/ListPager";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal, DIRTY_CONFIRM_MESSAGE, DIRTY_CONFIRM_CANCEL_TEXT, DIRTY_CONFIRM_CONFIRM_TEXT } from "@/components/ui/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { Button, IconButton } from "@/components/ui/Button";
import { stripSystemTags } from "@/lib/format-text";
import { useRouter, useSearchParams } from "next/navigation";
import { cachedGet } from "@/lib/client-cache";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { CountUp } from "@/components/ui/CountUp";

const FinanceEmptyIcon = createSceneIllustration("muhasebe", 140);
const StaffEmptyIcon = createSceneIllustration("personel", 140);

// ─── Types ────────────────────────────────────────────────────────────────────
type Payment = {
  id: string; createdAt: string; amount: number; method: string;
  description?: string | null; posId?: string | null;
  patient?: { id: string; fullName: string } | null;
  doctorId?: string | null;
  doctor?: { id: string; fullName: string } | null;
};
type Expense = {
  id: string; tarih: string; category: string; categoryId?: string | null; description?: string | null;
  tutar: number; yontem?: string | null; faturaNo?: string | null; kdvOrani?: number | null;
  doctorId?: string | null; doctor?: { id: string; fullName: string } | null;
};
type GiderKategori = { id: string; name: string; isActive: boolean; isDoctorPayout?: boolean };
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
type Doctor = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean } | null };
// DOKTOR rolü her zaman; YONETICI ise sadece "randevu/hakediş ekranlarında doktor
// olarak görünsün" işaretlenmişse (profile.hideAsDoctor === false) hakediş süreçlerine dahil olur.
const isEffectiveDoctor = (u: Doctor) => u.role === "DOKTOR" || (u.role === "YONETICI" && !u.profile?.hideAsDoctor);
type AlacakRow = {
  id: string;
  fullName: string;
  phone: string;
  brutTedavi: number;
  indirim: number;
  netTedavi: number;
  odenen: number;
  bakiye: number;
  discountRate: number;
  doctorNames?: string[];
  lastPaymentAt?: string | null;
  lastTreatmentAt?: string | null;
  hasActiveTaksitPlan?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MONEY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const fmt = (n: number | string | null | undefined) => MONEY.format(Number(n) || 0);
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; } };
const todayIso = () => new Date().toISOString().split("T")[0];
const stripFinanceTags = (text?: string | null) => stripSystemTags(text).replace(/\s*\[GELIR_TURU:[^\]]+\]/g, "").trim();

const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order", DIGER: "Diğer",
};
// Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir.
const DOCTOR_PAYOUT_METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit", HAVALE_EFT: "Havale/EFT",
};
const POS_REQUIRED_METHODS = new Set(["KREDI_KARTI", "MAIL_ORDER"]);
const requiresPos = (method: string) => POS_REQUIRED_METHODS.has(method);
const AY_ADLARI = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
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
const TAKSIT_STATUS_TONE: Record<string, BadgeTone> = {
  AKTIF: "info",
  DEVAM_EDIYOR: "warning",
  TAMAMLANDI: "success",
  IPTAL: "critical",
  BEKLIYOR: "neutral",
  ODENDI: "success",
  GECIKTI: "critical",
};
// TAKSIT_STATUS_TONE ile aynı ham enum değerlerini (TaksitPlanStatus/TaksitStatus)
// okunaklı Türkçe etikete çevirir — daha önce rozet metni doğrudan ham enum
// değerini ("DEVAM_EDIYOR" gibi) gösteriyordu.
const TAKSIT_STATUS_LABELS: Record<string, string> = {
  AKTIF: "Aktif",
  DEVAM_EDIYOR: "Devam Ediyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
  BEKLIYOR: "Bekliyor",
  ODENDI: "Ödendi",
  GECIKTI: "Gecikti",
};
const REMINDER_STATUS_TONE: Record<string, BadgeTone> = {
  AKTIF: "warning",
  GONDERILIYOR: "info",
  TAMAMLANDI: "success",
  BASARISIZ: "critical",
};
const REMINDER_STATUS_LABELS: Record<string, string> = {
  AKTIF: "Aktif",
  GONDERILIYOR: "Gönderiliyor",
  TAMAMLANDI: "Tamamlandı",
  BASARISIZ: "Başarısız",
};

const INP = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const MUHASEBE_CACHE_KEY = "muhasebe:page:v1";

function readMuhasebeCache() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(MUHASEBE_CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as {
      userRole?: string;
      firmas?: FirmaData[];
      taksitOverdue?: { count: number; amount: number };
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
      firmas: Array.isArray(cached.firmas) ? cached.firmas : [],
      taksitOverdue: cached.taksitOverdue || { count: 0, amount: 0 },
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
  { id: "defter",   label: "Muhasebe Defteri", hint: "Tahsilat ve gider hareketleri" },
  { id: "alacak",   label: "Alacaklar", hint: "Hasta bakiyeleri ve taksitli ödeme planları" },
  { id: "hakedis",  label: "Hakediş",   hint: "Doktor kazanç ve ödeme dökümü" },
] as const;
type VisibleTabId = (typeof TABS)[number]["id"];
type TabId = VisibleTabId;
type TransactionKind = "gelir" | "gider";
type ExpenseEntryKind = "normal" | "firma";

// ─── Arama kutusu + özel stilli açılır liste (native <datalist> yerine) ───────
// Tarayıcının yerli <datalist>'i konumlandırma/stil kontrolü vermiyor ve diğer
// bileşenlerin üzerine taşarak bozuk görünüyordu — bunun yerine input'un hemen
// altında, uygulamanın kendi stiliyle render edilen bir liste kullanılıyor.
function SearchSelect({
  query, onQueryChange, options, onSelect, placeholder, className, emptyText,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: { id: string; label: string }[];
  onSelect: (option: { id: string; label: string }) => void;
  placeholder?: string;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{emptyText || "Sonuç bulunamadı"}</p>
          ) : (
            options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelect(opt); setOpen(false); }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MuhasebePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // URL ?tab= parametresinden başlangıç tab'ı belirle
  // Not: "taksit" eski bağımsız sekmenin adıydı; artık "alacak" sekmesinin bir alt görünümü.
  const initialTab = (): TabId => {
    const t = searchParams.get("tab");
    if (t === "taksit") return "alacak";
    if (t === "genel" || t === "gelir" || t === "gider" || t === "cari") return "defter";
    return t && TABS.some(x => x.id === t) ? (t as TabId) : "defter";
  };

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Tab değişiminde URL'yi güncelle (push değil replace, back history kirlenmez)
  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/muhasebe?tab=${tab}`, { scroll: false });
  }, [router]);
  const showToast = useCallback((type: "success" | "error", text: string, icon?: "finance" | "firma" | "hakediş") => {
    showToastSafe({ message: text, type, icon });
  }, []);

  // ── Summary state ─────────────────────────────────────────────────────────
  // Başlangıçta sessionStorage'dan oku — flash'siz render
  const [userRole,      setUserRole]      = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("dev-preview-role") || "") : ""
  );

  const visibleTabs = useMemo(() => {
    if (userRole === "BANKO") return TABS.filter(tab => tab.id !== "hakedis");
    if (userRole === "DOKTOR" || userRole === "ASISTAN") return TABS.filter(() => false);
    return TABS;
  }, [userRole]);
  const [firmas,        setFirmas]        = useState<FirmaData[]>([]);
  const [taksitOverdue, setTaksitOverdue] = useState<{ count: number; amount: number }>({ count: 0, amount: 0 });

  const refreshSummary = useCallback(async (role?: string) => {
    // İşlem formu için firma seçenekleri ve sekme uyarısı için geciken taksitler.
    const effectiveRole = role || (typeof window !== "undefined" ? (sessionStorage.getItem("dev-preview-role") || "") : "");
    const isBankoRole = effectiveRole === "BANKO";
    const [fr, tr] = await Promise.all([
      !isBankoRole ? fetch("/api/firma", { cache: "no-store" }).then(r => r.json()).catch(() => []) : Promise.resolve([]),
      fetch("/api/taksit-plani?status=GECIKTI", { cache: "no-store" }).then(r => r.json()).catch(() => []),
    ]);
    setFirmas(Array.isArray(fr) ? fr : []);
    if (Array.isArray(tr)) {
      const items = (tr as TaksitPlan[]).flatMap(p => (p.taksitler || []).filter(t => t.status === "GECIKTI"));
      setTaksitOverdue({ count: items.length, amount: items.reduce((s, t) => s + Number(t.kalan || 0), 0) });
    }
  }, []);

  useEffect(() => {
    const syncRole = () => {
      cachedGet<{ role?: string } | null>("/api/auth/me", 60_000)
        .then(d => {
          const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
          if (preview || d?.role) setUserRole(preview || d?.role || "");
        })
        .catch(() => null);
    };

    syncRole();
    fetch("/api/taksit-plani/mark-gecikti", { method: "POST" }).catch(() => null);

    const onPreview = () => syncRole();
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

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
  const [alacakError,    setAlacakError]    = useState("");

  const loadAlacaklar = useCallback(async () => {
    setAlacakLoading(true);
    setAlacakError("");
    try {
      const r = await fetch("/api/muhasebe/alacaklar", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message || "Hasta alacakları yüklenemedi.");
      setAlacaklar(Array.isArray(d?.rows) ? d.rows : []);
      setAlacakTotal(Number(d?.toplamAlacak || 0));
    } catch (error) {
      setAlacaklar([]);
      setAlacakTotal(0);
      setAlacakError(error instanceof Error ? error.message : "Hasta alacakları yüklenemedi.");
    } finally {
      setAlacakLoading(false);
    }
  }, []);

  const filteredAlacaklar = useMemo(() => {
    if (!alacakSearch) return alacaklar;
    const q = alacakSearch.toLowerCase();
    return alacaklar.filter(a =>
      a.fullName.toLowerCase().includes(q) ||
      a.phone.includes(q) ||
      (a.doctorNames || []).some((doctor) => doctor.toLowerCase().includes(q))
    );
  }, [alacaklar, alacakSearch]);

  // ── Shared: patients & pos ────────────────────────────────────────────────
  const [patients,   setPatients]   = useState<PatientOption[]>([]);
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);

  const loadPatientOptions = useCallback((query = "") => {
    const params = new URLSearchParams({
      q: query.trim(),
      take: "20",
      sortBy: "fullName",
      sortDir: "asc",
      summary: "false",
    });
    fetch(`/api/patients?${params.toString()}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => setPatients(Array.isArray(d) ? d : (Array.isArray(d?.patients) ? d.patients : [])))
      .catch(() => {});
  }, []);

  const ensurePatients = useCallback(() => {
    if (patients.length === 0) loadPatientOptions("");
  }, [loadPatientOptions, patients.length]);

  const ensurePos = useCallback(() => {
    fetch("/api/pos-devices").then(r => r.ok ? r.json() : []).then((devs: PosDevice[]) => setPosDevices((devs || []).filter(d => d.isActive))).catch(() => {});
  }, []);

  // Sayfa açılışını hafif tut: hasta listesi işlem formunda arandıkça yüklenir.
  useEffect(() => {
    ensurePos();
    cachedGet<unknown>("/api/staff", 60_000).then(d => setTaksitDoctors((Array.isArray(d) ? d : []).filter(isEffectiveDoctor))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TAB: Gelir / Tahsilat ─────────────────────────────────────────────────
  const [allPayments,  setAllPayments]  = useState<Payment[]>([]);
  const [tahForm,      setTahForm]      = useState({ tarih: todayIso(), patientId: "", doctorId: "", method: "NAKIT", amount: "", description: "", posId: "" });
  const [tahFormErrors, setTahFormErrors] = useState<{ tarih?: string; patientId?: string; doctorId?: string; method?: string; posId?: string; amount?: string }>({});
  const [patientSearch, setPatientSearch] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [tahSaving,    setTahSaving]    = useState(false);
  const tahsilatRequestKeyRef = useRef("");
  const giderRequestKeyRef = useRef("");
  const [ledgerErrors, setLedgerErrors] = useState<{ payments?: string; expenses?: string }>({});

  const loadPayments = useCallback(async () => {
    try {
      const r = await fetch("/api/payments", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message || "Tahsilat kayıtları yüklenemedi.");
      setAllPayments(Array.isArray(d) ? d : []);
      setLedgerErrors((current) => ({ ...current, payments: undefined }));
    } catch (error) {
      setAllPayments([]);
      setLedgerErrors((current) => ({ ...current, payments: error instanceof Error ? error.message : "Tahsilat kayıtları yüklenemedi." }));
    }
  }, []);

  const submitTahsilat = async () => {
    if (tahSaving) return;
    const errors: { tarih?: string; patientId?: string; doctorId?: string; method?: string; posId?: string; amount?: string } = {};
    if (!tahForm.tarih) errors.tarih = "Tarih zorunlu";
    if (!tahForm.patientId) errors.patientId = "Hasta seçimi zorunlu";
    if (!tahForm.doctorId) errors.doctorId = "Doktor seçimi zorunlu";
    if (!tahForm.method) errors.method = "Ödeme yöntemi zorunlu";
    if (requiresPos(tahForm.method) && !tahForm.posId) errors.posId = "Kart / mail order tahsilatı için POS seçimi zorunlu";
    if (!tahForm.amount || Number(tahForm.amount) <= 0) errors.amount = "Geçerli bir tutar giriniz";
    setTahFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const requestKey =
      tahsilatRequestKeyRef.current ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tahsilatRequestKeyRef.current = requestKey;
    setTahSaving(true);
    const payload: Record<string, unknown> = {
      ...tahForm,
      createdAt: tahForm.tarih,
      amount: Number(tahForm.amount),
      description: tahForm.description || null,
    };
    delete payload.tarih;
    if (!requiresPos(String(payload.method || ""))) delete payload.posId;
    if (!payload.posId)     delete payload.posId;
    const r = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setTahSaving(false);
    if (r?.ok) {
      showToast("success", "Tahsilat kaydedildi", "finance");
      setTransactionOpen(false);
      setTahForm({ tarih: todayIso(), patientId: "", doctorId: "", method: "NAKIT", amount: "", description: "", posId: "" });
      setPatientSearch("");
      setDoctorSearch("");
      setTahFormErrors({});
      tahsilatRequestKeyRef.current = "";
      loadPayments(); refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || e?.message || "Tahsilat kaydedilemedi");
    }
  };

  // ── TAB: Gider ────────────────────────────────────────────────────────────
  const [allExpenses,   setAllExpenses]   = useState<Expense[]>([]);
  const [giderKats,     setGiderKats]     = useState<GiderKategori[]>([]);
  const [showCatMgr,    setShowCatMgr]    = useState(false);
  const [newCatName,    setNewCatName]    = useState("");
  const [editingCatNames, setEditingCatNames] = useState<Record<string, string>>({});
  const [giderForm,     setGiderForm]     = useState({
    tarih: new Date().toISOString().split("T")[0],
    categoryId: "", category: "", description: "",
    tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0",
    // Seçilen kategori "Doktor Hakedişi" türündeyse (isDoctorPayout) doldurulur.
    doctorId: "", donem: new Date().toISOString().slice(0, 7),
  });
  const [giderSaving, setGiderSaving] = useState(false);
  const [giderFormErrors, setGiderFormErrors] = useState<{ tarih?: string; tutar?: string; category?: string; doctorId?: string; donem?: string }>({});

  const loadExpenses = useCallback(async () => {
    const m3 = new Date(); m3.setMonth(m3.getMonth() - 3);
    const from = m3.toISOString().split("T")[0];
    const to   = new Date().toISOString().split("T")[0];
    try {
      const r = await fetch(`/api/gider?from=${from}&to=${to}&take=300`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message || "Gider kayıtları yüklenemedi.");
      setAllExpenses(Array.isArray(d?.expenses) ? d.expenses : []);
      setLedgerErrors((current) => ({ ...current, expenses: undefined }));
    } catch (error) {
      setAllExpenses([]);
      setLedgerErrors((current) => ({ ...current, expenses: error instanceof Error ? error.message : "Gider kayıtları yüklenemedi." }));
    }
  }, []);

  const loadGiderKats = useCallback(async () => {
    const r = await fetch("/api/gider-kategorileri", { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      const list: GiderKategori[] = Array.isArray(d) ? d : [];
      setGiderKats(list);
      return list;
    }
    return [] as GiderKategori[];
  }, []);

  const selectedGiderCategory = giderKats.find(c => c.id === giderForm.categoryId);
  const isDoctorPayoutCategory = Boolean(selectedGiderCategory?.isDoctorPayout);

  useEffect(() => {
    if (isDoctorPayoutCategory && !(giderForm.yontem in DOCTOR_PAYOUT_METHOD_LABELS)) {
      setGiderForm(f => ({ ...f, yontem: "NAKIT" }));
    }
  }, [isDoctorPayoutCategory, giderForm.yontem]);

  // Doktor hakedişi ödemesi için: sadece hâlâ borcu olan, tamamlanmış (içinde
  // bulunulan ay hariç) dönemler seçilebilir — geleceğe dönük veya zaten
  // hesabı kapanmış bir ay için ödeme kaydedilemez.
  type PayoutPeriod = { year: number; month: number; kalan: number };
  const [payoutPeriods, setPayoutPeriods] = useState<PayoutPeriod[]>([]);
  const [payoutPeriodsLoading, setPayoutPeriodsLoading] = useState(false);

  useEffect(() => {
    if (!isDoctorPayoutCategory || !giderForm.doctorId) { setPayoutPeriods([]); return; }
    let cancelled = false;
    setPayoutPeriodsLoading(true);
    fetch(`/api/hakedis?doctorId=${giderForm.doctorId}&months=12`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.months) return;
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const payable = (d.months as { year: number; month: number; kalan: number }[])
          .filter(m => `${m.year}-${m.month}` !== currentKey && m.kalan > 0.5);
        setPayoutPeriods(payable);
      })
      .catch(() => { if (!cancelled) setPayoutPeriods([]); })
      .finally(() => { if (!cancelled) setPayoutPeriodsLoading(false); });
    return () => { cancelled = true; };
  }, [isDoctorPayoutCategory, giderForm.doctorId]);

  const selectedPayoutPeriod = payoutPeriods.find(p => `${p.year}-${String(p.month).padStart(2, "0")}` === giderForm.donem);

  const submitGider = async () => {
    const isManualCat = giderForm.categoryId === "__manual" || giderForm.categoryId === "";
    const catValid    = isManualCat ? giderForm.category.trim() !== "" : true;
    const errors: { tarih?: string; tutar?: string; category?: string; doctorId?: string; donem?: string } = {};
    if (!giderForm.tarih) errors.tarih = "Tarih zorunlu";
    if (!giderForm.tutar || Number(giderForm.tutar) <= 0) errors.tutar = "Geçerli bir tutar giriniz";
    if (!catValid) errors.category = "Gider türü zorunlu";
    if (isDoctorPayoutCategory) {
      if (!giderForm.doctorId) errors.doctorId = "Doktor seçimi zorunlu";
      if (!giderForm.donem) errors.donem = "Hakediş dönemi (ay) zorunlu";
      if (!errors.tutar && selectedPayoutPeriod && Number(giderForm.tutar) > selectedPayoutPeriod.kalan + 0.01) {
        errors.tutar = `Tutar, kalan hakedişten (${fmt(selectedPayoutPeriod.kalan)}) fazla olamaz`;
      }
    }
    setGiderFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setGiderSaving(true);
    const realCatId = (giderForm.categoryId && giderForm.categoryId !== "__manual") ? giderForm.categoryId : null;
    const cat = realCatId
      ? giderKats.find(c => c.id === realCatId)?.name || giderForm.category
      : giderForm.category.trim();
    const [payoutYear, payoutMonth] = giderForm.donem.split("-");
    const giderRequestKey =
      giderRequestKeyRef.current ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `gider-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    giderRequestKeyRef.current = giderRequestKey;
    const r = await fetch("/api/gider", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": giderRequestKey },
      body: JSON.stringify({
        tarih: giderForm.tarih, categoryId: realCatId,
        category: cat, description: giderForm.description || null,
        tutar: Number(giderForm.tutar), yontem: giderForm.yontem,
        faturaNo: isDoctorPayoutCategory ? null : (giderForm.faturaNo || null),
        kdvOrani: isDoctorPayoutCategory ? 0 : Number(giderForm.kdvOrani),
        ...(isDoctorPayoutCategory ? {
          doctorId: giderForm.doctorId,
          periodYear: Number(payoutYear),
          periodMonth: Number(payoutMonth),
        } : {}),
      }),
    }).catch(() => null);
    setGiderSaving(false);
    if (r?.ok) {
      giderRequestKeyRef.current = "";
      showToast("success", isDoctorPayoutCategory ? "Hakediş ödemesi kaydedildi" : "Gider kaydedildi", isDoctorPayoutCategory ? "hakediş" : "finance");
      setTransactionOpen(false);
      const payoutDoctorId = giderForm.doctorId;
      setGiderForm({ tarih: new Date().toISOString().split("T")[0], categoryId: "", category: "", description: "", tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0", doctorId: "", donem: new Date().toISOString().slice(0, 7) });
      setGiderTurSearch("");
      setGiderFormErrors({});
      loadExpenses(); refreshSummary();
      if (isDoctorPayoutCategory) {
        setHakedisRefreshToken(t => t + 1);
        if (payoutDoctorId === selectedDoctor) loadDoctorFinance(selectedDoctor);
      }
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || "Gider kaydedilemedi");
    }
  };

  const deleteGider = async (id: string) => {
    if (!(await confirmDialog({
      title: "Gider kaydı silinecek",
      message: "Bu işlem muhasebe geçmişinden gider kaydını kaldırır. Yanlış kayıt düzeltmelerinde açıklamalı yeni kayıt oluşturmanız önerilir. Devam etmek istiyor musunuz?",
      danger: true,
      confirmText: "Gideri Sil",
    }))) return;
    const r = await fetch(`/api/gider/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) { showToast("success", "Gider silindi"); loadExpenses(); refreshSummary(); }
    else showToast("error", "Silme işlemi başarısız");
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const r = await fetch("/api/gider-kategorileri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        showToast("error", err.message || "Gider türü eklenemedi");
        return;
      }
      setNewCatName("");
      loadGiderKats();
    } catch {
      showToast("error", "Bağlantı hatası — gider türü eklenemedi. Lütfen tekrar deneyin.");
    }
  };

  const updateExpenseTypeName = async (id: string, currentName: string) => {
    const name = (editingCatNames[id] ?? currentName).trim();
    if (!name || name === currentName) return;
    const r = await fetch(`/api/gider-kategorileri/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (r?.ok) {
      showToast("success", "Gider türü güncellendi");
      loadGiderKats();
    } else {
      showToast("error", "Gider türü güncellenemedi");
    }
  };

  // ── Unified transaction entry ────────────────────────────────────────────
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [transactionKind, setTransactionKind] = useState<TransactionKind>("gelir");
  const [expenseEntryKind, setExpenseEntryKind] = useState<ExpenseEntryKind>("normal");
  const [firmaPayForm, setFirmaPayForm] = useState({
    firmaId: "",
    tarih: todayIso(),
    tutar: "",
    yontem: "HAVALE_EFT",
    faturaNo: "",
    kdvOrani: "0",
    aciklama: "",
  });
  const [giderTurSearch, setGiderTurSearch] = useState("");
  const [editGiderTurSearch, setEditGiderTurSearch] = useState("");
  const [firmaPayErrors, setFirmaPayErrors] = useState<{ firmaId?: string; tutar?: string; tarih?: string }>({});
  const [firmaPaySaving, setFirmaPaySaving] = useState(false);
  const firmaPaymentRequestKeyRef = useRef("");

  useEffect(() => {
    if (!transactionOpen || transactionKind !== "gelir") return;
    const timer = setTimeout(() => loadPatientOptions(patientSearch), 250);
    return () => clearTimeout(timer);
  }, [loadPatientOptions, patientSearch, transactionKind, transactionOpen]);


  // "İşlem Ekle" birleşik formu — tarih/varsayılan yöntem/oran gibi alanlar
  // her zaman dolu bir varsayılana sahip (bugün, NAKIT, %0 KDV) ve dirty
  // sinyaline dahil EDİLMEZ, aksi halde modal her açılışta "kirli" görünürdü.
  const transactionDirty = transactionOpen && (
    transactionKind === "gelir"
      ? Boolean(tahForm.patientId || tahForm.doctorId || tahForm.amount || tahForm.description.trim() || tahForm.method !== "NAKIT" || tahForm.posId)
      : expenseEntryKind === "firma"
        ? Boolean(firmaPayForm.firmaId || firmaPayForm.tutar || firmaPayForm.faturaNo.trim() || firmaPayForm.aciklama.trim() || firmaPayForm.yontem !== "HAVALE_EFT" || firmaPayForm.kdvOrani !== "0")
        : Boolean(giderForm.categoryId || giderForm.description.trim() || giderForm.tutar || giderForm.faturaNo.trim() || giderForm.doctorId || giderForm.yontem !== "NAKIT")
  );

  async function requestCloseTransaction() {
    if (transactionDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setTransactionOpen(false);
  }

  const openTransaction = useCallback((kind: TransactionKind | "firma" = "gelir") => {
    tahsilatRequestKeyRef.current = "";
    firmaPaymentRequestKeyRef.current = "";
    setTransactionKind(kind === "firma" ? "gider" : kind);
    setExpenseEntryKind(kind === "firma" ? "firma" : "normal");
    setTransactionOpen(true);
    if (kind === "gelir") { ensurePatients(); ensurePos(); }
    if (kind === "gider") loadGiderKats();
    if (kind === "firma") refreshSummary();
  }, [ensurePatients, ensurePos, loadGiderKats, refreshSummary]);

  const submitFirmaPayment = async () => {
    const errors: { firmaId?: string; tutar?: string; tarih?: string } = {};
    if (!firmaPayForm.firmaId) errors.firmaId = "Firma seçimi zorunlu";
    if (!firmaPayForm.tarih) errors.tarih = "Tarih zorunlu";
    if (!firmaPayForm.tutar || Number(firmaPayForm.tutar) <= 0) errors.tutar = "Geçerli bir ödeme tutarı giriniz";
    setFirmaPayErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFirmaPaySaving(true);
    const requestKey =
      firmaPaymentRequestKeyRef.current
      || (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`);
    firmaPaymentRequestKeyRef.current = requestKey;
    const r = await fetch(`/api/firma/${firmaPayForm.firmaId}/islemler`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify({
        tarih: firmaPayForm.tarih,
        islemTipi: "ODEME",
        tutar: Number(firmaPayForm.tutar),
        yontem: firmaPayForm.yontem,
        faturaNo: firmaPayForm.faturaNo || null,
        kdvOrani: Number(firmaPayForm.kdvOrani || 0),
        aciklama: firmaPayForm.aciklama || "Muhasebe merkezinden firma ödemesi",
      }),
    }).catch(() => null);
    setFirmaPaySaving(false);

    if (r?.ok) {
      const result = await r.json().catch(() => null);
      firmaPaymentRequestKeyRef.current = "";
      showToast("success", result?.message || "Firma ödemesi kaydedildi", "firma");
      setTransactionOpen(false);
      setFirmaPayForm({ firmaId: "", tarih: todayIso(), tutar: "", yontem: "HAVALE_EFT", faturaNo: "", kdvOrani: "0", aciklama: "" });
      setFirmaPayErrors({});
      refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || e?.message || "Firma ödemesi kaydedilemedi");
    }
  };

  // ── TAB: Taksit / Alacak ──────────────────────────────────────────────────
  const [taksitPlans,   setTaksitPlans]   = useState<TaksitPlan[]>([]);
  const [taksitSubTab,  setTaksitSubTab]  = useState<"liste" | "olustur" | "hatirlatma">("liste");
  // Alacaklar sekmesi: "Tüm Bakiyeler" (taksit dışı dahil tüm hasta borçları) vs "Taksitli Planlar"
  const [alacakView, setAlacakView] = useState<"bakiye" | "taksit">(() =>
    searchParams.get("tab") === "taksit" ? "taksit" : "bakiye"
  );
  const [taksitLoading, setTaksitLoading] = useState(false);
  const [taksitSearch,  setTaksitSearch]  = useState("");
  const [debouncedTaksitSearch, setDebouncedTaksitSearch] = useState("");
  const [taksitStatus,  setTaksitStatus]  = useState("HEPSI");
  const [taksitPage,      setTaksitPage]      = useState(1);
  const [taksitPageCount, setTaksitPageCount] = useState(1);
  const [taksitTotal,     setTaksitTotal]     = useState(0);
  const [taksitStats, setTaksitStats] = useState({
    geciken: 0, toplamKalan: 0, bekleyen: 0, bugunVade: 0,
    aging4: [] as { key: string; amount: number; count: number }[],
    aging5: [] as { amount: number; count: number }[],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTaksitSearch(taksitSearch.trim());
      setTaksitPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [taksitSearch]);
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


  const patientSearchOptions = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    return patients
      .filter(p => !q || p.fullName.toLowerCase().includes(q))
      .slice(0, 40);
  }, [patientSearch, patients]);

  const doctorSearchOptions = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    return taksitDoctors
      .filter(d => !q || d.fullName.toLowerCase().includes(q))
      .slice(0, 30);
  }, [doctorSearch, taksitDoctors]);

  const expenseTypeOptions = useMemo(() => {
    const q = giderTurSearch.trim().toLowerCase();
    return giderKats
      .filter(c => c.isActive && (!q || c.name.toLowerCase().includes(q)))
      .slice(0, 40);
  }, [giderKats, giderTurSearch]);

  const editExpenseTypeOptions = useMemo(() => {
    const q = editGiderTurSearch.trim().toLowerCase();
    return giderKats
      .filter(c => c.isActive && (!q || c.name.toLowerCase().includes(q)))
      .slice(0, 40);
  }, [editGiderTurSearch, giderKats]);

  const loadTaksitPlans = useCallback(async () => {
    setTaksitLoading(true);
    try {
      const params = new URLSearchParams({ page: String(taksitPage) });
      if (taksitStatus !== "HEPSI") params.set("status", taksitStatus);
      if (debouncedTaksitSearch) params.set("q", debouncedTaksitSearch);
      const r = await fetch(`/api/taksit-plani?${params.toString()}`, { cache: "no-store" });
      if (!r.ok) { showToast("error", "Taksit planları yüklenemedi."); setTaksitPlans([]); return; }
      const d = await r.json();
      setTaksitPlans(Array.isArray(d.items) ? d.items : []);
      setTaksitTotal(d.total || 0);
      setTaksitPageCount(d.pageCount || 1);
      if (d.stats) setTaksitStats(d.stats);
    } finally { setTaksitLoading(false); }
  }, [taksitStatus, debouncedTaksitSearch, taksitPage, showToast]);

  useEffect(() => { setTaksitPage(1); }, [taksitStatus]);

  const loadReminders = useCallback(async () => {
    const r = await fetch("/api/reminder?status=HEPSI", { cache: "no-store" }); const d = await r.json();
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
      showToast("success", "Taksit planı oluşturuldu", "finance");
      setNewPlanForm({ patientId: "", doctorId: "", baslik: "", toplamBorc: "", pesnat: "0", taksitSayisi: "6", period: "AYLIK", startDate: new Date().toISOString().split("T")[0], notes: "" });
      setTaksitSubTab("liste"); loadTaksitPlans(); refreshSummary();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  async function requestCloseOdeModal() {
    const dirty = Boolean(showOdeModal) && (odeForm.yontem !== "NAKIT" || odeForm.note.trim() !== "" || odeForm.tutar !== String(showOdeModal?.kalan ?? ""));
    if (dirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setShowOdeModal(null);
  }

  async function requestCloseRemModal() {
    if (Boolean(remForm.patientId || remForm.note.trim()) && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setShowRemModal(false);
  }

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
      showToast("success", "Taksit tahsil edildi", "finance");
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
    if (!(await confirmDialog({ message: "Bu planı iptal etmek istediğinizden emin misiniz?", danger: true, confirmText: "İptal Et" }))) return;
    const r = await fetch(`/api/taksit-plani/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IPTAL" }) }).catch(() => null);
    if (r?.ok) {
      showToast("success", "Plan iptal edildi");
      loadTaksitPlans();
      if (selectedPlan?.id === id) { setSelectedPlan(null); setPlanDetail(null); }
    } else {
      showToast("error", "İptal işlemi başarısız");
    }
  };

  // KPI ve yaşlandırma verileri artık /api/taksit-plani tarafından sunucuda
  // (tüm eşleşen kayıtlar üzerinden) hesaplanıp `stats` alanında dönüyor —
  // taksitPlans artık sadece geçerli sayfayı içeriyor, tam liste değil.
  const taksitKPIs = taksitStats;

  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerType, setLedgerType] = useState<"HEPSI" | "TAHSILAT" | "GIDER">("HEPSI");
  const [ledgerMethod, setLedgerMethod] = useState("HEPSI");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const LEDGER_PAGE_SIZE = 50;
  const ledgerRows = useMemo(() => {
    // Eski "Hakediş Öde" akışıyla oluşturulmuş (patientId'siz, doctorId'li) Payment
    // kayıtları burada hariç tutulur — bunlar gelir değil, kurumun doktora yaptığı
    // bir ödemedir (artık Gider/doktor hakedişi akışı üzerinden kaydediliyor).
    const gelirRows = allPayments.filter((payment) => payment.patient || !payment.doctorId).map((payment) => ({
      id: `p-${payment.id}`,
      rawId: payment.id,
      date: payment.createdAt,
      type: "TAHSILAT" as const,
      label: "Tahsilat",
      name: payment.patient?.fullName || "Hasta seçilmemiş",
      description: stripFinanceTags(payment.description),
      incomeType: payment.doctor?.fullName ? `Dr. ${payment.doctor.fullName}` : "Hasta Tahsilatı",
      method: METHOD_LABELS[payment.method] || payment.method,
      amount: Number(payment.amount || 0),
      tone: "text-emerald-700",
      sign: "+",
      editable: true,
      deletable: true,
      methodRaw: payment.method,
      source: payment,
    }));
    const giderRows = allExpenses.map((expense) => ({
      id: `e-${expense.id}`,
      rawId: expense.id,
      date: expense.tarih,
      type: "GIDER" as const,
      label: "Gider",
      name: expense.category || "Klinik gideri",
      description: stripFinanceTags(expense.description) || expense.faturaNo || "",
      incomeType: expense.doctor?.fullName ? `Dr. ${expense.doctor.fullName}` : "",
      method: expense.yontem ? (METHOD_LABELS[expense.yontem] || expense.yontem) : "-",
      amount: Number(expense.tutar || 0),
      tone: "text-red-700",
      sign: "-",
      editable: true,
      deletable: true,
      methodRaw: expense.yontem || "NAKIT",
      source: expense,
    }));
    const q = ledgerSearch.trim().toLowerCase();
    return [...gelirRows, ...giderRows]
      .filter((row) => ledgerType === "HEPSI" || row.type === ledgerType)
      .filter((row) => ledgerMethod === "HEPSI" || row.methodRaw === ledgerMethod)
      .filter((row) => {
        const day = row.date.substring(0, 10);
        if (ledgerFrom && day < ledgerFrom) return false;
        if (ledgerTo && day > ledgerTo) return false;
        return true;
      })
      .filter((row) => !q || row.name.toLowerCase().includes(q) || row.description.toLowerCase().includes(q) || row.method.toLowerCase().includes(q) || row.incomeType.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExpenses, allPayments, ledgerFrom, ledgerMethod, ledgerSearch, ledgerTo, ledgerType]);
  useEffect(() => { setLedgerPage(1); }, [ledgerFrom, ledgerMethod, ledgerSearch, ledgerTo, ledgerType]);
  const ledgerPageCount = Math.max(1, Math.ceil(ledgerRows.length / LEDGER_PAGE_SIZE));
  const pagedLedgerRows = useMemo(() => ledgerRows.slice((ledgerPage - 1) * LEDGER_PAGE_SIZE, ledgerPage * LEDGER_PAGE_SIZE), [ledgerRows, ledgerPage]);
  const ledgerError = [ledgerErrors.payments, ledgerErrors.expenses].filter(Boolean).join(" ");

  const [editingKind, setEditingKind] = useState<"TAHSILAT" | "GIDER" | null>(null);
  const [editingId, setEditingId] = useState("");
  const [editPaymentForm, setEditPaymentForm] = useState({ tarih: "", amount: "", method: "NAKIT", description: "", posId: "", doctorId: "" });
  const [editPaymentDoctorSearch, setEditPaymentDoctorSearch] = useState("");
  const editPaymentDoctorOptions = useMemo(() => {
    const q = editPaymentDoctorSearch.trim().toLowerCase();
    return taksitDoctors
      .filter(d => !q || d.fullName.toLowerCase().includes(q))
      .slice(0, 30)
      .map(d => ({ id: d.id, label: d.fullName }));
  }, [editPaymentDoctorSearch, taksitDoctors]);
  const [editExpenseForm, setEditExpenseForm] = useState({
    tarih: "", categoryId: "", category: "", description: "",
    tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0", doctorId: "" as string | null,
  });
  const [editSaving, setEditSaving] = useState(false);
  // Düzenleme modalları mevcut kaydın değerleriyle önceden dolu açılır — API'den
  // gelen ilk değerler yanlışlıkla dirty sayılmamalı, yalnızca kullanıcının
  // GERÇEKTEN değiştirdiği alanlar dirty saymalı (bkz. Modal isDirty sözleşmesi).
  const editPaymentSnapshotRef = useRef("");
  const editExpenseSnapshotRef = useRef("");

  const startEditPayment = (payment: Payment) => {
    ensurePos();
    setEditingKind("TAHSILAT");
    setEditingId(payment.id);
    const next = {
      tarih: payment.createdAt?.substring(0, 10) || todayIso(),
      amount: String(Number(payment.amount || 0)),
      method: payment.method || "NAKIT",
      description: stripFinanceTags(payment.description),
      posId: payment.posId || "",
      doctorId: payment.doctorId || "",
    };
    setEditPaymentForm(next);
    editPaymentSnapshotRef.current = JSON.stringify(next);
    setEditPaymentDoctorSearch(payment.doctor?.fullName || "");
  };

  const startEditExpense = (expense: Expense) => {
    loadGiderKats();
    setEditingKind("GIDER");
    setEditingId(expense.id);
    const next = {
      tarih: expense.tarih?.substring(0, 10) || new Date().toISOString().split("T")[0],
      categoryId: expense.categoryId || "",
      category: expense.category || "",
      description: stripSystemTags(expense.description) || "",
      tutar: String(Number(expense.tutar || 0)),
      yontem: expense.yontem || "NAKIT",
      faturaNo: expense.faturaNo || "",
      kdvOrani: String(expense.kdvOrani ?? 0),
      doctorId: expense.doctorId || null,
    };
    setEditExpenseForm(next);
    editExpenseSnapshotRef.current = JSON.stringify(next);
    setEditGiderTurSearch(expense.category || "");
  };

  const editRecordDirty = editingKind === "TAHSILAT"
    ? JSON.stringify(editPaymentForm) !== editPaymentSnapshotRef.current
    : editingKind === "GIDER"
      ? JSON.stringify(editExpenseForm) !== editExpenseSnapshotRef.current
      : false;

  async function requestCloseEditModal() {
    if (editRecordDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE,
      danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT,
      confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) {
      return;
    }
    setEditingKind(null);
  }

  const savePaymentEdit = async () => {
    if (!editingId) return;
    if (!editPaymentForm.tarih || !editPaymentForm.method || !editPaymentForm.amount || Number(editPaymentForm.amount) <= 0) {
      showToast("error", "Tarih, ödeme yöntemi ve geçerli tahsilat tutarı zorunlu");
      return;
    }
    if (requiresPos(editPaymentForm.method) && !editPaymentForm.posId) {
      showToast("error", "Kart / mail order tahsilatı için POS seçimi zorunlu");
      return;
    }
    setEditSaving(true);
    const r = await fetch(`/api/payments/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(editPaymentForm.amount),
        createdAt: editPaymentForm.tarih,
        method: editPaymentForm.method,
        description: editPaymentForm.description || null,
        posId: requiresPos(editPaymentForm.method) ? (editPaymentForm.posId || null) : null,
        doctorId: editPaymentForm.doctorId || null,
      }),
    }).catch(() => null);
    setEditSaving(false);
    if (r?.ok) {
      showToast("success", "Tahsilat güncellendi");
      setEditingKind(null);
      loadPayments();
      refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.message || "Tahsilat güncellenemedi");
    }
  };

  const saveExpenseEdit = async () => {
    if (!editingId) return;
    if (!editExpenseForm.tarih || !editExpenseForm.tutar || Number(editExpenseForm.tutar) <= 0 || !editExpenseForm.category.trim()) {
      showToast("error", "Tarih, gider türü ve geçerli tutar zorunlu");
      return;
    }
    setEditSaving(true);
    const r = await fetch(`/api/gider/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: editExpenseForm.tarih,
        categoryId: editExpenseForm.categoryId || null,
        category: editExpenseForm.category.trim(),
        description: editExpenseForm.description || null,
        tutar: Number(editExpenseForm.tutar),
        yontem: editExpenseForm.yontem,
        faturaNo: editExpenseForm.doctorId ? null : (editExpenseForm.faturaNo || null),
        kdvOrani: editExpenseForm.doctorId ? 0 : Number(editExpenseForm.kdvOrani || 0),
      }),
    }).catch(() => null);
    setEditSaving(false);
    if (r?.ok) {
      showToast("success", "Gider güncellendi");
      setEditingKind(null);
      loadExpenses();
      refreshSummary();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToast("error", e?.error || "Gider güncellenemedi");
    }
  };

  const deletePayment = async (id: string) => {
    if (!(await confirmDialog({
      title: "Tahsilat iptal edilecek",
      message: "Tahsilatın finansal etkileri geri alınır; denetim geçmişi korunur. Devam etmek istiyor musunuz?",
      danger: true,
      confirmText: "Tahsilatı İptal Et",
    }))) return;
    const r = await fetch(`/api/payments/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) { showToast("success", "Tahsilat iptal edildi"); loadPayments(); refreshSummary(); }
    else showToast("error", "Tahsilat iptal edilemedi");
  };

  const exportRows = useMemo(() => ledgerRows.map(row => ({
    tarih: fmtDate(row.date),
    tip: row.label,
    ad: row.name,
    tur: row.type === "TAHSILAT" ? row.incomeType : row.name,
    aciklama: row.description || "-",
    yontem: row.method,
    tutar: `${row.sign}${fmt(row.amount)}`,
  })), [ledgerRows]);

  const escapeCell = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const exportLedgerExcel = () => {
    const headers = ["Tarih", "Tip", "Ad", "Tür", "Açıklama", "Yöntem", "Tutar"];
    const body = exportRows.map(row => [row.tarih, row.tip, row.ad, row.tur, row.aciklama, row.yontem, row.tutar]);
    const html = `
      <html><head><meta charset="UTF-8" />
      <style>
        table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt;width:100%}
        th{background:#111827;color:#fff;text-align:left;padding:8px;border:1px solid #d1d5db}
        td{padding:7px;border:1px solid #d1d5db;mso-number-format:"\\@";}
        .amount{text-align:right;font-weight:700}
        .title{font-size:16pt;font-weight:700;margin-bottom:10px}
      </style></head><body>
      <div class="title">Muhasebe Defteri</div>
      <table><thead><tr>${headers.map(h => `<th>${escapeCell(h)}</th>`).join("")}</tr></thead>
      <tbody>${body.map(row => `<tr>${row.map((cell, idx) => `<td class="${idx === 6 ? "amount" : ""}">${escapeCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </body></html>`;
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `muhasebe-defteri-${todayIso()}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportLedgerPdf = async () => {
    const { addPdfSection, addPdfTitle, createPdfDoc } = await import("@/lib/pdf-export");
    const doc = createPdfDoc("l");
    addPdfTitle(doc, "Muhasebe Defteri", `Oluşturma tarihi: ${new Date().toLocaleString("tr-TR")} · Kayıt sayısı: ${exportRows.length}`);
    addPdfSection(doc, 28, "Hareketler", ["Tarih", "Tip", "Ad", "Tür", "Açıklama", "Yöntem", "Tutar"],
      exportRows.map(row => [row.tarih, row.tip, row.ad, row.tur, row.aciklama, row.yontem, row.tutar]));
    doc.save(`muhasebe-defteri-${todayIso()}.pdf`);
  };

  // Arama artık /api/taksit-plani?q= ile sunucuda yapılıyor (bkz. debouncedTaksitSearch),
  // bu yüzden taksitPlans zaten arama+durum filtresi uygulanmış ilgili sayfayı içeriyor.
  const filteredTaksitPlans = taksitPlans;

  // ── TAB: Tedarikçi / Cari ─────────────────────────────────────────────────
  // ── TAB: Hakedişler ──────────────────────────────────────────────────────
  const [hakDoctors,     setHakDoctors]     = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [hakedisDoctorSearch, setHakedisDoctorSearch] = useState("");
  const [hakFrom, setHakFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [hakTo, setHakTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [doctorFinance,  setDoctorFinance]  = useState<Record<string, unknown> | null>(null);
  const [hakLoading,     setHakLoading]     = useState(false);
  const [hakedisRefreshToken, setHakedisRefreshToken] = useState(0);
  type HakedisOzetRow = { doctor: { id: string; fullName: string }; ciro: number; hakedilen: number; odenen: number; kalan: number };
  const [hakedisOzet, setHakedisOzet] = useState<HakedisOzetRow[]>([]);
  const [hakedisOzetLoading, setHakedisOzetLoading] = useState(false);
  const lastVisibleRefreshAtRef = useRef(0);

  useLayoutEffect(() => {
    const cached = readMuhasebeCache();
    if (!cached) return;
    setUserRole(cached.userRole);
    setFirmas(cached.firmas);
    setTaksitOverdue(cached.taksitOverdue);
    setAlacaklar(cached.alacaklar);
    setAlacakTotal(cached.alacakTotal);
    setPatients(cached.patients);
    setPosDevices(cached.posDevices);
    setTaksitPlans(cached.taksitPlans);
    setReminders(cached.reminders);
    setHakDoctors(cached.taksitDoctors);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(MUHASEBE_CACHE_KEY, JSON.stringify({
        userRole,
        firmas,
        taksitOverdue,
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
    firmas,
    taksitOverdue,
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
    try {
      const r = await fetch(`/api/finance?doctorId=${id}&from=${hakFrom}&to=${hakTo}`, { cache: "no-store" });
      if (!r.ok) {
        showToast("error", "Doktor hakediş verisi yüklenemedi");
        setDoctorFinance(null);
        return;
      }
      setDoctorFinance(await r.json());
    } catch {
      showToast("error", "Bağlantı hatası — doktor hakediş verisi yüklenemedi.");
      setDoctorFinance(null);
    } finally {
      setHakLoading(false);
    }
  }, [hakFrom, hakTo, showToast]);

  const openDoctorPayoutFor = async (doctorId: string, year: number, month: number, kalan: number) => {
    openTransaction("gider");
    setExpenseEntryKind("normal");
    let kats = await loadGiderKats();
    let payoutCat = kats.find(c => c.isDoctorPayout);
    if (!payoutCat) {
      // İlk hakediş ödemesi için "Doktor Hakedişi" kategorisi henüz yok — burada
      // oluşturuyoruz ki doktor alanı formda hemen görünsün (gider POST'u da zaten
      // aynısını kendiliğinden yapardı, ama burada önceden yaparsak kullanıcı
      // formu açar açmaz doktor seçme alanını görür).
      await fetch("/api/gider-kategorileri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Doktor Hakedişi", isDoctorPayout: true }),
      }).catch(() => null);
      kats = await loadGiderKats();
      payoutCat = kats.find(c => c.isDoctorPayout);
    }
    setGiderTurSearch(payoutCat?.name || "Doktor Hakedişi");
    setGiderForm(f => ({
      ...f,
      tarih: todayIso(),
      categoryId: payoutCat?.id || "",
      category: payoutCat?.name || "Doktor Hakedişi",
      tutar: String(kalan),
      doctorId,
      donem: `${year}-${String(month).padStart(2, "0")}`,
    }));
    setGiderFormErrors({});
  };

  useEffect(() => {
    if (selectedDoctor) loadDoctorFinance(selectedDoctor);
  }, [selectedDoctor, loadDoctorFinance]);

  const loadHakedisOzet = useCallback(async () => {
    setHakedisOzetLoading(true);
    const r = await fetch("/api/hakedis/ozet", { cache: "no-store" }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setHakedisOzet(Array.isArray(d.doctors) ? d.doctors : []); }
    else setHakedisOzet([]);
    setHakedisOzetLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "hakedis" && !selectedDoctor) loadHakedisOzet();
  }, [activeTab, selectedDoctor, hakedisRefreshToken, loadHakedisOzet]);

  useEffect(() => {
    const legacyTab = searchParams.get("tab");
    const requestedAction = searchParams.get("islem");
    const action = requestedAction || legacyTab;
    if (action === "gelir" || action === "gider") {
      openTransaction(action);
      router.replace("/muhasebe?tab=defter", { scroll: false });
    }
    if (action === "cari" || action === "firma") {
      openTransaction("firma");
      router.replace("/muhasebe?tab=defter", { scroll: false });
    }
  }, [openTransaction, router, searchParams]);

  // finans sayfasındaki "+ Ödeme Yap" artık kendi (eski Payment tablosuna
  // yazan) akışını kullanmıyor, doğrudan buraya yönlendiriyor — tek yazma
  // yolu kalsın diye (bkz. denetim raporu Tema 2).
  useEffect(() => {
    const doctorIdParam = searchParams.get("doctorId");
    if (searchParams.get("tab") === "hakedis" && doctorIdParam) {
      setSelectedDoctor(doctorIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Lazy tab data loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "defter") {
      if (allPayments.length === 0) loadPayments();
      if (allExpenses.length === 0) loadExpenses();
      if (giderKats.length === 0) loadGiderKats();
    }
    if (activeTab === "alacak") {
      if (taksitPlans.length === 0) loadTaksitPlans();
      if (alacaklar.length === 0) loadAlacaklar();
      ensurePatients();
    }
    if (activeTab === "hakedis" && hakDoctors.length === 0)
      cachedGet<unknown>("/api/staff", 60_000).then(d => setHakDoctors((Array.isArray(d) ? d : []).filter(isEffectiveDoctor))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => { if (taksitSubTab === "hatirlatma") loadReminders(); }, [taksitSubTab, loadReminders]);
  // Başka bir personel ödeme/gider/taksit/borç kaydı ekleyince aktif sekmeyi
  // sessizce (sayfa yenilemeden) tazele.
  const refreshActiveTab = useCallback(() => {
    if (activeTab === "defter") {
      loadPayments();
      loadExpenses();
      loadGiderKats();
    }
    if (activeTab === "alacak") {
      refreshSummary();
      loadTaksitPlans();
      loadAlacaklar();
    }
    if (activeTab === "hakedis") {
      if (selectedDoctor) loadDoctorFinance(selectedDoctor);
      else loadHakedisOzet();
      setHakedisRefreshToken(t => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDoctor]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshActiveTab, 500);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [refreshActiveTab]);

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastVisibleRefreshAtRef.current < 10_000) return;
      lastVisibleRefreshAtRef.current = Date.now();
      refreshActiveTab();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refreshActiveTab]);

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">

      {/* Toast */}
      {/* Tab Navigation */}
      <div className="sticky top-0 z-30 -mx-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-200 bg-slate-100/95 px-1 py-2 backdrop-blur">
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => changeTab(tab.id)} title={tab.hint}
              className={`ui-view-tab relative shrink-0 rounded-lg px-3 py-2 text-sm font-black transition sm:px-4 ${activeTab === tab.id ? "is-active bg-primary text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-900"}`}>
              {tab.id === "defter" ? (
                <>
                  <span className="sm:hidden">Defter</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : tab.label}
              {(tab.id === "alacak" && taksitOverdue.count > 0) && (
                <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${activeTab === tab.id ? "bg-white" : "bg-red-500"}`} />
              )}
            </button>
          ))}
        </div>
        <Button onClick={() => openTransaction("gelir")} variant="primary" size="sm" icon={Plus}>
          <span className="hidden sm:inline">İşlem Ekle</span>
          <span className="sm:hidden">İşlem</span>
        </Button>
      </div>

      {/* Page Header */}

      <Modal open={transactionOpen} onClose={() => setTransactionOpen(false)} isDirty={transactionDirty} title="İşlem Ekle" size="xl" module="finance">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
              {([
                { id: "gelir", label: "Gelir", disabled: false },
                { id: "gider", label: "Gider", disabled: userRole === "BANKO" },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    openTransaction(item.id);
                    if (item.id === "gider") setExpenseEntryKind("normal");
                  }}
                  className={`h-8 rounded-lg px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    transactionKind === item.id
                      ? "bg-primary text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
          </div>

          {transactionKind === "gelir" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih <span className="text-red-500">*</span></label>
                <input type="date" value={tahForm.tarih} onChange={e => { setTahForm(f => ({ ...f, tarih: e.target.value })); setTahFormErrors(er => ({ ...er, tarih: undefined })); }} className={INP + (tahFormErrors.tarih ? " border-red-400" : "")} />
                {tahFormErrors.tarih && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.tarih}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta <span className="text-red-500">*</span></label>
                <SearchSelect
                  query={patientSearch}
                  onQueryChange={value => {
                    setPatientSearch(value);
                    setTahForm(f => ({ ...f, patientId: "" }));
                    setTahFormErrors(er => ({ ...er, patientId: undefined }));
                  }}
                  options={patientSearchOptions.map(p => ({ id: p.id, label: p.fullName }))}
                  onSelect={opt => { setPatientSearch(opt.label); setTahForm(f => ({ ...f, patientId: opt.id })); }}
                  placeholder="Hasta adı yazın"
                  emptyText="Hasta bulunamadı"
                  className={INP + (tahFormErrors.patientId ? " border-red-400" : "")}
                />
                {tahFormErrors.patientId && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.patientId}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor <span className="text-red-500">*</span></label>
                <SearchSelect
                  query={doctorSearch}
                  onQueryChange={value => {
                    setDoctorSearch(value);
                    setTahForm(f => ({ ...f, doctorId: "" }));
                    setTahFormErrors(er => ({ ...er, doctorId: undefined }));
                  }}
                  options={doctorSearchOptions.map(d => ({ id: d.id, label: d.fullName }))}
                  onSelect={opt => { setDoctorSearch(opt.label); setTahForm(f => ({ ...f, doctorId: opt.id })); }}
                  placeholder="Doktor adı yazın"
                  emptyText="Doktor bulunamadı"
                  className={INP + (tahFormErrors.doctorId ? " border-red-400" : "")}
                />
                {tahFormErrors.doctorId && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.doctorId}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar <span className="text-red-500">*</span></label>
                <input type="number" value={tahForm.amount} onChange={e => { setTahForm(f => ({ ...f, amount: e.target.value })); setTahFormErrors(er => ({ ...er, amount: undefined })); }} placeholder="0,00" className={INP + (tahFormErrors.amount ? " border-red-400" : "")} />
                {tahFormErrors.amount && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.amount}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Yöntemi <span className="text-red-500">*</span></label>
                <select
                  value={tahForm.method}
                  onChange={e => {
                    setTahForm(f => ({ ...f, method: e.target.value, posId: "" }));
                    setTahFormErrors(er => ({ ...er, method: undefined, posId: undefined }));
                  }}
                  className={INP + (tahFormErrors.method ? " border-red-400" : "")}
                >
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {tahFormErrors.method && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.method}</p>}
              </div>
              {requiresPos(tahForm.method) && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">POS <span className="text-red-500">*</span></label>
                  <select value={tahForm.posId} onChange={e => { setTahForm(f => ({ ...f, posId: e.target.value })); setTahFormErrors(er => ({ ...er, posId: undefined })); }} className={INP + (tahFormErrors.posId ? " border-red-400" : "")}>
                  <option value="">POS seçin</option>
                  {posDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {tahFormErrors.posId && <p className="mt-1 text-xs font-medium text-red-600">{tahFormErrors.posId}</p>}
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                <input value={tahForm.description} onChange={e => setTahForm(f => ({ ...f, description: e.target.value }))} placeholder="Tedavi, protokol veya kasa notu" className={INP} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => void requestCloseTransaction()}>İptal</Button>
                <button onClick={submitTahsilat} disabled={tahSaving} className="h-9 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {tahSaving ? "Kaydediliyor..." : "Gelir Kaydet"}
                </button>
              </div>
            </div>
          )}

          {transactionKind === "gider" && expenseEntryKind === "normal" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  <button type="button" onClick={() => setExpenseEntryKind("normal")} className="h-8 rounded-md bg-white px-3 text-xs font-bold text-slate-950 shadow-sm">Normal Gider</button>
                  <button type="button" onClick={() => { setExpenseEntryKind("firma"); refreshSummary(); }} className="h-8 rounded-md px-3 text-xs font-bold text-slate-500 hover:text-slate-800">Firma Ödemesi</button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih <span className="text-red-500">*</span></label>
                <input type="date" value={giderForm.tarih} onChange={e => { setGiderForm(f => ({ ...f, tarih: e.target.value })); setGiderFormErrors(er => ({ ...er, tarih: undefined })); }} className={INP + (giderFormErrors.tarih ? " border-red-400" : "")} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-600">Gider Türü <span className="text-red-500">*</span></label>
                  <button type="button" onClick={() => setShowCatMgr(true)} className="text-xs font-bold text-primary hover:underline">Türleri Yönet</button>
                </div>
                <SearchSelect
                  query={giderTurSearch}
                  onQueryChange={value => {
                    setGiderTurSearch(value);
                    setGiderForm(f => ({ ...f, categoryId: "", category: value, doctorId: "" }));
                    setGiderFormErrors(er => ({ ...er, category: undefined }));
                  }}
                  options={expenseTypeOptions.map(c => ({ id: c.id, label: c.name }))}
                  onSelect={opt => { setGiderTurSearch(opt.label); setGiderForm(f => ({ ...f, categoryId: opt.id, category: opt.label })); }}
                  placeholder="Gider türü yazın (örn. Doktor Hakedişi)"
                  emptyText="Bu isimde tür yok — yeni tür olarak kaydedilecek"
                  className={INP + (giderFormErrors.category ? " border-red-400" : "")}
                />
                {isDoctorPayoutCategory && (
                  <p className="mt-1 text-[11px] font-semibold text-primary">Bu tür bir doktora bağlıdır — aşağıda doktor ve dönem seçin, tutar o doktorun hakedişinden düşülecek.</p>
                )}
              </div>
              {isDoctorPayoutCategory && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor <span className="text-red-500">*</span></label>
                    <select value={giderForm.doctorId} onChange={e => {
                      setGiderForm(f => ({ ...f, doctorId: e.target.value, donem: "", tutar: "" }));
                      setGiderFormErrors(er => ({ ...er, doctorId: undefined, donem: undefined }));
                    }} className={INP + (giderFormErrors.doctorId ? " border-red-400" : "")}>
                      <option value="">Doktor seçin</option>
                      {taksitDoctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                    </select>
                    {giderFormErrors.doctorId && <p className="mt-1 text-xs font-medium text-red-600">{giderFormErrors.doctorId}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Hakediş Dönemi (Ay) <span className="text-red-500">*</span></label>
                    <select
                      value={giderForm.donem}
                      disabled={!giderForm.doctorId || payoutPeriodsLoading}
                      onChange={e => {
                        const donem = e.target.value;
                        const period = payoutPeriods.find(p => `${p.year}-${String(p.month).padStart(2, "0")}` === donem);
                        setGiderForm(f => ({ ...f, donem, tutar: period ? String(period.kalan) : f.tutar }));
                        setGiderFormErrors(er => ({ ...er, donem: undefined, tutar: undefined }));
                      }}
                      className={INP + (giderFormErrors.donem ? " border-red-400" : "")}
                    >
                      <option value="">{payoutPeriodsLoading ? "Yükleniyor…" : "Dönem seçin"}</option>
                      {payoutPeriods.map(p => (
                        <option key={`${p.year}-${p.month}`} value={`${p.year}-${String(p.month).padStart(2, "0")}`}>
                          {AY_ADLARI[p.month - 1]} {p.year} — Kalan: {fmt(p.kalan)}
                        </option>
                      ))}
                    </select>
                    {giderForm.doctorId && !payoutPeriodsLoading && payoutPeriods.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">Bu doktor için ödenecek hakediş yok.</p>
                    )}
                    {giderFormErrors.donem && <p className="mt-1 text-xs font-medium text-red-600">{giderFormErrors.donem}</p>}
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar <span className="text-red-500">*</span></label>
                <input type="number" value={giderForm.tutar} onChange={e => { setGiderForm(f => ({ ...f, tutar: e.target.value })); setGiderFormErrors(er => ({ ...er, tutar: undefined })); }} placeholder="0,00" max={isDoctorPayoutCategory ? selectedPayoutPeriod?.kalan : undefined} className={INP + (giderFormErrors.tutar ? " border-red-400" : "")} />
                {isDoctorPayoutCategory && selectedPayoutPeriod && (
                  <p className="mt-1 text-[11px] text-slate-500">En fazla {fmt(selectedPayoutPeriod.kalan)} ödenebilir.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Yöntem</label>
                <select value={giderForm.yontem} onChange={e => setGiderForm(f => ({ ...f, yontem: e.target.value }))} className={INP}>
                  {Object.entries(isDoctorPayoutCategory ? DOCTOR_PAYOUT_METHOD_LABELS : METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {isDoctorPayoutCategory && (
                  <p className="mt-1 text-[11px] text-slate-500">Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir.</p>
                )}
              </div>
              {!isDoctorPayoutCategory && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">KDV</label>
                    <select value={giderForm.kdvOrani} onChange={e => setGiderForm(f => ({ ...f, kdvOrani: e.target.value }))} className={INP}>
                      {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>%{o.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Fatura No</label>
                    <input value={giderForm.faturaNo} onChange={e => setGiderForm(f => ({ ...f, faturaNo: e.target.value }))} className={INP} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                <input value={giderForm.description} onChange={e => setGiderForm(f => ({ ...f, description: e.target.value }))} placeholder="Gider detayı" className={INP} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => void requestCloseTransaction()}>İptal</Button>
                <button onClick={submitGider} disabled={giderSaving} className="h-9 rounded-lg bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                  {giderSaving ? "Kaydediliyor..." : (isDoctorPayoutCategory ? "Hakediş Ödemesi Kaydet" : "Gider Kaydet")}
                </button>
              </div>
              {(giderFormErrors.tarih || giderFormErrors.category || giderFormErrors.tutar) && (
                <p className="sm:col-span-2 text-xs font-medium text-red-600">{giderFormErrors.tarih || giderFormErrors.category || giderFormErrors.tutar}</p>
              )}
            </div>
          )}

          {transactionKind === "gider" && expenseEntryKind === "firma" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  <button type="button" onClick={() => setExpenseEntryKind("normal")} className="h-8 rounded-md px-3 text-xs font-bold text-slate-500 hover:text-slate-800">Normal Gider</button>
                  <button type="button" onClick={() => setExpenseEntryKind("firma")} className="h-8 rounded-md bg-white px-3 text-xs font-bold text-slate-950 shadow-sm">Firma Ödemesi</button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Firma <span className="text-red-500">*</span></label>
                <select value={firmaPayForm.firmaId} onChange={e => { setFirmaPayForm(f => ({ ...f, firmaId: e.target.value })); setFirmaPayErrors(er => ({ ...er, firmaId: undefined })); }} className={INP + (firmaPayErrors.firmaId ? " border-red-400" : "")}>
                  <option value="">Firma seçin</option>
                  {firmas.map(f => <option key={f.id} value={f.id}>{f.name} - Bakiye: {fmt(f.bakiye)}</option>)}
                </select>
                {firmaPayErrors.firmaId && <p className="mt-1 text-xs font-medium text-red-600">{firmaPayErrors.firmaId}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih <span className="text-red-500">*</span></label>
                <input type="date" value={firmaPayForm.tarih} onChange={e => { setFirmaPayForm(f => ({ ...f, tarih: e.target.value })); setFirmaPayErrors(er => ({ ...er, tarih: undefined })); }} className={INP + (firmaPayErrors.tarih ? " border-red-400" : "")} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar <span className="text-red-500">*</span></label>
                <input type="number" value={firmaPayForm.tutar} onChange={e => { setFirmaPayForm(f => ({ ...f, tutar: e.target.value })); setFirmaPayErrors(er => ({ ...er, tutar: undefined })); }} placeholder="0,00" className={INP + (firmaPayErrors.tutar ? " border-red-400" : "")} />
                {firmaPayErrors.tutar && <p className="mt-1 text-xs font-medium text-red-600">{firmaPayErrors.tutar}</p>}
                <p className="mt-1 text-[11px] text-slate-500">Ödeme, firmanın en eski açık borçlarından başlayarak otomatik mahsup edilir.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Yöntem</label>
                <select value={firmaPayForm.yontem} onChange={e => setFirmaPayForm(f => ({ ...f, yontem: e.target.value }))} className={INP}>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Fatura No</label>
                <input value={firmaPayForm.faturaNo} onChange={e => setFirmaPayForm(f => ({ ...f, faturaNo: e.target.value }))} className={INP} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">KDV</label>
                <select value={firmaPayForm.kdvOrani} onChange={e => setFirmaPayForm(f => ({ ...f, kdvOrani: e.target.value }))} className={INP}>
                  {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>%{o.value}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                <input value={firmaPayForm.aciklama} onChange={e => setFirmaPayForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Ödeme açıklaması" className={INP} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => void requestCloseTransaction()}>İptal</Button>
                <button onClick={submitFirmaPayment} disabled={firmaPaySaving} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60">
                  {firmaPaySaving ? "Kaydediliyor..." : "Firma Ödemesi Kaydet"}
                </button>
              </div>
            </div>
          )}
      </Modal>

      <Modal open={Boolean(editingKind)} onClose={() => setEditingKind(null)} isDirty={editRecordDirty} title={editingKind === "TAHSILAT" ? "Tahsilatı Düzenle" : "Gideri Düzenle"} description="Kayıt değişiklikleri muhasebe geçmişine işlenir." size="lg" module="finance">
            {editingKind === "TAHSILAT" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih</label>
                  <input type="date" value={editPaymentForm.tarih} onChange={e => setEditPaymentForm(f => ({ ...f, tarih: e.target.value }))} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar</label>
                  <input type="number" value={editPaymentForm.amount} onChange={e => setEditPaymentForm(f => ({ ...f, amount: e.target.value }))} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor</label>
                  <SearchSelect
                    query={editPaymentDoctorSearch}
                    onQueryChange={(value) => {
                      setEditPaymentDoctorSearch(value);
                      setEditPaymentForm(f => ({ ...f, doctorId: "" }));
                    }}
                    options={editPaymentDoctorOptions}
                    onSelect={(option) => {
                      setEditPaymentDoctorSearch(option.label);
                      setEditPaymentForm(f => ({ ...f, doctorId: option.id }));
                    }}
                    placeholder="Doktor adı yazın..."
                    emptyText="Doktor bulunamadı"
                    className={INP}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                  <select value={editPaymentForm.method} onChange={e => setEditPaymentForm(f => ({ ...f, method: e.target.value, posId: "" }))} className={INP}>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {requiresPos(editPaymentForm.method) && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">POS</label>
                    <select value={editPaymentForm.posId} onChange={e => setEditPaymentForm(f => ({ ...f, posId: e.target.value }))} className={INP}>
                    <option value="">Yok</option>
                    {posDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <input value={editPaymentForm.description} onChange={e => setEditPaymentForm(f => ({ ...f, description: e.target.value }))} className={INP} />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button variant="secondary" onClick={() => void requestCloseEditModal()}>İptal</Button>
                  <Button variant="primary" onClick={savePaymentEdit} loading={editSaving}>{editSaving ? "Kaydediliyor..." : "Kaydet"}</Button>
                </div>
              </div>
            )}

            {editingKind === "GIDER" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tarih</label>
                  <input type="date" value={editExpenseForm.tarih} onChange={e => setEditExpenseForm(f => ({ ...f, tarih: e.target.value }))} className={INP} />
                </div>
                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-600">Gider Türü</label>
                    <button type="button" onClick={() => setShowCatMgr(true)} className="text-xs font-bold text-primary hover:underline">Türleri Yönet</button>
                  </div>
                  <SearchSelect
                    query={editGiderTurSearch}
                    onQueryChange={value => {
                      setEditGiderTurSearch(value);
                      setEditExpenseForm(f => ({ ...f, categoryId: "", category: value }));
                    }}
                    options={editExpenseTypeOptions.map(c => ({ id: c.id, label: c.name }))}
                    onSelect={opt => { setEditGiderTurSearch(opt.label); setEditExpenseForm(f => ({ ...f, categoryId: opt.id, category: opt.label })); }}
                    emptyText="Bu isimde tür yok — yeni tür olarak kaydedilecek"
                    className={INP}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar</label>
                  <input type="number" value={editExpenseForm.tutar} onChange={e => setEditExpenseForm(f => ({ ...f, tutar: e.target.value }))} className={INP} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Yöntem</label>
                  <select value={editExpenseForm.yontem} onChange={e => setEditExpenseForm(f => ({ ...f, yontem: e.target.value }))} className={INP}>
                    {Object.entries(editExpenseForm.doctorId ? DOCTOR_PAYOUT_METHOD_LABELS : METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {editExpenseForm.doctorId && (
                    <p className="mt-1 text-[11px] text-slate-500">Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir.</p>
                  )}
                </div>
                {!editExpenseForm.doctorId && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">KDV</label>
                      <select value={editExpenseForm.kdvOrani} onChange={e => setEditExpenseForm(f => ({ ...f, kdvOrani: e.target.value }))} className={INP}>
                        {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>%{o.value}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Fatura No</label>
                      <input value={editExpenseForm.faturaNo} onChange={e => setEditExpenseForm(f => ({ ...f, faturaNo: e.target.value }))} className={INP} />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <input value={editExpenseForm.description} onChange={e => setEditExpenseForm(f => ({ ...f, description: e.target.value }))} className={INP} />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button variant="secondary" onClick={() => void requestCloseEditModal()}>İptal</Button>
                  <Button variant="primary" onClick={saveExpenseEdit} loading={editSaving}>{editSaving ? "Kaydediliyor..." : "Kaydet"}</Button>
                </div>
              </div>
            )}
      </Modal>

      <Modal open={showCatMgr} onClose={() => setShowCatMgr(false)} title="Gider Türleri" size="sm" module="finance">
            <div className="flex gap-2">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddCategory()} placeholder="Yeni gider türü" className={INP} />
              <Button onClick={handleAddCategory} variant="primary">Ekle</Button>
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {giderKats.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">Henüz gider türü yok</div>
              ) : giderKats.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-slate-100 p-2">
                  <input
                    value={editingCatNames[item.id] ?? item.name}
                    onChange={e => setEditingCatNames(prev => ({ ...prev, [item.id]: e.target.value }))}
                    onBlur={() => updateExpenseTypeName(item.id, item.name)}
                    onKeyDown={e => e.key === "Enter" && updateExpenseTypeName(item.id, item.name)}
                    className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-primary focus:bg-white"
                  />
                  <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Aktif" : "Pasif"}</Badge>
                  <button
                    onClick={async () => {
                      if (item.isActive && !(await confirmDialog({ message: `"${item.name}" gider türü kaldırılsın mı? Yeni giderlerde seçilemez.`, danger: true, confirmText: "Kaldır" }))) return;
                      await fetch(`/api/gider-kategorileri/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !item.isActive }) });
                      loadGiderKats();
                    }}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    {item.isActive ? "Kaldır" : "Aktif Et"}
                  </button>
                </div>
              ))}
            </div>
      </Modal>

      {activeTab === "defter" && (
        <div className="ui-surface">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center">
            <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
              {([
                { id: "HEPSI", label: "Tümü" },
                { id: "TAHSILAT", label: "Gelir" },
                { id: "GIDER", label: "Gider" },
              ] as const).map((item) => (
                <button key={item.id} onClick={() => setLedgerType(item.id)}
                  className={`h-7 rounded-md px-3 text-xs font-bold ${ledgerType === item.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <input value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Hasta, doktor, gider türü, açıklama veya yöntem ara..." className="h-8 min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-primary focus:bg-white" />
            <input type="date" value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-primary" />
            <input type="date" value={ledgerTo} onChange={e => setLedgerTo(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-primary" />
            <select value={ledgerMethod} onChange={e => setLedgerMethod(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-primary">
              <option value="HEPSI">Tüm yöntemler</option>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button size="sm" variant="secondary" className="h-8" onClick={() => {
              loadPayments();
              loadExpenses();
              refreshSummary();
            }}>Yenile</Button>
            {(ledgerSearch || ledgerFrom || ledgerTo || ledgerMethod !== "HEPSI" || ledgerType !== "HEPSI") && (
              <Button size="sm" variant="secondary" className="h-8" onClick={() => { setLedgerSearch(""); setLedgerFrom(""); setLedgerTo(""); setLedgerMethod("HEPSI"); setLedgerType("HEPSI"); }}>Temizle</Button>
            )}
            <Button size="sm" variant="secondary" className="h-8 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={exportLedgerExcel}>Excel</Button>
            <Button size="sm" variant="secondary" className="h-8 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" onClick={exportLedgerPdf}>PDF</Button>
          </div>

          {ledgerError && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {ledgerError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-[780px] w-full text-xs">
              <thead>
                <tr className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Tip</th>
                  <th className="px-4 py-3 text-left">Ad</th>
                  <th className="px-4 py-3 text-left">Tür</th>
                  <th className="px-4 py-3 text-left">Açıklama</th>
                  <th className="px-4 py-3 text-left">Yöntem</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerRows.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState title="Kayıt bulunamadı" accent="amber" icon={FinanceEmptyIcon} illustrative compact /></td></tr>
                ) : pagedLedgerRows.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${row.label} kaydını düzenle`}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a")) return;
                      row.type === "TAHSILAT"
                        ? startEditPayment(row.source as Payment)
                        : startEditExpense(row.source as Expense);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      row.type === "TAHSILAT"
                        ? startEditPayment(row.source as Payment)
                        : startEditExpense(row.source as Expense);
                    }}
                    className="cursor-pointer transition-colors hover:bg-primary/[0.035] focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(row.date)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={row.type === "TAHSILAT" ? "success" : "critical"}>{row.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-slate-600">{row.type === "TAHSILAT" ? row.incomeType : row.name}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-slate-500">{row.description || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.method}</td>
                    <td className={`px-4 py-3 text-right font-black ${row.tone}`}>{row.sign}{fmt(row.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <IconButton
                          icon={Pencil}
                          title="Düzenle"
                          tone="neutral"
                          onClick={() => row.type === "TAHSILAT" ? startEditPayment(row.source as Payment) : startEditExpense(row.source as Expense)}
                        />
                        {row.deletable && (
                          <IconButton
                            icon={Trash2}
                            title="Sil"
                            tone="danger"
                            onClick={() => row.type === "TAHSILAT" ? deletePayment(row.rawId) : deleteGider(row.rawId)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPager page={ledgerPage} pageCount={ledgerPageCount} pageSize={LEDGER_PAGE_SIZE} total={ledgerRows.length} onPageChange={setLedgerPage} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: ALACAKLAR (Tüm Bakiyeler + Taksitli Planlar)
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "alacak" && (
        <div className="space-y-4">
          {/* Alt sekme: Tüm Bakiyeler / Taksitli Planlar */}
          <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
            <button onClick={() => setAlacakView("bakiye")}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${alacakView === "bakiye" ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              Tüm Bakiyeler
            </button>
            <button onClick={() => setAlacakView("taksit")}
              className={`relative rounded-xl px-4 py-2 text-sm font-bold transition ${alacakView === "taksit" ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              Taksitli Planlar
              {taksitOverdue.count > 0 && (
                <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${alacakView === "taksit" ? "bg-white" : "bg-red-500"}`} />
              )}
            </button>
          </div>

      {alacakView === "taksit" && (
        <div className="space-y-4">
          {/* KPI */}
          <div className="ui-surface grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: "Toplam Kalan",  value: taksitKPIs.toplamKalan, money: true,  color: "text-primary"    },
              { label: "Bekleyen",      value: taksitKPIs.bekleyen,    money: false, color: "text-amber-700"   },
              { label: "Gecikmiş Plan", value: taksitKPIs.geciken,     money: false, color: "text-red-700"     },
              { label: "Bugün Vadeli",  value: taksitKPIs.bugunVade,   money: false, color: "text-emerald-700" },
            ].map((k, i) => (
              <div key={k.label} className="ui-kpi-in p-4" style={{ ["--row-delay" as string]: `${i * 40}ms` }}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className={`mt-1 text-2xl font-black ${k.color}`}>
                  <CountUp value={k.value} formatter={k.money ? (n) => fmt(n) : undefined} />
                </p>
              </div>
            ))}
          </div>

          {/* Borç Yaşlandırma (sunucuda hesaplanır — bkz. /api/taksit-plani stats.aging5) */}
          {(() => {
            const labels = [
              { label: "Bugün Vadeli",  color: "bg-amber-500" },
              { label: "1–30 Gün Geç", color: "bg-orange-500" },
              { label: "31–60 Gün",    color: "bg-red-500"    },
              { label: "60+ Gün",      color: "bg-red-900"    },
              { label: "Gelecek",      color: "bg-blue-400"   },
            ];
            const buckets = labels.map((meta, i) => ({ ...meta, count: taksitStats.aging5[i]?.count || 0, amount: taksitStats.aging5[i]?.amount || 0 }));
            const totalAmt = buckets.reduce((s, b) => s + b.amount, 0) || 1;
            const totalCount = buckets.reduce((s, b) => s + b.count, 0);
            if (totalCount === 0) return null;
            return (
              <div className="ui-surface p-4">
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
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
            {([
              { key: "liste",      label: "Plan Listesi" },
              { key: "olustur",    label: "Yeni Plan" },
              { key: "hatirlatma", label: `Hatırlatmalar (${reminders.filter(r => r.status === "AKTIF").length})` },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTaksitSubTab(t.key)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${taksitSubTab === t.key ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"}`}>
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
                    placeholder="Hasta, doktor veya plan ara" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 sm:w-64" />
                  <select value={taksitStatus} onChange={e => setTaksitStatus(e.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="HEPSI">Tüm Durumlar</option>
                    <option value="AKTIF">Aktif</option>
                    <option value="DEVAM_EDIYOR">Devam Ediyor</option>
                    <option value="TAMAMLANDI">Tamamlandı</option>
                    <option value="IPTAL">İptal</option>
                  </select>
                </div>
                {filteredTaksitPlans.length === 0
                    ? <EmptyState title="Taksit planı bulunamadı" accent="amber" icon={FinanceEmptyIcon} illustrative compact />
                    : (
                      <div className="space-y-2">
                        {filteredTaksitPlans.map(plan => {
                          const kalan  = plan.taksitler.reduce((s, t) => s + Number(t.kalan), 0);
                          const gec    = plan.taksitler.filter(t => t.status === "GECIKTI").length;
                          const bek    = plan.taksitler.filter(t => t.status === "BEKLIYOR").length;
                          return (
                            <div key={plan.id} onClick={() => { setSelectedPlan(plan); loadPlanDetail(plan.id); }}
                              className={`cursor-pointer rounded-lg border p-4 transition-all ${selectedPlan?.id === plan.id ? "border-primary/40 bg-primary/10" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-black text-slate-900">{plan.patient.fullName}</span>
                                    {plan.baslik && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{plan.baslik}</span>}
                                    <Badge tone={TAKSIT_STATUS_TONE[plan.status] ?? "neutral"}>{TAKSIT_STATUS_LABELS[plan.status] || plan.status}</Badge>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                    <span>Dr: {plan.doctor.fullName}</span>
                                    <span>{plan.taksitSayisi} taksit / {PERIODS[plan.period]}</span>
                                    <span className={kalan > 0 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>Kalan: {fmt(kalan)}</span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {gec > 0 && <span className="ui-badge-pulse rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-700">{gec} gecikti</span>}
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
                {taksitPageCount > 1 && (
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Sayfa {taksitPage} / {taksitPageCount} &nbsp;·&nbsp; Toplam {taksitTotal} plan</p>
                    <div className="flex gap-2">
                      <button onClick={() => setTaksitPage(p => Math.max(1, p - 1))} disabled={taksitPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">← Önceki</button>
                      <button onClick={() => setTaksitPage(p => Math.min(taksitPageCount, p + 1))} disabled={taksitPage === taksitPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">Sonraki →</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Plan Detay */}
              {planDetail && (
                <div className="min-w-0">
                  <div className="ui-surface sticky top-4 space-y-3 p-4">
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
                            <Badge tone={TAKSIT_STATUS_TONE[t.status] ?? "neutral"}>{TAKSIT_STATUS_LABELS[t.status] || t.status}</Badge>
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
            <div className="ui-surface max-w-lg space-y-4 p-6">
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
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary">
                  <p className="font-bold mb-1">Önizleme</p>
                  <p>Kalan borç: {fmt(Number(newPlanForm.toplamBorc) - Number(newPlanForm.pesnat || 0))}</p>
                  <p>Her taksit: {fmt((Number(newPlanForm.toplamBorc) - Number(newPlanForm.pesnat || 0)) / Number(newPlanForm.taksitSayisi))}</p>
                  <p>{newPlanForm.taksitSayisi} taksit × {PERIODS[newPlanForm.period]}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setTaksitSubTab("liste")} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={handleCreatePlan} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary/90">Plan Oluştur</button>
              </div>
            </div>
          )}

          {/* Hatırlatmalar */}
          {taksitSubTab === "hatirlatma" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Hatırlatmalar</h2>
                <button onClick={() => setShowRemModal(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">Hatırlatma Ekle</button>
              </div>
              {reminders.length === 0
                ? <EmptyState title="Hatırlatma bulunamadı" accent="amber" icon={FinanceEmptyIcon} illustrative compact />
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
                              <Badge tone={REMINDER_STATUS_TONE[r.status] || "neutral"} size="sm">{REMINDER_STATUS_LABELS[r.status] || r.status}</Badge>
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
          <Modal
            module="finance"
            open={Boolean(showOdeModal)}
            onClose={() => setShowOdeModal(null)}
            isDirty={Boolean(showOdeModal) && (odeForm.yontem !== "NAKIT" || odeForm.note.trim() !== "" || odeForm.tutar !== String(showOdeModal?.kalan ?? ""))}
            title={showOdeModal ? `Taksit Tahsilatı — #${showOdeModal.siraNo}` : "Taksit Tahsilatı"}
            size="sm"
          >
              {showOdeModal && (
                <div className="space-y-4">
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
                  <Button variant="secondary" fullWidth onClick={() => void requestCloseOdeModal()}>Vazgeç</Button>
                  <button onClick={handleOde} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Tahsil Et</button>
                </div>
                </div>
              )}
          </Modal>

          {/* Modal: Hatırlatma Ekle */}
          <Modal
            module="finance"
            open={showRemModal}
            onClose={() => setShowRemModal(false)}
            isDirty={Boolean(remForm.patientId || remForm.note.trim())}
            title="Hatırlatma Ekle"
            size="sm"
          >
                <div className="space-y-4">
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
                  <Button variant="secondary" fullWidth onClick={() => void requestCloseRemModal()}>Vazgeç</Button>
                  <Button variant="primary" fullWidth onClick={handleAddReminder}>Kaydet</Button>
                </div>
                </div>
          </Modal>
        </div>
      )}

      {alacakView === "bakiye" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">Hasta Alacak Takibi</h2>
              <p className="mt-0.5 text-xs text-slate-500">Tedavi tutarı eksi ödemelerden kalan hasta borçları</p>
            </div>
            <div className="flex gap-2">
              <input placeholder="Hasta, telefon veya doktor ara…" value={alacakSearch} onChange={e => setAlacakSearch(e.target.value)} className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-400" />
              <button onClick={loadAlacaklar} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">↻ Yenile</button>
              <button onClick={() => {
                const rows = [["Hasta","Tel","Hekimler","Ödenen","Kalan","Son Hareket"], ...filteredAlacaklar.map(a => [a.fullName, a.phone, (a.doctorNames || []).join(" / "), String(a.odenen), String(a.bakiye), a.lastPaymentAt ? fmtDate(a.lastPaymentAt) : (a.lastTreatmentAt ? fmtDate(a.lastTreatmentAt) : "-")])];
                const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                const el = document.createElement("a"); el.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv); el.download = "hasta-alacaklar.csv"; el.click();
              }} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                ↓ CSV
              </button>
            </div>
          </div>

          {/* Özet KPI */}
          <div className="ui-surface grid grid-cols-3 divide-x divide-slate-100 overflow-hidden">
            <div className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Alacak</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-violet-700">{fmt(alacakTotal)}</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Borçlu Hasta</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-800">{alacaklar.length} kişi</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ortalama Bakiye</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-amber-700">{fmt(alacaklar.length > 0 ? alacakTotal / alacaklar.length : 0)}</p>
            </div>
          </div>

          {alacakLoading
            ? <div className="py-12 text-center text-sm text-slate-400">Hesaplanıyor…</div>
            : alacakError
              ? <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-sm font-semibold text-red-700">{alacakError}</div>
            : (
              <div className="ui-surface overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Hasta</th>
                    <th className="px-4 py-3 text-left">Telefon</th>
                    <th className="px-4 py-3 text-left">Hekimler</th>
                    <th className="px-4 py-3 text-right">Ödenen</th>
                    <th className="px-4 py-3 text-right font-black">Kalan</th>
                    <th className="px-4 py-3 text-left">Son Hareket</th>
                    <th className="px-4 py-3" />
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAlacaklar.length === 0
                      ? <tr><td colSpan={7}>
                          <EmptyState title={alacaklar.length === 0 ? "Alacak kaydı bulunamadı" : "Arama sonucu yok"} accent="amber" icon={FinanceEmptyIcon} illustrative compact />
                        </td></tr>
                      : filteredAlacaklar.map(a => {
                        const pctOdendi = a.netTedavi > 0 ? Math.min(100, Math.round((a.odenen / a.netTedavi) * 100)) : 0;
                        const doctorText = (a.doctorNames || []).length > 0 ? (a.doctorNames || []).join(", ") : "-";
                        const lastDate = a.lastPaymentAt || a.lastTreatmentAt;
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              {userRole === "MUHASEBE"
                                ? <span title="Muhasebe rolü hasta klinik kartına erişemez" className="font-semibold text-slate-800">{a.fullName}</span>
                                : <Link href={`/hasta-detay?id=${a.id}`} className="font-semibold text-slate-800 hover:text-primary hover:underline">{a.fullName}</Link>}
                              {a.discountRate > 0 && <span className="ml-1.5 rounded-lg bg-green-100 px-2 py-1 text-xs text-green-700">%{a.discountRate} indirim</span>}
                              <div className="mt-1 text-[11px] text-slate-400">Net tedavi: {fmt(a.netTedavi)}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{a.phone}</td>
                            <td className="max-w-[260px] px-4 py-3 text-slate-600">
                              <span className="line-clamp-2">{doctorText}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div>
                                <span className="font-semibold text-emerald-600">{fmt(a.odenen)}</span>
                                <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pctOdendi}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-black text-violet-700">{fmt(a.bakiye)}</span>
                              {a.hasActiveTaksitPlan && (
                                <button
                                  onClick={() => setAlacakView("taksit")}
                                  title="Bu hastanın aktif bir taksit planı var — taksit tahsilatları bu tutara yansımaz, gerçek kalan için Taksitli Planlar'a bakın"
                                  className="mt-1 block w-full rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                                >
                                  Taksitli plan var →
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="block font-semibold">{lastDate ? fmtDate(lastDate) : "-"}</span>
                              <span className="text-[11px] text-slate-400">{a.lastPaymentAt ? "Son ödeme" : "Tedavi tarihi"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => {
                                openTransaction("gelir");
                                setPatientSearch(a.fullName);
                                // Hastanın tek bir hekimi varsa doktor alanı da
                                // otomatik doldurulur — önceden her tahsilatta
                                // hasta seçili gelse bile doktor yeniden
                                // aranıyordu (bkz. ürün denetimi).
                                const doctorNames = a.doctorNames || [];
                                const matchedDoctor = doctorNames.length === 1
                                  ? taksitDoctors.find(d => d.fullName === doctorNames[0])
                                  : undefined;
                                if (matchedDoctor) setDoctorSearch(matchedDoctor.fullName);
                                setTahForm(f => ({ ...f, patientId: a.id, doctorId: matchedDoctor?.id || f.doctorId }));
                                ensurePatients(); ensurePos();
                              }}
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
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
                  <span className="text-xs text-slate-500">{filteredAlacaklar.length} hasta</span>
                  <span className="text-sm font-black text-violet-700">{fmt(filteredAlacaklar.reduce((s, a) => s + a.bakiye, 0))} toplam alacak</span>
                </div>
              </div>
            )
          }
        </div>
      )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HAKEDİŞLER
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "hakedis" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-black text-slate-900">Doktor Hakedişleri</h2>
            {selectedDoctor && (
              <button
                onClick={() => { setSelectedDoctor(""); setHakedisDoctorSearch(""); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                ← Tüm Doktorlar
              </button>
            )}
            <div className="w-64">
              <SearchSelect
                query={hakedisDoctorSearch}
                onQueryChange={value => {
                  setHakedisDoctorSearch(value);
                  if (!value) setSelectedDoctor("");
                }}
                options={hakDoctors
                  .filter(d => d.fullName.toLowerCase().includes(hakedisDoctorSearch.toLowerCase()))
                  .map(d => ({ id: d.id, label: d.fullName }))}
                onSelect={opt => { setSelectedDoctor(opt.id); setHakedisDoctorSearch(opt.label); }}
                placeholder="Doktor adı yazın…"
                emptyText="Doktor bulunamadı"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          {!selectedDoctor
            ? (
                <div className="ui-surface overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="text-sm font-black text-slate-900">Genel Bakış — Bu Ay</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Tüm doktorların içinde bulunulan aya ait hakedilen/ödenen/kalan özeti. Detay için bir doktora tıklayın.</p>
                  </div>
                  {hakedisOzetLoading ? (
                    <div className="p-8 text-center text-sm text-slate-400">Yükleniyor…</div>
                  ) : hakedisOzet.length === 0 ? (
                    <EmptyState title="Kayıtlı doktor bulunamadı" accent="amber" icon={StaffEmptyIcon} illustrative compact />
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-xs">
                      <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 text-left">Doktor</th>
                        <th className="px-4 py-3 text-right">Bu Ay Ciro</th>
                        <th className="px-4 py-3 text-right">Hakedilen</th>
                        <th className="px-4 py-3 text-right">Ödenen</th>
                        <th className="px-4 py-3 text-right">Kalan</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {hakedisOzet.map(row => (
                          <tr
                            key={row.doctor.id}
                            onClick={() => { setSelectedDoctor(row.doctor.id); setHakedisDoctorSearch(row.doctor.fullName); }}
                            className="cursor-pointer hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 font-bold text-slate-800">{row.doctor.fullName}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-600">{fmt(row.ciro)}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{fmt(row.hakedilen)}</td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-700">{fmt(row.odenen)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${row.kalan > 0.5 ? "bg-amber-100 text-amber-700" : row.kalan < -0.5 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {fmt(row.kalan)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              )
            : (
                <div className="space-y-4">
                  {doctorFinance && (
                    <div className="grid divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                      {[
                        { label: "Bu Ay Ciro (ay başından bugüne)", value: fmt(Number(doctorFinance.totalTreatments) || 0), tone: "text-primary"      },
                        { label: "Tahsil Edilen",                     value: fmt(Number(doctorFinance.received) || 0),        tone: "text-emerald-700" },
                        { label: "Tahsil Bekleyen",                   value: fmt(Number(doctorFinance.toReceive) || 0),       tone: "text-amber-700"   },
                      ].map(c => (
                        <div key={c.label} className="p-5">
                          <p className="text-xs font-bold uppercase text-slate-500">{c.label}</p>
                          <p className={`mt-1 text-2xl font-black ${c.tone}`}>{c.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <HakedisMonthlyPanel
                    doctorId={selectedDoctor}
                    canPay
                    onPay={openDoctorPayoutFor}
                    refreshToken={hakedisRefreshToken}
                  />

                  {doctorFinance && Array.isArray(doctorFinance.topExaminations) && (doctorFinance.topExaminations as { type: string; count: number }[]).length > 0 && (
                    <div className="ui-surface overflow-hidden">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <h3 className="text-sm font-black text-slate-900">En Çok Yapılan Tedaviler</h3>
                      </div>
                      <div className="overflow-x-auto">
                      <table className="min-w-[320px] w-full text-xs">
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
                    </div>
                  )}
                </div>
              )
          }
        </div>
      )}

    </div>
  );
}
