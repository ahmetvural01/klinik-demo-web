"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TeethMap, ToothButton, ToothStatus as TSType, TOOTH_STATUS_LABELS, TOOTH_STATUS_BADGE } from "@/components/ToothChart";
import PhoneInput from "@/components/PhoneInput";
import { MEDICATION_TEMPLATES } from "@/lib/medications";
import { ACTIVE_PRICE_LIST_STORAGE_KEY, CUSTOM_DENTAL_TREATMENT_TEMPLATES, TDB_2026_CORE_PRICE_CATALOG } from "@/lib/dental-treatment-catalog";

type LabOrder = { id: string; labType: string; status: string; price?: number | null; notes?: string | null; createdAt: string; doctor?: { fullName: string } | null };
type TaksitItem = {
  id: string;
  amount?: number | string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  status: string;
  tutar?: number | string | null;
  vadeDate?: string | null;
  odenen?: number | string | null;
  kalan?: number | string | null;
  odenenAt?: string | null;
};
type TaksitPlan = {
  id: string;
  totalAmount?: number | string | null;
  remainingAmount?: number | string | null;
  toplamBorc?: number | string | null;
  kalanBorc?: number | string | null;
  pesnat?: number | string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  doctor?: { fullName: string } | null;
  taksitler: TaksitItem[];
};
type Patient = {
  id: string; fullName: string; tcNo: string; phone: string; gender: string;
  birthDate?: string | null; insurance?: string | null; discountRate: number;
  referrer?: string | null;
  notes?: string | null; address?: string | null; surgeries?: string | null;
  medications?: string | null; otherDiseases?: string | null; bloodType?: string | null;
  toothChart?: string | null; createdAt: string;
  hasAllergy: boolean; hasHepatitis: boolean; hasKidney: boolean;
  hasDiabetes: boolean; hasHeart: boolean; hasBloodIssue: boolean;
  appointments: Appt[]; examinations: Exam[]; payments: Pay[];
  prescriptions: Rx[]; labOrders: LabOrder[]; taksitPlanlari: TaksitPlan[];
};
type Appt = { id: string; startAt: string; endAt: string; type: string; status: string; doctor?: { fullName: string } };
type Exam = { id: string; treatmentName: string; toothNo?: string | null; amount: string | number; status: string; diagnosedAt: string; doctorId: string; doctor?: { id: string; fullName: string } };
type Pay = { id: string; amount: string | number; method: string; description?: string | null; createdAt: string };
type Rx = { id: string; drugs: string; note?: string | null; createdAt: string };
type StaffLite = { id: string; fullName: string; role: string };
type Tab = "bilgi" | "randevular" | "tedavi" | "odeme" | "recete" | "notlar" | "lab" | "duzenle";
type ToothStatus = TSType;

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: "bilgi", label: "Özet" },
  { key: "randevular", label: "Randevular" },
  { key: "tedavi", label: "Tedavi" },
  { key: "odeme", label: "Finans" },
  { key: "recete", label: "Reçete" },
  { key: "notlar", label: "Notlar" },
  { key: "lab", label: "Laboratuvar" },
  { key: "duzenle", label: "Düzenle" },
];

const isValidTab = (value: string | null): value is Tab => TAB_ITEMS.some(item => item.key === value);

function HastaDetayContent() {
  const search = useSearchParams();
  const id = search.get("id") || "";
  const requestedTab = search.get("tab");
  const [data, setData] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("bilgi");
  const [payMethod, setPayMethod] = useState("NAKIT");
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payPosId, setPayPosId] = useState("");
  const [payDoctorId, setPayDoctorId] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [posDevices, setPosDevices] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [editForm, setEditForm] = useState<Partial<Patient & { birthDate: string }>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  };

  // Recete
  const [rxNote, setRxNote] = useState("");
  const [rxSaving, setRxSaving] = useState(false);

  // Dis semasi
  const [toothMap, setToothMap] = useState<Record<string, ToothStatus>>({});
  const [selectedTool, setSelectedTool] = useState<ToothStatus>("cukur");
  const [toothSaving, setToothSaving] = useState(false);

  // Reçete formu
  const [selectedMedicationId, setSelectedMedicationId] = useState("");
  const [newDrugNote, setNewDrugNote] = useState("");
  const [currentRecipeDrugs, setCurrentRecipeDrugs] = useState<{ name: string; dose: string; usage: string; duration: string; note: string }[]>([]);

  // Tedavi ekleme
  const [newTreatmentName, setNewTreatmentName] = useState("");
  const [newTreatmentTooth, setNewTreatmentTooth] = useState("");
  const [newTreatmentAmount, setNewTreatmentAmount] = useState("");
  const [newTreatmentNote, setNewTreatmentNote] = useState("");
  const [treatmentSaving, setTreatmentSaving] = useState(false);
  // Yazdırma modalleri
  const [treatmentPrintOpen, setTreatmentPrintOpen] = useState(false);
  const [selectedTreatForPrint, setSelectedTreatForPrint] = useState<string[]>([]);
  const [paymentPrintOpen, setPaymentPrintOpen] = useState(false);
  const [selectedPayForPrint, setSelectedPayForPrint] = useState<string[]>([]);
  const [showPricesInPrint, setShowPricesInPrint] = useState(true);
  // Muayene listesi inline düzenleme
  const [examInlineEdits, setExamInlineEdits] = useState<Record<string, {amount: string; doctorId: string}>>({});
  const [selectedDiagnozIds, setSelectedDiagnozIds] = useState<string[]>([]);
  const [bulkConverting, setBulkConverting] = useState(false);
  const [examSavingId, setExamSavingId] = useState<string | null>(null);
  // Tedavi formu - muayene tarzı
  const [priceList, setPriceList] = useState<{id:string;treatment:string;amount:number}[]>([]);
  const [treatDropdownId, setTreatDropdownId] = useState("");
  const [treatCustomAmount, setTreatCustomAmount] = useState("");
  const [treatSelectedTeeth, setTreatSelectedTeeth] = useState<string[]>([]);
  const [treatToothType, setTreatToothType] = useState<"adult"|"child"|"general">("adult");
  const [treatDoctorId, setTreatDoctorId] = useState("");
  const [doctorOptions, setDoctorOptions] = useState<StaffLite[]>([]);
  const [clinicName, setClinicName] = useState("");
  const [activePriceList, setActivePriceList] = useState<"standard" | "custom">("standard");
  const [priceListSourceReady, setPriceListSourceReady] = useState(false);

  // Finans / taksitlendirme
  const [installmentLoading, setInstallmentLoading] = useState(false);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  const [installmentStep, setInstallmentStep] = useState<"borç" | "plan" | "onay">("borç");
  const [installmentForm, setInstallmentForm] = useState({
    toplamBorc: "",
    pesnat: "0",
    taksitSayisi: "3",
    period: "AYLIK" as const,
    startDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });
  const [installmentPreview, setInstallmentPreview] = useState<{date: string; amount: number}[]>([]);

  const toNumber = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const getItemAmount = (item: TaksitItem) => toNumber(item.amount ?? item.tutar);
  const getItemDueDate = (item: TaksitItem) => String(item.dueDate ?? item.vadeDate ?? "");
  const getItemPaidAt = (item: TaksitItem) => String(item.paidAt ?? item.odenenAt ?? "");

  const getPlanTotal = (plan: TaksitPlan) => {
    if (plan.totalAmount !== undefined && plan.totalAmount !== null) return toNumber(plan.totalAmount);
    if (plan.toplamBorc !== undefined && plan.toplamBorc !== null) return toNumber(plan.toplamBorc);
    return (plan.taksitler || []).reduce((sum, item) => sum + getItemAmount(item), 0);
  };

  const getPlanRemaining = (plan: TaksitPlan) => {
    if (plan.remainingAmount !== undefined && plan.remainingAmount !== null) return toNumber(plan.remainingAmount);
    if (plan.kalanBorc !== undefined && plan.kalanBorc !== null) return toNumber(plan.kalanBorc);
    const remainingFromItems = (plan.taksitler || []).reduce((sum, item) => sum + toNumber(item.kalan), 0);
    if (remainingFromItems > 0) return remainingFromItems;
    return Math.max(getPlanTotal(plan) - toNumber(plan.pesnat), 0);
  };

  const syncTabInUrl = (nextTab: Tab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    syncTabInUrl(nextTab);
  };

  const toBirthDateIso = (value?: string | null) => value ? new Date(value + "T00:00:00.000Z").toISOString() : null;

  const updatePatient = async (payload: Record<string, unknown>) => {
    return fetch("/api/patients/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/patients/" + id);
      if (!res.ok) {
        setData(null);
        setLoadError(res.status === 404 ? "Hasta bulunamadı" : "Hasta kartı yüklenemedi");
        return;
      }

      const d = await res.json();
      setData(d);
      setEditForm({
        fullName: d.fullName, tcNo: d.tcNo, phone: d.phone, gender: d.gender,
        address: d.address || "", insurance: d.insurance || "", referrer: d.referrer || "",
        discountRate: d.discountRate, notes: d.notes || "",
        surgeries: d.surgeries || "", medications: d.medications || "",
        otherDiseases: d.otherDiseases || "", bloodType: d.bloodType || "",
        birthDate: d.birthDate ? new Date(d.birthDate).toISOString().slice(0, 10) : "",
        hasAllergy: d.hasAllergy, hasHepatitis: d.hasHepatitis, hasKidney: d.hasKidney,
        hasDiabetes: d.hasDiabetes, hasHeart: d.hasHeart, hasBloodIssue: d.hasBloodIssue
      });
      if (d.toothChart) {
        try { setToothMap(JSON.parse(d.toothChart)); } catch { setToothMap({}); }
      } else {
        setToothMap({});
      }
    } catch {
      setData(null);
      setLoadError("Hasta karti yuklenemedi");
      showToast("error", "Hasta karti yuklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  useEffect(() => {
    if (!isValidTab(requestedTab)) return;
    setTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    const storedPriceList = window.localStorage.getItem(ACTIVE_PRICE_LIST_STORAGE_KEY);
    if (storedPriceList === "standard" || storedPriceList === "custom") setActivePriceList(storedPriceList);

    fetch("/api/pos-devices")
      .then(r => r.ok ? r.json() : [])
      .then((devs: { id: string; name: string; isActive: boolean }[]) => setPosDevices(devs.filter(d => d.isActive)))
      .catch(() => {});

    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setCurrentUserId(d?.id || "");
        if (d?.id) setTreatDoctorId(d.id);
      })
      .catch(() => {});

    fetch("/api/staff")
      .then(r => r.ok ? r.json() : [])
      .then((list: StaffLite[]) => setDoctorOptions((list || []).filter(s => s.role === "DOKTOR" || s.role === "YONETICI")))
      .catch(() => {});

    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (s?.institutionName) setClinicName(s.institutionName);
        if (s?.activePriceList === "standard" || s?.activePriceList === "custom") {
          setActivePriceList(s.activePriceList);
          window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, s.activePriceList);
        }
      })
      .catch(() => {})
      .finally(() => setPriceListSourceReady(true));
  }, []);

  useEffect(() => {
    if (!priceListSourceReady) return;

    let cancelled = false;

    fetch("/api/prices?type=" + activePriceList)
      .then(r => r.ok ? r.json() : [])
      .then((list: {id:string;treatment:string;amount:number}[]) => {
        if (cancelled) return;
        setPriceList(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPriceList([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activePriceList, priceListSourceReady]);

  const addDirectToExaminationList = async (toothNo?: string) => {
    if (!treatDropdownId) return showToast("error", "Önce tedavi seçin");
    if (!treatDoctorId && !currentUserId) return showToast("error", "Önce doktor seçin");

    const fallbackTreatmentPool = activePriceList === "custom" ? CUSTOM_DENTAL_TREATMENT_TEMPLATES : TDB_2026_CORE_PRICE_CATALOG;
    const selected = [...priceList, ...fallbackTreatmentPool].find(p => p.id === treatDropdownId);
    if (!selected) return showToast("error", "Geçerli bir tedavi seçin");

    const payload = {
      patientId: id,
      doctorId: treatDoctorId || currentUserId,
      treatmentName: selected.treatment,
      toothNo: toothNo || undefined,
      amount: treatCustomAmount ? Number(treatCustomAmount) : Number(selected.amount || 0),
      status: "Diagnoz (Ön Teşhis)",
      diagnosedAt: new Date().toISOString(),
      note: newTreatmentNote || undefined
    };

    setTreatmentSaving(true);
    const res = await fetch("/api/examinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setTreatmentSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Muayene kaydı oluşturulamadı");
    }

    if (toothNo) setTreatSelectedTeeth(prev => prev.includes(toothNo) ? prev : [...prev, toothNo]);
    showToast("success", toothNo ? `${toothNo} no'lu diş muayene listesine eklendi` : "Genel muayene listesine eklendi");
    void load();
  };

  const addTreatment = async () => {
    if (!newTreatmentName.trim()) return showToast("error", "Tedavi adı girin");
    if (!newTreatmentAmount || Number(newTreatmentAmount) <= 0) return showToast("error", "Geçerli tedavi tutarı girin");
    if (!currentUserId) return showToast("error", "Kullanıcı doğrulanamadı");

    setTreatmentSaving(true);
    const res = await fetch("/api/examinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: id,
        doctorId: currentUserId,
        treatmentName: newTreatmentName,
        toothNo: newTreatmentTooth || undefined,
        amount: Number(newTreatmentAmount),
        status: "Tedavi (Ücretli)",
        diagnosedAt: new Date().toISOString(),
        note: newTreatmentNote || undefined
      })
    });

    if (res.ok) {
      showToast("success", "Tedavi eklendi");
      setNewTreatmentName("");
      setNewTreatmentTooth("");
      setNewTreatmentAmount("");
      setNewTreatmentNote("");
      void load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.message || "Tedavi eklenemedi");
    }
    setTreatmentSaving(false);
  };

  const generateInstallmentPreview = () => {
    const totalDebt = Number(installmentForm.toplamBorc) || 0;
    const downPayment = Number(installmentForm.pesnat) || 0;
    const remaining = totalDebt - downPayment;
    const installmentCount = Number(installmentForm.taksitSayisi) || 1;
    const perInstallment = remaining / installmentCount;
    
    const daysMap: Record<string, number> = {HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30, IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365};
    const daysDiff = daysMap[installmentForm.period] || 30;
    const startDate = new Date(installmentForm.startDate);
    
    const preview = Array.from({length: installmentCount}, (_, i) => {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (i * daysDiff));
      return {date: dueDate.toISOString().slice(0, 10), amount: perInstallment};
    });
    setInstallmentPreview(preview);
  };

  const createInstallmentPlan = async () => {
    if (!currentUserId) return showToast("error", "Kullanıcı doğrulanamadı");
    const totalDebt = Number(installmentForm.toplamBorc) || 0;
    const downPayment = Number(installmentForm.pesnat) || 0;
    if (downPayment > totalDebt) return showToast("error", "Peşinat tutarı toplam borçtan büyük olamaz");
    if (totalDebt - downPayment <= 0) return showToast("error", "Taksitlendirilecek miktar 0'dan büyük olmalıdır");

    setInstallmentLoading(true);
    const res = await fetch("/api/taksit-plani", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: id,
        doctorId: currentUserId,
        baslik: `${installmentForm.taksitSayisi} Taksitli Ödeme - ${new Date().toLocaleDateString("tr-TR")}`,
        toplamBorc: totalDebt,
        pesnat: downPayment,
        taksitSayisi: Number(installmentForm.taksitSayisi),
        period: installmentForm.period,
        startDate: installmentForm.startDate,
        notes: installmentForm.notes || undefined
      })
    });

    if (res.ok) {
      showToast("success", "Taksit planı oluşturuldu");
      setInstallmentForm({toplamBorc: "", pesnat: "0", taksitSayisi: "3", period: "AYLIK", startDate: new Date().toISOString().slice(0, 10), notes: ""});
      setInstallmentModalOpen(false);
      setInstallmentStep("borç");
      setInstallmentPreview([]);
      void load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.error || "Taksit planı oluşturulamadı");
    }
    setInstallmentLoading(false);
  };

  const handleInstallmentNextStep = () => {
    if (installmentStep === "borç") {
      if (!installmentForm.toplamBorc || Number(installmentForm.toplamBorc) <= 0) return showToast("error", "Toplam borç girin");
      const pesnat = Number(installmentForm.pesnat) || 0;
      if (pesnat >= Number(installmentForm.toplamBorc)) return showToast("error", "Peşinat toplam borçtan küçük olmalı");
      generateInstallmentPreview();
      setInstallmentStep("plan");
    } else if (installmentStep === "plan") {
      if (!installmentForm.taksitSayisi || Number(installmentForm.taksitSayisi) <= 0) return showToast("error", "Taksit sayısı girin");
      setInstallmentStep("onay");
    }
  };

  const handleInstallmentPrevStep = () => {
    if (installmentStep === "plan") setInstallmentStep("borç");
    else if (installmentStep === "onay") setInstallmentStep("plan");
  };

  const printHtml = (_title: string, body: string) => {
    const el = document.getElementById("ks-print-area");
    if (!el) return;
    el.innerHTML = `<div class="ks-page"><div class="ks-frame">${body}</div></div>`;
    setTimeout(() => {
      window.print();
      setTimeout(() => { el.innerHTML = ""; }, 1000);
    }, 150);
  };

  const TOOTH_CLR: Record<string, string> = {
    saglikli:"#f7f0e0",cukur:"#fca5a5",dolgu:"#fef08a",cekilen:"#d1d5db",kaplik:"#bfdbfe",kanal:"#e9d5ff",eksik:"#f1f5f9"
  };

  const buildToothChartHtml = (map: Record<string, string>): string => {
    const upper = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
    const lower = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    const cell = (n: number) => {
      const s = map[String(n)];
      const bg = s ? (TOOTH_CLR[s] || "#fff") : "#fff";
      const line = s === "cekilen" ? "text-decoration:line-through;" : "";
      return `<div class="t-cell" style="background:${bg};${line}">${n}</div>`;
    };
    const sep = `<div class="t-div"></div>`;
    return `<div class="tooth-chart">
      <div style="text-align:center;font-size:8.5px;font-weight:700;color:#1e3a5f;margin-bottom:3px;letter-spacing:0.5px">DİŞ ŞEMASI (FDI)</div>
      <div class="tooth-row">${upper.slice(0,8).map(cell).join("")}${sep}${upper.slice(8).map(cell).join("")}</div>
      <div style="height:4px;border-bottom:1px dashed #cbd5e1;margin:1px 14px"></div>
      <div class="tooth-row">${lower.slice(0,8).map(cell).join("")}${sep}${lower.slice(8).map(cell).join("")}</div>
      <div style="display:flex;justify-content:center;gap:10px;margin-top:5px;flex-wrap:wrap">
        ${[["#fca5a5","Çürük"],["#fef08a","Dolgu"],["#bfdbfe","Kaplık"],["#e9d5ff","Kanal"],["#d1d5db","Çekilmiş"]].map(([c,l])=>`<span style="display:flex;align-items:center;gap:3px;font-size:7.5px;color:#64748b"><span style="width:9px;height:9px;background:${c};border:0.5px solid #cbd5e1;border-radius:1px;display:inline-block"></span>${l}</span>`).join("")}
      </div>
    </div>`;
  };

  const buildPatientBar = () => {
    if (!data) return "";
    const age = data.birthDate ? Math.floor((Date.now() - new Date(data.birthDate).getTime()) / 31536000000) : null;
    return `<div class="patient-bar">
      <span><strong>${data.fullName}</strong></span>
      <span>T.C.: <strong>${data.tcNo}</strong></span>
      ${data.birthDate ? `<span>Doğum: <strong>${new Date(data.birthDate).toLocaleDateString("tr-TR")}${age ? ` (${age} yaş)` : ""}</strong></span>` : ""}
      <span>Tel: <strong>${data.phone || "—"}</strong></span>
      ${(data as any).bloodType ? `<span>Kan: <strong>${(data as any).bloodType}</strong></span>` : ""}
    </div>`;
  };

  const buildHeader = (docTitle: string, docType: string) => {
    return `<div class="header">
      <div><div class="h-title">${clinicName || "KlinikModern"}</div><div class="h-sub">Diş Sağlığı Merkezi</div></div>
      <div class="h-right"><div style="font-size:12px;font-weight:700;letter-spacing:1px">${docType}</div><div style="font-size:9px;opacity:0.8">${new Date().toLocaleDateString("tr-TR")}</div></div>
    </div>`;
  };

  const openTreatmentPrint = () => {
    const list = (data?.examinations || []).filter(e => e.status !== "DIAGNOZ" && e.status !== "Diagnoz (Ön Teşhis)");
    setSelectedTreatForPrint(list.map(t => t.id));
    setTreatmentPrintOpen(true);
  };

  const doPrintTreatments = () => {
    if (!data) return;
    const selected = (data.examinations || []).filter(e => e.status !== "DIAGNOZ" && e.status !== "Diagnoz (Ön Teşhis)" && selectedTreatForPrint.includes(e.id));
    const total = selected.reduce((s, e) => s + Number(e.amount), 0);
    const discounted = total * (1 - Number(data.discountRate || 0) / 100);
    const chartHtml = Object.keys(toothMap).length > 0 ? `<div class="sec-title">Diş Şeması</div>${buildToothChartHtml(toothMap)}` : "";
    const rows = selected.map(t =>
      `<tr><td>${new Date(t.diagnosedAt).toLocaleDateString("tr-TR")}</td><td>${t.treatmentName}</td><td style="text-align:center">${t.toothNo || "—"}</td>${showPricesInPrint ? `<td style="text-align:right">₺${Number(t.amount).toLocaleString("tr-TR")}</td>` : ""}<td>${t.doctor?.fullName || "—"}</td></tr>`
    ).join("");
    const colSpan = showPricesInPrint ? 5 : 4;
    printHtml("Tedavi Raporu", `
      ${buildHeader("Tedavi Raporu", "TEDAVİ RAPORU")}
      ${buildPatientBar()}
      <div class="content">
        ${chartHtml}
        <div class="sec-title">Tedavi Listesi</div>
        <table><thead><tr><th>Tarih</th><th>Tedavi</th><th style="text-align:center">Diş</th>${showPricesInPrint ? `<th style="text-align:right">Tutar</th>` : ""}<th>Doktor</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${colSpan}" style="text-align:center;padding:12px;color:#9ca3af">Kayıt yok</td></tr>`}</tbody>
        ${showPricesInPrint ? `<tfoot><tr><td colspan="3" style="text-align:right">Toplam:</td><td style="text-align:right">₺${total.toLocaleString("tr-TR")}</td><td></td></tr>${data.discountRate > 0 ? `<tr><td colspan="3" style="text-align:right;color:#c2410c">İndirim (%${data.discountRate}):</td><td style="text-align:right;color:#c2410c">-₺${(total-discounted).toLocaleString("tr-TR")}</td><td></td></tr><tr><td colspan="3" style="text-align:right;color:#15803d">Net Tutar:</td><td style="text-align:right;color:#15803d">₺${discounted.toLocaleString("tr-TR")}</td><td></td></tr>` : ""}</tfoot>` : ""}
        </table>
      </div>
      <div class="footer"><span>Bu belge resmi olmayan bilgi amaçlı hazırlanmıştır.</span><div class="sign-area"><div class="sign-line">Hekim İmza / Kaşe</div></div></div>
    `);
  };

  const openPaymentPrint = () => {
    const payments = data?.payments || [];
    setSelectedPayForPrint(payments.map(p => p.id));
    setPaymentPrintOpen(true);
  };

  const convertExamDirect = async (exam: Exam) => {
    const editVals = examInlineEdits[exam.id];
    const amount = editVals ? (Number(editVals.amount) || 0) : Number(exam.amount || 0);
    const doctorId = editVals?.doctorId || exam.doctorId || currentUserId;
    if (!doctorId) return showToast("error", "Doktor seçilmedi");

    setExamSavingId(exam.id);
    const res = await fetch("/api/examinations/" + exam.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Tedavi (Ücretli)",
        treatmentName: exam.treatmentName,
        toothNo: exam.toothNo,
        amount,
        diagnosedAt: exam.diagnosedAt,
        doctorId,
      })
    });
    setExamSavingId(null);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Tedaviye aktarma başarısız");
    }

    showToast("success", `"${exam.treatmentName}" tedaviye aktarıldı`);
    setExamInlineEdits(prev => { const n = {...prev}; delete n[exam.id]; return n; });
    setSelectedDiagnozIds(prev => prev.filter(x => x !== exam.id));
    void load();
  };

  const saveExamInlineEdit = async (exam: Exam) => {
    const editVals = examInlineEdits[exam.id];
    if (!editVals) return;
    setExamSavingId(exam.id);
    const res = await fetch("/api/examinations/" + exam.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: exam.status,
        treatmentName: exam.treatmentName,
        toothNo: exam.toothNo,
        amount: Number(editVals.amount) || 0,
        diagnosedAt: exam.diagnosedAt,
        doctorId: editVals.doctorId || exam.doctorId || currentUserId,
      })
    });
    setExamSavingId(null);
    if (!res.ok) return showToast("error", "Güncelleme başarısız");
    showToast("success", "Muayene kaydı güncellendi");
    setExamInlineEdits(prev => { const n = {...prev}; delete n[exam.id]; return n; });
    void load();
  };

  const bulkConvertDiagnozlar = async () => {
    if (selectedDiagnozIds.length === 0) return;
    if (!window.confirm(`${selectedDiagnozIds.length} muayene kaydı tedaviye aktarılsın mı?`)) return;
    setBulkConverting(true);
    const examList = (data?.examinations || []).filter(e => e.status === "DIAGNOZ" || e.status === "Diagnoz (Ön Teşhis)");
    let errCount = 0;
    for (const eId of selectedDiagnozIds) {
      const exam = examList.find(e => e.id === eId);
      if (!exam) { errCount++; continue; }
      const editVals = examInlineEdits[eId];
      const amount = editVals ? (Number(editVals.amount) || 0) : Number(exam.amount || 0);
      const doctorId = editVals?.doctorId || exam.doctorId || currentUserId;
      const res = await fetch("/api/examinations/" + eId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Tedavi (Ücretli)",
          treatmentName: exam.treatmentName,
          toothNo: exam.toothNo,
          amount,
          diagnosedAt: exam.diagnosedAt,
          doctorId,
        })
      });
      if (!res.ok) errCount++;
    }
    setBulkConverting(false);
    if (errCount > 0) showToast("error", `${errCount} kayıt tedaviye aktarılamadı`);
    else showToast("success", `${selectedDiagnozIds.length} kayıt tedaviye aktarıldı`);
    const convertedIds = [...selectedDiagnozIds];
    setSelectedDiagnozIds([]);
    setExamInlineEdits(prev => { const n = {...prev}; convertedIds.forEach(id => delete n[id]); return n; });
    void load();
  };

  const deleteExamRecord = async (examId: string, asTreatment = false) => {
    const ok = window.confirm(asTreatment ? "Tedavi kaydı silinsin mi?" : "Muayene kaydı silinsin mi?");
    if (!ok) return;

    const res = await fetch("/api/examinations/" + examId, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Kayıt silinemedi");
    }

    showToast("success", asTreatment ? "Tedavi kaydı silindi" : "Muayene kaydı silindi");
    void load();
  };

  const doPrintPayments = () => {
    if (!data) return;
    const selected = (data.payments || []).filter(p => selectedPayForPrint.includes(p.id));
    const totalPaidSel = selected.reduce((s, p) => s + Number(p.amount), 0);
    const methodLabel = (m: string) => ({NAKIT:"Nakit",KREDI_KARTI:"Kredi Kartı",HAVALE_EFT:"Havale/EFT",MAIL_ORDER:"Mail Order",DIGER:"Diğer"} as Record<string,string>)[m] || m;
    const rows = selected.map(p =>
      `<tr><td>${new Date(p.createdAt).toLocaleDateString("tr-TR")}</td><td>${methodLabel(p.method)}</td><td>${p.description || "—"}</td><td style="text-align:right;font-weight:600">₺${Number(p.amount).toLocaleString("tr-TR")}</td></tr>`
    ).join("");
    printHtml("Ödeme Geçmişi", `
      ${buildHeader("Ödeme Geçmişi", "ÖDEME GEÇMİŞİ")}
      ${buildPatientBar()}
      <div class="content">
        <div class="sec-title">Ödeme Listesi</div>
        <table><thead><tr><th>Tarih</th><th>Yöntem</th><th>Açıklama</th><th style="text-align:right">Tutar</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='4' style='text-align:center;padding:12px;color:#9ca3af'>Kayıt yok</td></tr>"}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right">Toplam Ödenen:</td><td style="text-align:right;color:#15803d">₺${totalPaidSel.toLocaleString("tr-TR")}</td></tr></tfoot></table>
      </div>
      <div class="footer"><span>Bu belge resmi olmayan bilgi amaçlı hazırlanmıştır.</span><div class="sign-area"><div class="sign-line">Hekim İmza / Kaşe</div></div></div>
    `);
  };

  const printInstallmentPlan = (plan: TaksitPlan) => {
    const items = (plan.taksitler || []) as unknown as Array<Record<string, unknown>>;
    const rows = items.map((item, idx) => {
      const due = String((item.dueDate || item.vadeDate || "") as string);
      const amount = Number((item.amount || item.tutar || 0) as number);
      const paid = Number((item.odenen || 0) as number);
      const status = String((item.status || "") as string);
      const sc: Record<string,string> = {ODENDI:"color:#15803d",BEKLIYOR:"color:#d97706",GECIKTI:"color:#dc2626",IPTAL:"color:#94a3b8"};
      return `<tr><td style="text-align:center">${idx + 1}</td><td>${due ? new Date(due).toLocaleDateString("tr-TR") : "—"}</td><td style="text-align:right">₺${amount.toLocaleString("tr-TR")}</td><td style="text-align:right">₺${paid.toLocaleString("tr-TR")}</td><td style="${sc[status]||""}">${status}</td></tr>`;
    }).join("");
    const planTotal = getPlanTotal(plan);
    const planRemain = getPlanRemaining(plan);
    printHtml("Ödeme Planı", `
      ${buildHeader("Ödeme Planı", "ÖDEME PLANI")}
      ${buildPatientBar()}
      <div class="content">
        <div class="sec-title">Plan Bilgisi</div>
        <div style="display:flex;gap:20px;font-size:10px;margin-bottom:8px;flex-wrap:wrap">
          <span>Toplam Borç: <strong>₺${planTotal.toLocaleString("tr-TR")}</strong></span>
          <span>Peşinat: <strong>₺${Number(plan.pesnat||0).toLocaleString("tr-TR")}</strong></span>
          <span>Kalan: <strong style="color:#dc2626">₺${planRemain.toLocaleString("tr-TR")}</strong></span>
          <span>Plan Tarihi: <strong>${new Date(plan.createdAt).toLocaleDateString("tr-TR")}</strong></span>
        </div>
        <div class="sec-title">Taksit Tablosu</div>
        <table><thead><tr><th style="text-align:center">#</th><th>Vade Tarihi</th><th style="text-align:right">Tutar</th><th style="text-align:right">Ödenen</th><th>Durum</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='5' style='text-align:center;padding:12px;color:#9ca3af'>Kayıt yok</td></tr>"}</tbody></table>
      </div>
      <div class="footer"><span>Bu belge resmi olmayan bilgi amaçlı hazırlanmıştır.</span><div class="sign-area"><div class="sign-line">Hekim İmza / Kaşe</div></div></div>
    `);
  };

  const addPayment = async () => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("error", "Geçerli bir tutar girin");
    if (!payDoctorId && !currentUserId) return showToast("error", "Lütfen bir doktor seçin");
    setPayLoading(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: id, method: payMethod, amount, description: payDesc, doctorId: payDoctorId || currentUserId || undefined, ...(payPosId && { posId: payPosId }) })
    });
    if (res.ok) {
      setPayAmount("");
      setPayDesc("");
      setPayPosId("");
      setPayDoctorId("");
      showToast("success", "Ödeme kaydedildi");
      void load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.message || "Ödeme kaydedilemedi");
    }
    setPayLoading(false);
  };

  const saveEdit = async () => {
    if (!/^0\d{10}$/.test(String(editForm.phone || ""))) {
      return showToast("error", "Telefon 11 haneli olmalı ve 0 ile başlamalıdır");
    }
    setEditLoading(true);
    const res = await updatePatient({ ...editForm, birthDate: toBirthDateIso(editForm.birthDate) });
    if (res.ok) { showToast("success", "Hasta bilgileri güncellendi"); void load(); } else showToast("error", "Güncelleme başarısız");
    setEditLoading(false);
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    const userName = doctorOptions.find(d => d.id === currentUserId)?.fullName || "Sistem";
    const timestamp = new Date().toLocaleString("tr-TR");
    const newNote = (data?.notes ? data.notes + "\n" : "") + `[${timestamp} - ${userName}] ${noteText.trim()}`;
    const res = await updatePatient({ notes: newNote });
    if (res.ok) { setNoteText(""); showToast("success", "Not kaydedildi"); void load(); } else showToast("error", "Not kaydedilemedi");
    setNoteSaving(false);
  };

  const addDrugToList = () => {
    if (!selectedMedicationId) return showToast("error", "Listeden ilaç seçin");
    const selected = MEDICATION_TEMPLATES.find(x => x.id === selectedMedicationId);
    if (!selected) return showToast("error", "İlaç bulunamadı");

    const nextDrug = {
      name: selected.name,
      dose: selected.dose,
      usage: selected.usage,
      duration: selected.duration,
      note: newDrugNote
    };

    setCurrentRecipeDrugs([...currentRecipeDrugs, nextDrug]);
    setSelectedMedicationId("");
    setNewDrugNote("");
  };

  const removeDrugFromList = (idx: number) => {
    setCurrentRecipeDrugs(currentRecipeDrugs.filter((_, i) => i !== idx));
  };

  const addRecete = async () => {
    if (currentRecipeDrugs.length === 0) return showToast("error", "En az bir ilaç ekleyin");
    setRxSaving(true);
    const res = await fetch("/api/prescriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: id, drugs: JSON.stringify(currentRecipeDrugs), note: rxNote })
    });
    if (res.ok) {
      showToast("success", "Reçete kaydedildi");
      setCurrentRecipeDrugs([]);
      setRxNote("");
      void load();
    } else showToast("error", "Reçete kaydedilemedi");
    setRxSaving(false);
  };

  const deleteRecete = async (rxId: string) => {
    if (!window.confirm("Reçete silinsin mi?")) return;
    const res = await fetch("/api/prescriptions/" + rxId, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Reçete silinemedi");
    }
    showToast("success", "Reçete silindi");
    void load();
  };

  const saveToothChart = async () => {
    setToothSaving(true);
    const res = await updatePatient({ toothChart: JSON.stringify(toothMap) });
    setToothSaving(false);
    if (!res.ok) return showToast("error", "Diş şeması kaydedilemedi");
    showToast("success", "Diş şeması kaydedildi");
    void load();
  };

  const toggleTooth = (tooth: string) => {
    setToothMap(prev => {
      const cur = prev[tooth] || "saglikli";
      if (cur === selectedTool) {
        const next = { ...prev }; delete next[tooth]; return next;
      }
      return { ...prev, [tooth]: selectedTool };
    });
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!data) return <section className="rounded-xl bg-white border border-slate-100 p-6 shadow-sm"><p>{loadError || "Hasta bulunamadı"}. <Link href="/hasta" className="text-primary underline">Geri Dön</Link></p></section>;

  const totalPaid = data.payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalCharged = data.examinations.reduce((s, e) => s + Number(e.amount), 0);
  const discountedTotal = totalCharged * (1 - (Number(data.discountRate || 0) / 100));
  const totalDebt = discountedTotal - totalPaid;
  const diagnozlar = data.examinations.filter(e => e.status === "DIAGNOZ" || e.status === "Diagnoz (Ön Teşhis)");
  const tedaviler = data.examinations.filter(e => e.status !== "DIAGNOZ" && e.status !== "Diagnoz (Ön Teşhis)");

  const healthFlags = [
    ["Alerji", data.hasAllergy], ["Hepatit", data.hasHepatitis], ["Böbrek", data.hasKidney],
    ["Diyabet", data.hasDiabetes], ["Kalp", data.hasHeart], ["Kan Sorunu", data.hasBloodIssue]
  ] as [string, boolean][];

  return (
    <section className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.text}
        </div>
      )}

      <div className="flex items-start justify-between rounded-xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
            {data.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{data.fullName}</h2>
            <p className="text-sm text-slate-500">TC: {data.tcNo} · {data.phone}</p>
          </div>
        </div>
        <Link href="/hasta" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition">← Geri Dön</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-lg bg-slate-800 p-3 text-center text-white">
          <p className="text-xs opacity-80">TOPLAM TEDAVİ</p>
          <p className="text-xl font-bold">{totalCharged.toFixed(2)} TL</p>
        </article>
        <article className="rounded-lg bg-orange-500 p-3 text-center text-white">
          <p className="text-xs opacity-80">İNDİRİM ORANI</p>
          <p className="text-xl font-bold">%{data.discountRate}</p>
        </article>
        <article className="rounded-lg bg-blue-600 p-3 text-center text-white">
          <p className="text-xs opacity-80">İNDİRİM SONRASI</p>
          <p className="text-xl font-bold">{discountedTotal.toFixed(2)} TL</p>
        </article>
        <article className={"rounded-lg p-3 text-center text-white " + (totalDebt > 0 ? "bg-red-600" : "bg-green-600")}>
          <p className="text-xs opacity-80">KALAN BORÇ</p>
          <p className="text-xl font-bold">{totalDebt.toFixed(2)} TL</p>
        </article>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TAB_ITEMS.map(t => (
          <button key={t.key} onClick={() => selectTab(t.key)}
            className={"rounded-t px-4 py-2 text-sm font-semibold transition-colors " + (tab === t.key ? "border-b-2 border-primary bg-white text-primary" : "text-gray-600 hover:text-primary")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bilgi" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="mb-3 font-semibold text-gray-700">Hasta Bilgileri</h3>
            <table className="w-full text-sm">
              <tbody>
                {[["Ad Soyad",data.fullName],["TC No",data.tcNo],["Telefon",data.phone],["Cinsiyet",data.gender==="ERKEK"||data.gender==="Erkek"?"Erkek":"Kadın"],["Doğum Tarihi",data.birthDate?new Date(data.birthDate).toLocaleDateString("tr-TR"):"-"],["Anlaşmalı Kurum",data.insurance||"-"],["Referans Eden",(data.referrer || "-")],["İndirim","%"+data.discountRate],["Adres",data.address||"-"],["Kan Grubu",(data as any).bloodType||"-"]].map(([lbl,val])=>(
                  <tr key={lbl} className="border-b">
                    <td className="py-1.5 pr-4 text-gray-500 font-medium whitespace-nowrap">{lbl}:</td>
                    <td className="py-1.5">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 font-semibold text-gray-700">Sağlık Bilgileri</h3>
              <div className="flex flex-wrap gap-2">
                {healthFlags.map(([label, val]) => (
                  <span key={label} className={"rounded-full px-3 py-1 text-xs font-semibold " + (val ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500")}>
                    {val ? "! " : ""}{label}
                  </span>
                ))}
              </div>
              {data.medications && <p className="mt-2 text-xs text-gray-600"><span className="font-medium">İlaçlar:</span> {data.medications}</p>}
              {data.surgeries && <p className="mt-1 text-xs text-gray-600"><span className="font-medium">Ameliyatlar:</span> {data.surgeries}</p>}
              {(data as any).otherDiseases && <p className="mt-1 text-xs text-gray-600"><span className="font-medium">Diğer Hastalıklar:</span> {(data as any).otherDiseases}</p>}
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-2 font-semibold text-gray-700">Finansal Özet</h3>
              <div className="grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-4">
                <div className="rounded-lg bg-gray-50 p-2"><p className="text-xs text-gray-500">Brüt Tedavi</p><p className="font-bold">{totalCharged.toFixed(2)} TL</p></div>
                <div className="rounded-lg bg-orange-50 p-2"><p className="text-xs text-gray-500">İndirim</p><p className="font-bold text-orange-600">%{data.discountRate}</p></div>
                <div className="rounded-lg bg-blue-50 p-2"><p className="text-xs text-gray-500">Net Tutar</p><p className="font-bold text-blue-700">{discountedTotal.toFixed(2)} TL</p></div>
                <div className={"rounded-lg p-2 " + (totalDebt>0?"bg-red-50":"bg-green-50")}><p className="text-xs text-gray-500">Kalan</p><p className={"font-bold " + (totalDebt>0?"text-red-600":"text-green-600")}>{totalDebt.toFixed(2)} TL</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "randevular" && (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Doktor</th><th className="px-3 py-2 text-left">Tip</th><th className="px-3 py-2 text-left">Durum</th></tr>
            </thead>
            <tbody>
              {data.appointments.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Randevu yok</td></tr>}
              {data.appointments.map(a => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{new Date(a.startAt).toLocaleString("tr-TR")}</td>
                  <td className="px-3 py-2">{a.doctor?.fullName || "-"}</td>
                  <td className="px-3 py-2"><span className={"rounded-full px-2 py-0.5 text-xs " + (a.type==="ACIL"?"bg-red-100 text-red-700":a.type==="KONTROL"?"bg-yellow-100 text-yellow-700":"bg-blue-100 text-blue-700")}>{a.type}</span></td>
                  <td className="px-3 py-2"><span className={"rounded-full px-2 py-0.5 text-xs " + (a.status==="GELDI"?"bg-green-100 text-green-700":a.status==="GELMEDI"?"bg-red-100 text-red-700":a.status==="IPTAL"?"bg-gray-200 text-gray-600":"bg-yellow-100 text-yellow-700")}>{a.status||"Bekliyor"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "tedavi" && (() => {
        const UPPER = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
        const LOWER = ["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"];
        const UPPER_C = ["55","54","53","52","51","61","62","63","64","65"];
        const LOWER_C = ["85","84","83","82","81","71","72","73","74","75"];
        const fallbackTreatmentPool = activePriceList === "custom" ? CUSTOM_DENTAL_TREATMENT_TEMPLATES : TDB_2026_CORE_PRICE_CATALOG;
        const treatmentPool = priceList.length > 0 ? priceList : fallbackTreatmentPool;
        const onToothPick = async (n: string) => {
          if (treatmentSaving) return;
          await addDirectToExaminationList(n);
        };
        const selectedPriceItem = treatmentPool.find(p => p.id === treatDropdownId);
        return (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Muayene/Tedavi Oluştur</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Doktor ve tedavi seçin. Diş şemasından tıkladığınız dişler otomatik olarak muayene listesine aktarılır.</p>

            <div className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Aktif kaynak: <span className="font-semibold">{activePriceList === "custom" ? "Özel Fiyat Listesi" : "TDB 2026 Tarife Listesi"}</span>. Bu seçim Fiyat Listesi sayfasından yönetilir.
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex items-center overflow-hidden rounded-lg border">
                <span className="shrink-0 bg-primary px-3 py-2 text-sm font-semibold text-white">Hasta</span>
                <input value={data?.fullName || ""} readOnly className="flex-1 border-none px-3 py-2 text-sm outline-none" />
              </div>
              <div className="flex items-center overflow-hidden rounded-lg border">
                <span className="shrink-0 bg-primary px-3 py-2 text-sm font-semibold text-white">Doktor</span>
                <select className="flex-1 border-none px-3 py-2 text-sm outline-none" value={treatDoctorId} onChange={e => setTreatDoctorId(e.target.value)}>
                  <option value="">Doktor seçin...</option>
                  {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div className="flex items-center overflow-hidden rounded-lg border">
                <span className="shrink-0 bg-primary px-3 py-2 text-sm font-semibold text-white">Tedavi</span>
                <select className="flex-1 border-none px-3 py-2 text-sm outline-none" value={treatDropdownId} onChange={e => { setTreatDropdownId(e.target.value); const p=treatmentPool.find(x=>x.id===e.target.value); if(p) setTreatCustomAmount(String(p.amount)); }}>
                  <option value="">Tedavi seçin...</option>
                  {treatmentPool.map(p => <option key={p.id} value={p.id}>{p.treatment}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-100 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-1">
                  {(["adult","child","general"] as const).map(k => (
                    <button key={k} type="button" onClick={() => { setTreatToothType(k); setTreatSelectedTeeth([]); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${treatToothType===k ? (k==="general"?"bg-emerald-600 text-white":"bg-primary text-white") : "bg-white text-slate-600 border hover:bg-slate-100"}`}>
                      {k === "adult" ? "Yetişkin Dişleri" : k === "child" ? "Çocuk Dişleri" : "Genel Muayene"}
                    </button>
                  ))}
                </div>
                {treatSelectedTeeth.length > 0 && <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => setTreatSelectedTeeth([])}>Seçimi Temizle</button>}
              </div>

              {treatToothType === "general" && (
                <div className="rounded-lg border-2 border-dashed border-green-300 bg-green-50 p-4 text-center">
                  <p className="font-semibold text-green-700">Genel Muayene seçildi</p>
                  <p className="text-sm text-green-600">Diş numarası gerekmez</p>
                  <button
                    type="button"
                    onClick={() => { void addDirectToExaminationList(); }}
                    disabled={treatmentSaving}
                    className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {treatmentSaving ? "Ekleniyor..." : "Genel Muayene Ekle"}
                  </button>
                </div>
              )}

              {treatToothType === "adult" && (
                <div className="overflow-x-auto rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50/70 via-white to-slate-50 p-3">
                  <div style={{ minWidth: 760 }}>
                    <div className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Üst Çene</div>
                    <div className="mb-3 flex items-end justify-center gap-0.5 border-b-2 border-dashed border-amber-200 pb-3">
                      {UPPER.slice(0,8).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                      <div className="mx-3 self-stretch border-l-2 border-dashed border-amber-300"/>
                      {UPPER.slice(8).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                    </div>
                    <div className="flex items-start justify-center gap-0.5 pt-2">
                      {LOWER.slice(0,8).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                      <div className="mx-3 self-stretch border-l-2 border-dashed border-amber-300"/>
                      {LOWER.slice(8).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                    </div>
                    <div className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Alt Çene</div>
                  </div>
                </div>
              )}

              {treatToothType === "child" && (
                <div className="overflow-x-auto rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50/70 via-white to-slate-50 p-3">
                  <div style={{ minWidth: 500 }}>
                    <div className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Üst Çene (Süt)</div>
                    <div className="mb-3 flex items-end justify-center gap-0.5 border-b-2 border-dashed border-amber-200 pb-3">
                      {UPPER_C.slice(0,5).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                      <div className="mx-3 self-stretch border-l-2 border-dashed border-amber-300"/>
                      {UPPER_C.slice(5).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                    </div>
                    <div className="flex items-start justify-center gap-0.5 pt-2">
                      {LOWER_C.slice(0,5).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                      <div className="mx-3 self-stretch border-l-2 border-dashed border-amber-300"/>
                      {LOWER_C.slice(5).map(n => <ToothButton key={n} num={n} selected={treatSelectedTeeth.includes(n)} onClick={() => { void onToothPick(n); }} />)}
                    </div>
                    <div className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Alt Çene (Süt)</div>
                  </div>
                </div>
              )}

              {treatSelectedTeeth.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">
                  <span className="mr-1 text-xs text-gray-500">Seçili:</span>
                  {treatSelectedTeeth.map(n => <span key={n} className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">{n}</span>)}
                </div>
              )}
            </div>

            <div className="mb-2 grid gap-3 md:grid-cols-3">
              <div className="flex items-center overflow-hidden rounded-lg border">
                <span className="shrink-0 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">Tutar</span>
                <input type="number" className="flex-1 border-none px-3 py-2 text-sm outline-none" value={treatCustomAmount} onChange={e => setTreatCustomAmount(e.target.value)} placeholder={selectedPriceItem ? String(selectedPriceItem.amount) : "0"} />
              </div>
              <div className="flex items-center rounded-lg border bg-gray-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
                Dişe tıkladığınız anda kayıt otomatik olarak Muayene Listesi (Tedavi Bekleyen) tablosuna eklenir.
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-amber-700">Muayene Listesi (Tedavi Bekleyen)</h3>
                <span className="text-xs text-slate-400">{diagnozlar.length} kayıt</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedDiagnozIds.length > 0 && (
                  <>
                    <button
                      onClick={() => { void bulkConvertDiagnozlar(); }}
                      disabled={bulkConverting}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {bulkConverting ? "Aktarılıyor..." : `Seçilenleri Tedaviye Aktar (${selectedDiagnozIds.length})`}
                    </button>
                    <button onClick={() => setSelectedDiagnozIds([])} className="text-xs text-slate-400 hover:text-slate-600">Seçimi Temizle</button>
                  </>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2 text-center">
                    <input type="checkbox"
                      checked={diagnozlar.length > 0 && selectedDiagnozIds.length === diagnozlar.length}
                      onChange={ev => setSelectedDiagnozIds(ev.target.checked ? diagnozlar.map(d => d.id) : [])}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Tarih</th>
                  <th className="px-3 py-2 text-left">Muayene Notu</th>
                  <th className="px-3 py-2 text-left">Diş No</th>
                  <th className="px-3 py-2 text-right">Fiyat (TL)</th>
                  <th className="px-3 py-2 text-left min-w-[120px]">Doktor</th>
                  <th className="px-3 py-2 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {diagnozlar.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">Tedavi bekleyen muayene kaydı yok</td></tr>}
                {diagnozlar.map(e => {
                  const editVals = examInlineEdits[e.id];
                  const currentAmount = editVals?.amount ?? String(Number(e.amount || 0));
                  const currentDoctorId = editVals?.doctorId ?? e.doctorId ?? "";
                  const hasEdits = !!editVals;
                  const isSaving = examSavingId === e.id;
                  return (
                    <tr key={e.id} className={`border-b ${selectedDiagnozIds.includes(e.id) ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox"
                          checked={selectedDiagnozIds.includes(e.id)}
                          onChange={ev => setSelectedDiagnozIds(prev => ev.target.checked ? [...prev, e.id] : prev.filter(x => x !== e.id))}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(e.diagnosedAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-3 py-2">{e.treatmentName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.toothNo || "—"}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" min="0" step="0.01"
                          value={currentAmount}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: { ...(prev[e.id] ?? { doctorId: e.doctorId ?? "" }), amount: ev.target.value }
                          }))}
                          className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right text-xs font-semibold hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={currentDoctorId}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: { ...(prev[e.id] ?? { amount: String(Number(e.amount || 0)) }), doctorId: ev.target.value }
                          }))}
                          className="w-full min-w-[110px] rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none"
                        >
                          <option value="">— Seçin —</option>
                          {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {hasEdits && (
                            <button
                              onClick={() => { void saveExamInlineEdit(e); }}
                              disabled={isSaving}
                              title="Değişiklikleri kaydet (aktarmadan)"
                              className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                            >
                              {isSaving ? "⏳" : "💾"}
                            </button>
                          )}
                          <button
                            onClick={() => { void convertExamDirect(e); }}
                            disabled={isSaving}
                            className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 whitespace-nowrap"
                          >
                            {isSaving ? "..." : "✓ Tedaviye Aktar"}
                          </button>
                          <button
                            onClick={() => { void deleteExamRecord(e.id, false); }}
                            disabled={isSaving}
                            className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200 disabled:opacity-50"
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
              <h3 className="font-semibold text-emerald-700">Yapılan Tedaviler</h3>
              <span className="text-xs text-slate-400">{tedaviler.length} kayıt</span>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Tedavi</th><th className="px-3 py-2 text-left">Diş No</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-left">Doktor</th><th className="px-3 py-2 text-center">Sil</th></tr>
              </thead>
              <tbody>
                {tedaviler.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Henüz yapılan tedavi kaydı yok</td></tr>}
                {tedaviler.map(e => (
                  <tr key={e.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs">{new Date(e.diagnosedAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-3 py-2">{e.treatmentName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.toothNo||"—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{Number(e.amount).toFixed(2)} TL</td>
                    <td className="px-3 py-2 text-xs">{e.doctor?.fullName||"—"}</td>
                    <td className="px-3 py-2 text-center"><button onClick={() => { void deleteExamRecord(e.id, true); }} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200">Sil</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold">Toplam:</td><td className="px-3 py-2 text-right font-bold">{totalCharged.toFixed(2)} TL</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        </div>
        );
      })()}

      {tab === "odeme" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-slate-50 p-3 text-center"><p className="text-xs text-slate-500">Brüt Tedavi</p><p className="font-bold text-slate-900">{totalCharged.toFixed(2)} TL</p></div>
            <div className="rounded-lg border bg-orange-50 p-3 text-center"><p className="text-xs text-slate-500">İndirim</p><p className="font-bold text-orange-600">%{data.discountRate}</p></div>
            <div className="rounded-lg border bg-blue-50 p-3 text-center"><p className="text-xs text-slate-500">İndirimli Tutar</p><p className="font-bold text-blue-700">{discountedTotal.toFixed(2)} TL</p></div>
            <div className={"rounded-lg border p-3 text-center " + (totalDebt > 0 ? "bg-red-50" : "bg-green-50")}><p className="text-xs text-slate-500">Kalan</p><p className={"font-bold " + (totalDebt > 0 ? "text-red-600" : "text-green-700")}>{totalDebt.toFixed(2)} TL</p></div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={openTreatmentPrint} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">🖨 Tedavi Raporu</button>
            <button onClick={openPaymentPrint} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">🖨 Ödeme Geçmişi</button>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="mb-4 text-sm font-black text-slate-900">Ödeme Ekle</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tutar (₺) *</label>
                <input type="number" placeholder="0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-bold focus:border-emerald-400 focus:outline-none" value={payAmount} onChange={e=>setPayAmount(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Doktor <span className="text-red-500">*</span></label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payDoctorId} onChange={e=>setPayDoctorId(e.target.value)}>
                  <option value="">— Doktor seçin —</option>
                  {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                <div className="flex flex-wrap gap-2">
                  {(["NAKIT","KREDI_KARTI","HAVALE_EFT","MAIL_ORDER","DIGER"] as const).map(m => (
                    <button key={m} type="button" onClick={() => { setPayMethod(m); setPayPosId(""); }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${payMethod === m ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {m === "NAKIT" ? "💵 Nakit" : m === "KREDI_KARTI" ? "💳 Kart" : m === "HAVALE_EFT" ? "🏦 Havale" : m === "MAIL_ORDER" ? "📧 Mail Order" : "📌 Diğer"}
                    </button>
                  ))}
                </div>
                {(payMethod === "KREDI_KARTI" || payMethod === "MAIL_ORDER") && (
                  <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payPosId} onChange={e=>setPayPosId(e.target.value)}>
                    <option value="">— POS Cihazı Seçin —</option>
                    {posDevices.length === 0
                      ? <option disabled>Kayıtlı POS cihazı yok</option>
                      : posDevices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Açıklama</label>
                <input placeholder="Tedavi türü, notlar…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payDesc} onChange={e=>setPayDesc(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={addPayment} disabled={payLoading} className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {payLoading ? "Kaydediliyor…" : "Ödeme Kaydet"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-black text-slate-900">Ödeme Geçmişi</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
              {(["NAKIT","KREDI_KARTI","HAVALE_EFT","MAIL_ORDER"] as const).map(m => {
                const LABELS: Record<string,string> = { NAKIT:"Nakit", KREDI_KARTI:"Kredi Kartı", HAVALE_EFT:"Havale/EFT", MAIL_ORDER:"Mail Order" };
                const total = data.payments.filter((p: {method:string}) => p.method === m).reduce((s: number, p: {amount: string|number}) => s + Number(p.amount), 0);
                return (
                  <div key={m} className="px-4 py-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500">{LABELS[m]}</p>
                    <p className="mt-0.5 text-base font-black text-slate-800">{"₺" + new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2}).format(total)}</p>
                  </div>
                );
              })}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Yöntem</th><th className="px-3 py-2 text-left">Açıklama</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-center">Sil</th></tr>
              </thead>
              <tbody>
                {data.payments.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Ödeme yok</td></tr>}
                {data.payments.map((p: {id:string; createdAt:string; method:string; description?:string|null; amount:string|number}) => {
                  const ML: Record<string,string> = { NAKIT:"Nakit", KREDI_KARTI:"Kredi Kartı", HAVALE_EFT:"Havale/EFT", MAIL_ORDER:"Mail Order", DIGER:"Diğer" };
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs">{new Date(p.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{ML[p.method] || p.method}</span></td>
                      <td className="px-3 py-2 text-xs">{p.description||"—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{"₺" + Number(p.amount).toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-2 text-center"><button onClick={async()=>{if(!window.confirm("Ödeme silinsin mi?"))return;const res=await fetch("/api/payments/"+p.id,{method:"DELETE"});if(!res.ok){const err=await res.json().catch(()=>({}));showToast("error",err.message||"Ödeme silinemedi");return;}showToast("success","Ödeme silindi");void load();}} className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-200">Sil</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <button onClick={() => {setInstallmentModalOpen(true); setInstallmentStep("borç"); setInstallmentForm({toplamBorc: String(discountedTotal), pesnat: "0", taksitSayisi: "3", period: "AYLIK", startDate: new Date().toISOString().slice(0, 10), notes: ""});}} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition">+ Taksit Planı Oluştur</button>
          </div>

          {installmentModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl p-6 max-h-[85vh] flex flex-col">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Taksit Planı Oluştur</h2>
                  <p className="mt-1 text-sm text-slate-500">Adım {installmentStep === "borç" ? 1 : installmentStep === "plan" ? 2 : 3} / 3</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {installmentStep === "borç" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-slate-50 border p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-slate-600">Toplam Tedavi:</span><span className="font-bold">₺{totalCharged.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-600">İndirim:</span><span className="font-bold text-orange-600">-₺{(totalCharged - discountedTotal).toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm border-t pt-2"><span className="text-slate-600">Net Tutar:</span><span className="font-bold">₺{discountedTotal.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-600">Ödenen:</span><span className="font-bold text-green-600">₺{totalPaid.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm border-t pt-2 text-lg"><span className="text-slate-700 font-semibold">Kalan Borç:</span><span className="font-bold text-red-600">₺{totalDebt.toLocaleString("tr-TR")}</span></div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Taksitlendirilecek Tutarı Gir</label>
                        <input type="number" min="1" max={discountedTotal - totalPaid} value={installmentForm.toplamBorc} onChange={e=>setInstallmentForm({...installmentForm, toplamBorc:e.target.value})} placeholder="₺ Tutar" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-lg font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                        <p className="mt-1 text-xs text-slate-500">Maks: ₺{(discountedTotal - totalPaid).toLocaleString("tr-TR")}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Peşinat Tutarı (İsteğe Bağlı)</label>
                        <input type="number" min="0" max={Number(installmentForm.toplamBorc) || 0} value={installmentForm.pesnat} onChange={e=>setInstallmentForm({...installmentForm, pesnat:e.target.value})} placeholder="₺ Peşinat" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-lg font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                        {Number(installmentForm.pesnat) > 0 && <p className="mt-1 text-xs text-slate-500">Taksitlendirilecek Miktar: ₺{(Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)).toLocaleString("tr-TR")}</p>}
                      </div>
                    </div>
                  )}

                  {installmentStep === "plan" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                        <p className="text-sm text-blue-900"><strong>Taksitlendirilecek Tutar:</strong> ₺{(Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)).toLocaleString("tr-TR")}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Taksit Sayısı</label>
                          <select value={installmentForm.taksitSayisi} onChange={e=>{setInstallmentForm({...installmentForm, taksitSayisi:e.target.value}); setTimeout(generateInstallmentPreview, 0);}} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                            {Array.from({length: 24}, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} Taksit</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Periyod</label>
                          <select value={installmentForm.period} onChange={e=>{setInstallmentForm({...installmentForm, period:e.target.value as any}); setTimeout(generateInstallmentPreview, 0);}} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="HAFTALIK">Haftalık</option>
                            <option value="IKIHALFTALIK">2 Haftalık</option>
                            <option value="AYLIK">Aylık</option>
                            <option value="IKIAYLIK">2 Aylık</option>
                            <option value="UCAYLIK">3 Aylık</option>
                            <option value="ALTIAYLIK">6 Aylık</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">İlk Taksit Tarihi</label>
                        <input type="date" value={installmentForm.startDate} onChange={e=>{setInstallmentForm({...installmentForm, startDate:e.target.value}); setTimeout(generateInstallmentPreview, 0);}} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Notlar</label>
                        <textarea value={installmentForm.notes} onChange={e=>setInstallmentForm({...installmentForm, notes:e.target.value})} placeholder="Ek notlar..." rows={2} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                      </div>

                      {installmentPreview.length > 0 && (
                        <div className="rounded-lg border border-slate-200 p-3 max-h-48 overflow-y-auto">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Taksit Takvimi Önizlemesi</p>
                          <div className="space-y-1 text-xs">
                            {installmentPreview.map((item, i) => (
                              <div key={i} className="flex justify-between text-slate-600">
                                <span>{i + 1}. Taksit:</span>
                                <span>{new Date(item.date).toLocaleDateString("tr-TR")} - ₺{item.amount.toLocaleString("tr-TR", {maximumFractionDigits: 2})}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {installmentStep === "onay" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-3">
                        <h3 className="font-semibold text-green-900">Özet</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span>Toplam Borç:</span><span className="font-bold">₺{Number(installmentForm.toplamBorc || 0).toLocaleString("tr-TR")}</span></div>
                          {Number(installmentForm.pesnat) > 0 && <div className="flex justify-between text-slate-700"><span>Peşinat:</span><span>₺{Number(installmentForm.pesnat).toLocaleString("tr-TR")}</span></div>}
                          <div className="flex justify-between border-t pt-2 font-semibold text-green-700"><span>Taksitlendirilecek:</span><span>₺{(Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)).toLocaleString("tr-TR")}</span></div>
                          <div className="flex justify-between"><span>Taksit Sayısı:</span><span className="font-bold">{installmentForm.taksitSayisi}x</span></div>
                          <div className="flex justify-between"><span>Taksit Tutarı:</span><span className="font-bold">₺{((Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)) / Number(installmentForm.taksitSayisi || 1)).toLocaleString("tr-TR", {maximumFractionDigits: 2})}</span></div>
                          <div className="flex justify-between"><span>Başlangıç Tarihi:</span><span>{new Date(installmentForm.startDate).toLocaleDateString("tr-TR")}</span></div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">Lütfen bilgileri kontrol edip Oluştur butonuna basınız</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                  <button onClick={() => {setInstallmentModalOpen(false); setInstallmentStep("borç"); setInstallmentPreview([]);}} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">İptal</button>
                  {(installmentStep === "plan" || installmentStep === "onay") && <button onClick={handleInstallmentPrevStep} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">← Geri</button>}
                  {installmentStep !== "onay" && <button onClick={handleInstallmentNextStep} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">İleri →</button>}
                  {installmentStep === "onay" && <button onClick={createInstallmentPlan} disabled={installmentLoading} className="rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">{installmentLoading ? "Oluşturuluyor..." : "✓ Planı Oluştur"}</button>}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Ödeme Planları</h3>
              <Link href="/muhasebe?tab=taksit" className="text-xs text-primary hover:underline">Tüm Planlar →</Link>
            </div>
            {(!data.taksitPlanlari || data.taksitPlanlari.length === 0) ? (
              <p className="py-4 text-center text-sm text-slate-500">Bu hasta için ödeme planı bulunmuyor.</p>
            ) : (
              <div className="space-y-3">
                {data.taksitPlanlari.map(plan => {
                  const nextDue = plan.taksitler
                    .filter(t => t.status === "BEKLIYOR")
                    .sort((a, b) => new Date(getItemDueDate(a)).getTime() - new Date(getItemDueDate(b)).getTime())[0];
                  const overdue = plan.taksitler.filter(t => t.status === "GECIKTI").length;
                  const statusCls: Record<string,string> = {
                    AKTIF:"bg-green-100 text-green-700", TAMAMLANDI:"bg-blue-100 text-blue-700",
                    IPTAL:"bg-gray-100 text-gray-500", DEVAM_EDIYOR:"bg-yellow-100 text-yellow-700"
                  };
                  return (
                    <div key={plan.id} className="overflow-hidden rounded-lg border">
                      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
                        <div>
                          <p className="font-bold text-slate-800">Plan #{plan.id.slice(-6).toUpperCase()}</p>
                          <p className="text-xs text-slate-500">{plan.doctor?.fullName || "—"} · {new Date(plan.createdAt).toLocaleDateString("tr-TR")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {overdue > 0 && <span className="text-xs font-bold text-red-600">{overdue} gecikmiş!</span>}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls[plan.status] || "bg-gray-100 text-gray-600"}`}>{plan.status}</span>
                          <button onClick={() => printInstallmentPlan(plan)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">🖨 Yazdır</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 divide-x text-center text-sm">
                        <div className="p-2"><p className="text-xs text-slate-500">Toplam</p><p className="font-black text-slate-800">₺{getPlanTotal(plan).toLocaleString("tr-TR")}</p></div>
                        <div className="p-2"><p className="text-xs text-slate-500">Kalan</p><p className={`font-black ${getPlanRemaining(plan) > 0 ? "text-red-600" : "text-green-600"}`}>₺{getPlanRemaining(plan).toLocaleString("tr-TR")}</p></div>
                        <div className="p-2"><p className="text-xs text-slate-500">Sonraki Vade</p><p className="font-bold text-amber-700 text-xs">{nextDue ? new Date(getItemDueDate(nextDue)).toLocaleDateString("tr-TR") : "—"}</p></div>
                      </div>
                      {plan.taksitler.length > 0 && (
                        <details className="border-t">
                          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Taksit Detayları ({plan.taksitler.length} taksit)</summary>
                          <table className="w-full text-xs">
                            <thead className="border-b bg-slate-50">
                              <tr><th className="px-3 py-1.5 text-left">#</th><th className="px-3 py-1.5 text-left">Vade</th><th className="px-3 py-1.5 text-right">Tutar</th><th className="px-3 py-1.5 text-left">Ödeme Tarihi</th><th className="px-3 py-1.5 text-left">Durum</th></tr>
                            </thead>
                            <tbody className="divide-y">
                              {plan.taksitler.map((t, i) => {
                                const sc: Record<string,string> = { ODENDI:"bg-green-100 text-green-700", BEKLIYOR:"bg-yellow-100 text-yellow-700", GECIKTI:"bg-red-100 text-red-700", IPTAL:"bg-gray-100 text-gray-500" };
                                return (
                                  <tr key={t.id} className={`hover:bg-slate-50 ${t.status === "GECIKTI" ? "bg-red-50" : ""}`}>
                                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                                    <td className="px-3 py-1.5">{new Date(getItemDueDate(t)).toLocaleDateString("tr-TR")}</td>
                                    <td className="px-3 py-1.5 text-right font-bold">₺{getItemAmount(t).toLocaleString("tr-TR")}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{getItemPaidAt(t) ? new Date(getItemPaidAt(t)).toLocaleDateString("tr-TR") : "—"}</td>
                                    <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 font-semibold ${sc[t.status] || "bg-gray-100 text-gray-600"}`}>{t.status}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "recete" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-lg font-bold text-slate-900">Yeni Reçete Yaz</h3>
            <p className="mb-4 text-sm text-slate-500">İlaç listesinden seçin, sistem standart kullanım bilgisini otomatik eklesin.</p>

            <div className="rounded-lg bg-slate-50 p-4 mb-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">İlaç Seçimi</label>
                  <select
                    value={selectedMedicationId}
                    onChange={e => setSelectedMedicationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">İlaç seçin</option>
                    {MEDICATION_TEMPLATES.map(m => (
                      <option key={m.id} value={m.id}>{m.name} - {m.dose}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ek Not (isteğe bağlı)</label>
                  <input
                    value={newDrugNote}
                    onChange={e => setNewDrugNote(e.target.value)}
                    placeholder="Yemekten sonra vb."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <button
                onClick={addDrugToList}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
              >
                + İlaç Ekle
              </button>
            </div>

            {/* İlaçlar Tablosu */}
            {currentRecipeDrugs.length > 0 && (
              <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">İlaç Adı</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Doz</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Kullanım</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Süre</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Not</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-900">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRecipeDrugs.map((drug, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="px-3 py-2">{drug.name}</td>
                        <td className="px-3 py-2">{drug.dose}</td>
                        <td className="px-3 py-2">{drug.usage}</td>
                        <td className="px-3 py-2">{drug.duration}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{drug.note}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => removeDrugFromList(idx)}
                            className="text-red-600 hover:text-red-800 font-semibold text-sm"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Doktor Notları (isteğe bağlı)</label>
              <textarea
                value={rxNote}
                onChange={e => setRxNote(e.target.value)}
                placeholder="Kullanım talimatı, uyarılar vb."
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              onClick={addRecete}
              disabled={rxSaving || currentRecipeDrugs.length === 0}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {rxSaving ? "Reçete Kaydediliyor..." : "✓ Reçeteyi Kaydet"}
            </button>
          </div>

          {/* Geçmiş Reçeteler */}
          <div>
            <h3 className="mb-3 text-lg font-bold text-slate-900">Reçete Geçmişi</h3>
            {(!data.prescriptions || data.prescriptions.length === 0) ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-600">Henüz reçete yazılmamış</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.prescriptions.map(rx => (
                  <div key={rx.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-4 hover:shadow-sm transition">
                    <div>
                      <p className="text-xs text-slate-500">{new Date(rx.createdAt).toLocaleDateString("tr-TR")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/recete?id=${rx.id}&patientId=${id}`}
                        className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition"
                      >
                        Görüntüle
                      </Link>
                      <button
                        onClick={() => deleteRecete(rx.id)}
                        className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-200 transition"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "notlar" && (

        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h3 className="font-semibold text-gray-700">Hasta Notları</h3>
          <div className="rounded-lg bg-gray-50 border p-3 min-h-24 whitespace-pre-wrap text-sm text-gray-800">
            {data.notes || <span className="text-gray-400 italic">Henüz not eklenmemiş.</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-600 font-medium">Yeni Not Ekle</label>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={3} placeholder="Not yazın..." className="rounded border px-3 py-2 text-sm w-full" />
            <button onClick={saveNote} disabled={noteSaving||!noteText.trim()} className="self-start rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">
              {noteSaving?"Kaydediliyor...":"Not Ekle"}
            </button>
          </div>
        </div>
      )}

      {tab === "lab" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Laboratuvar İşleri</h3>
            <Link href="/lab" className="text-xs text-primary hover:underline">Laboratuvar Sayfasına Git →</Link>
          </div>
          {(!data.labOrders || data.labOrders.length === 0) ? (
            <div className="rounded-xl border bg-white p-8 text-center text-slate-400">
              <svg className="mx-auto mb-3 h-10 w-10 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
              <p>Bu hasta için laboratuvar kaydı bulunmuyor</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-center">
                  <p className="text-xs text-blue-500 font-bold uppercase">Toplam Kayıt</p>
                  <p className="text-2xl font-black text-blue-700">{data.labOrders.length}</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                  <p className="text-xs text-red-500 font-bold uppercase">Toplam Lab Maliyeti</p>
                  <p className="text-2xl font-black text-red-700">₺{data.labOrders.reduce((s,l)=>s+(Number(l.price)||0),0).toLocaleString("tr-TR")}</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
                  <p className="text-xs text-amber-500 font-bold uppercase">Bekleyen</p>
                  <p className="text-2xl font-black text-amber-700">{data.labOrders.filter(l=>l.status!=="HASTAYA_TAKILDI"&&l.status!=="IPTAL").length}</p>
                </div>
              </div>
              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Tarih</th>
                      <th className="px-3 py-2 text-left">Lab Türü</th>
                      <th className="px-3 py-2 text-left">Doktor</th>
                      <th className="px-3 py-2 text-right">Fiyat</th>
                      <th className="px-3 py-2 text-left">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.labOrders.map(l => {
                      const statusCls: Record<string,string> = {
                        SIPARIS_VERILDI: "bg-yellow-100 text-yellow-700",
                        LABORATUVARDA: "bg-blue-100 text-blue-700",
                        KLINIGE_GELDI: "bg-cyan-100 text-cyan-700",
                        HASTAYA_TAKILDI: "bg-green-100 text-green-700",
                        IPTAL: "bg-gray-100 text-gray-500",
                      };
                      return (
                        <tr key={l.id} className="hover:bg-slate-50 transition">
                          <td className="px-3 py-2 text-xs">{new Date(l.createdAt).toLocaleDateString("tr-TR")}</td>
                          <td className="px-3 py-2 font-medium">{l.labType}</td>
                          <td className="px-3 py-2 text-slate-600">{l.doctor?.fullName || "—"}</td>
                          <td className="px-3 py-2 text-right font-bold text-red-600">{l.price ? `₺${Number(l.price).toLocaleString("tr-TR")}` : "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls[l.status] || "bg-gray-100 text-gray-600"}`}>{l.status.replace(/_/g," ")}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "duzenle" && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-4 font-semibold">Hasta Bilgilerini Düzenle</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="text-xs text-gray-600">Ad Soyad</label><input value={editForm.fullName||""} onChange={e=>setEditForm({...editForm,fullName:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">TC Kimlik No</label><input value={editForm.tcNo||""} onChange={e=>setEditForm({...editForm,tcNo:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><PhoneInput label="Telefon" value={editForm.phone||""} onChange={phone=>setEditForm({...editForm,phone})} /></div>
            <div><label className="text-xs text-gray-600">Cinsiyet</label><select value={editForm.gender||""} onChange={e=>setEditForm({...editForm,gender:e.target.value})} className="mt-1 w-full rounded border px-3 py-2"><option value="ERKEK">Erkek</option><option value="KADIN">Kadın</option></select></div>
            <div><label className="text-xs text-gray-600">Doğum Tarihi</label><input type="date" value={(editForm.birthDate as string)||""} onChange={e=>setEditForm({...editForm,birthDate:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">Kan Grubu</label><select value={(editForm as any).bloodType||""} onChange={e=>setEditForm({...editForm,...{bloodType:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2"><option value="">Bilinmiyor</option>{["A+","A-","B+","B-","AB+","AB-","0+","0-"].map(g=><option key={g} value={g}>{g}</option>)}</select></div>
            <div><label className="text-xs text-gray-600">Anlaşmalı Kurum</label><input value={editForm.insurance||""} onChange={e=>setEditForm({...editForm,insurance:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">Referans Eden Kişi</label><input value={(editForm as any).referrer||""} onChange={e=>setEditForm({...editForm,...{referrer:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">İndirim Oranı (%)</label><input type="number" value={editForm.discountRate||0} onChange={e=>setEditForm({...editForm,discountRate:parseInt(e.target.value)||0})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Adres</label><input value={editForm.address||""} onChange={e=>setEditForm({...editForm,address:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">Geçirdiği Ameliyatlar</label><input value={editForm.surgeries||""} onChange={e=>setEditForm({...editForm,surgeries:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div><label className="text-xs text-gray-600">Kullandığı İlaçlar</label><input value={editForm.medications||""} onChange={e=>setEditForm({...editForm,medications:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Diğer Hastalıklar</label><input value={(editForm as any).otherDiseases||""} onChange={e=>setEditForm({...editForm,...{otherDiseases:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2" /></div>
            <div className="md:col-span-2">
              <p className="text-xs text-gray-600 mb-2">Sağlık Durumu</p>
              <div className="flex flex-wrap gap-4">
                {([["hasAllergy","Alerji"],["hasHeart","Kalp Hastalığı"],["hasDiabetes","Diyabet"],["hasKidney","Böbrek Hastalığı"],["hasHepatitis","Hepatit"],["hasBloodIssue","Kan Sorunu"]] as [keyof Patient,string][]).map(([field,label])=>(
                  <label key={field} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editForm[field]} onChange={e=>setEditForm({...editForm,[field]:e.target.checked})} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Notlar</label><textarea value={editForm.notes||""} onChange={e=>setEditForm({...editForm,notes:e.target.value})} rows={2} className="mt-1 w-full rounded border px-3 py-2" /></div>
          </div>
          <button onClick={saveEdit} disabled={editLoading} className="mt-4 rounded bg-primary px-4 py-2 text-white disabled:opacity-50">{editLoading?"Kaydediliyor...":"Kaydet"}</button>
        </div>
      )}

      {/* Tedavi Yazdırma Modalı */}
      {treatmentPrintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Tedavi Raporu Yazdır</h2>
              <button onClick={() => setTreatmentPrintOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Yazdırmak istediğiniz tedavileri seçin. Varsayılan olarak tüm tedaviler seçilidir.</p>
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5 mb-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showPricesInPrint} onChange={e=>setShowPricesInPrint(e.target.checked)} className="rounded"/>
                <span className="font-medium">Fiyatları göster</span>
              </label>
              <span className="text-xs text-slate-400">| Kapatırsanız yazdırma belgesinde fiyatlar gizlenir</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={selectedTreatForPrint.length === (data?.examinations||[]).filter(e=>e.status!=="DIAGNOZ"&&e.status!=="Diagnoz (Ön Teşhis)").length && selectedTreatForPrint.length > 0}
                  onChange={e => {
                    const list = (data?.examinations||[]).filter(e=>e.status!=="DIAGNOZ"&&e.status!=="Diagnoz (Ön Teşhis)");
                    setSelectedTreatForPrint(e.target.checked ? list.map(t=>t.id) : []);
                  }}
                  className="rounded"
                />
                <span className="font-medium">Tümünü seç</span>
              </label>
              <span className="text-xs text-slate-500">{selectedTreatForPrint.length} seçili</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-0.5 border rounded-lg p-2">
              {(data?.examinations||[]).filter(e=>e.status!=="DIAGNOZ"&&e.status!=="Diagnoz (Ön Teşhis)").map(t => (
                <label key={t.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox"
                    checked={selectedTreatForPrint.includes(t.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedTreatForPrint(prev => [...prev, t.id]);
                      else setSelectedTreatForPrint(prev => prev.filter(x => x !== t.id));
                    }}
                    className="rounded"
                  />
                  <span className="flex-1">{t.treatmentName}</span>
                  {t.toothNo && <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Diş {t.toothNo}</span>}
                  <span className="text-xs text-slate-400">{new Date(t.diagnosedAt).toLocaleDateString("tr-TR")}</span>
                  <span className="text-sm font-semibold text-slate-700">₺{Number(t.amount).toLocaleString("tr-TR")}</span>
                </label>
              ))}
              {(data?.examinations||[]).filter(e=>e.status!=="DIAGNOZ"&&e.status!=="Diagnoz (Ön Teşhis)").length === 0 && <p className="text-center text-sm text-slate-400 p-4">Tedavi kaydı yok</p>}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setTreatmentPrintOpen(false)} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Kapat</button>
              <button onClick={() => { doPrintTreatments(); setTreatmentPrintOpen(false); }} disabled={selectedTreatForPrint.length === 0} className="rounded bg-primary px-4 py-2 text-sm text-white font-semibold disabled:opacity-50">🖨 Yazdır ({selectedTreatForPrint.length})</button>
            </div>
          </div>
        </div>
      )}

      {/* Ödeme Yazdırma Modalı */}
      {paymentPrintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Ödeme Geçmişi Yazdır</h2>
              <button onClick={() => setPaymentPrintOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Yazdırmak istediğiniz ödemeleri seçin. Varsayılan olarak tüm ödemeler seçilidir.</p>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={selectedPayForPrint.length === (data?.payments||[]).length && selectedPayForPrint.length > 0}
                  onChange={e => setSelectedPayForPrint(e.target.checked ? (data?.payments||[]).map(p=>p.id) : [])}
                  className="rounded"
                />
                <span className="font-medium">Tümünü seç</span>
              </label>
              <span className="text-xs text-slate-500">{selectedPayForPrint.length} seçili</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-0.5 border rounded-lg p-2">
              {(data?.payments||[]).map(p => (
                <label key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox"
                    checked={selectedPayForPrint.includes(p.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedPayForPrint(prev => [...prev, p.id]);
                      else setSelectedPayForPrint(prev => prev.filter(x => x !== p.id));
                    }}
                    className="rounded"
                  />
                  <span className="flex-1">{({NAKIT:"Nakit",KREDI_KARTI:"Kredi Kartı",HAVALE_EFT:"Havale/EFT",MAIL_ORDER:"Mail Order",DIGER:"Diğer"} as Record<string,string>)[p.method] || p.method}</span>
                  {p.description && <span className="text-xs text-slate-400">{p.description}</span>}
                  <span className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString("tr-TR")}</span>
                  <span className="text-sm font-semibold text-slate-700">₺{Number(p.amount).toLocaleString("tr-TR")}</span>
                </label>
              ))}
              {(data?.payments||[]).length === 0 && <p className="text-center text-sm text-slate-400 p-4">Ödeme kaydı yok</p>}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setPaymentPrintOpen(false)} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Kapat</button>
              <button onClick={() => { doPrintPayments(); setPaymentPrintOpen(false); }} disabled={selectedPayForPrint.length === 0} className="rounded bg-primary px-4 py-2 text-sm text-white font-semibold disabled:opacity-50">🖨 Yazdır ({selectedPayForPrint.length})</button>
            </div>
          </div>
        </div>
      )}
      {/* ===== KlinikSistem tarzı yazdırma alanı — sadece @media print'de görünür ===== */}
      <div id="ks-print-area" />
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #ks-print-area { visibility: visible !important; display: block !important; position: fixed !important; top: 0; left: 0; width: 100%; background: white; z-index: 99999; }
          #ks-print-area * { visibility: visible !important; }
          @page { size: A4; margin: 10mm; }
          #ks-print-area .ks-page { width: 190mm; min-height: 267mm; margin: 0 auto; padding: 0; display: flex; flex-direction: column; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #ks-print-area .ks-frame { border: 1.5px solid #1e3a5f; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
          #ks-print-area .header { background: #1e3a5f !important; color: #fff !important; padding: 7px 14px; display: flex; justify-content: space-between; align-items: center; }
          #ks-print-area .h-title { font-size: 15px; font-weight: 700; letter-spacing: 0.3px; }
          #ks-print-area .h-sub { font-size: 9px; opacity: 0.75; margin-top: 2px; }
          #ks-print-area .h-right { text-align: right; font-size: 10px; }
          #ks-print-area .patient-bar { background: #f1f5f9 !important; border-bottom: 1px solid #e2e8f0; padding: 5px 14px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 9.5px; color: #475569; }
          #ks-print-area .patient-bar strong { color: #1e293b; }
          #ks-print-area .content { padding: 10px 14px; flex: 1; }
          #ks-print-area .sec-title { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a5f; border-bottom: 1px solid #1e3a5f; padding-bottom: 3px; margin: 10px 0 6px; }
          #ks-print-area table { width: 100%; border-collapse: collapse; font-size: 10px; }
          #ks-print-area thead tr { background: #1e3a5f !important; color: #fff !important; }
          #ks-print-area th { padding: 5px 8px; text-align: left; font-weight: 600; font-size: 9px; letter-spacing: 0.3px; }
          #ks-print-area td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
          #ks-print-area tbody tr:nth-child(even) { background: #f8fafc !important; }
          #ks-print-area tfoot td { background: #f1f5f9 !important; font-weight: 700; border-top: 1.5px solid #cbd5e1; font-size: 10px; }
          #ks-print-area .tooth-chart { margin: 4px 0 8px; }
          #ks-print-area .tooth-row { display: flex; justify-content: center; gap: 1px; margin: 1px 0; }
          #ks-print-area .t-cell { width: 20px; height: 22px; text-align: center; font-size: 7.5px; border: 0.5px solid #cbd5e1; display: flex; align-items: center; justify-content: center; border-radius: 2px; font-weight: 500; }
          #ks-print-area .t-div { width: 3px; margin: 0 2px; background: #cbd5e1; }
          #ks-print-area .footer { border-top: 1px solid #e2e8f0; padding: 6px 14px; display: flex; justify-content: space-between; align-items: flex-end; background: #f8fafc !important; font-size: 8.5px; color: #94a3b8; }
          #ks-print-area .sign-area { text-align: center; }
          #ks-print-area .sign-line { border-top: 1px solid #94a3b8; margin-top: 22px; padding-top: 3px; font-size: 8px; color: #94a3b8; }
        }
      `}</style>
    </section>
  );
}

export default function HastaDetayPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <HastaDetayContent />
    </Suspense>
  );
}
