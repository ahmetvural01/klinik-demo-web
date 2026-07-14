"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { OdontogramSelector, ToothStatus as TSType, TOOTH_STATUS_LABELS } from "@/components/ToothChart";
import PhoneInput from "@/components/PhoneInput";
import { PatientConsentPanel } from "@/components/PatientConsentPanel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { LabOrderForm } from "@/components/lab/LabOrderForm";
import { LabOrderDetailPanel, type SharedLabOrder, type SharedLabTrip } from "@/components/lab/LabOrderDetailPanel";
import { MEDICATION_TEMPLATES } from "@/lib/medications";
import { ACTIVE_PRICE_LIST_STORAGE_KEY, TDB_2026_CORE_PRICE_CATALOG } from "@/lib/dental-treatment-catalog";
import { confirmDialog } from "@/lib/confirm-client";
import { addPdfSection, createPdfDoc, pdfSafeText } from "@/lib/pdf-export";
import { cachedGet } from "@/lib/client-cache";

type PatientDocument = {
  id: string;
  category: "BELGE" | "RONTGEN" | "FOTOGRAF";
  fileName: string;
  mimeType: string;
  fileSize: number;
  toothNo?: string | null;
  note?: string | null;
  createdAt: string;
  uploadedBy?: { fullName: string } | null;
};

type LabOrder = { id: string; labName?: string; labType: string; status: string; price?: number | null; notes?: string | null; createdAt: string; doctor?: { fullName: string } | null };
type LabTrip = {
  id: string;
  order: number;
  description: string;
  sentAt: string;
  receivedAt?: string | null;
  sentNote?: string | null;
  receivedNote?: string | null;
};
type LabInvoice = {
  id: string;
  item: string;
  amount: number;
  invoiceNo?: string | null;
  issuedAt: string;
  note?: string | null;
};
type LabOrderDetail = LabOrder & {
  labName?: string;
  teeth?: string | null;
  invoiceNo?: string | null;
  patient?: { id: string; fullName: string; phone?: string | null } | null;
  doctor?: { id?: string; fullName: string } | null;
  trips: LabTrip[];
  invoices: LabInvoice[];
};
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
  referrer?: string | null; profession?: string | null;
  notes?: string | null; address?: string | null; surgeries?: string | null;
  medications?: string | null; otherDiseases?: string | null; bloodType?: string | null;
  toothChart?: string | null; createdAt: string;
  hasAllergy: boolean; hasHepatitis: boolean; hasKidney: boolean;
  hasDiabetes: boolean; hasHeart: boolean; hasBloodIssue: boolean;
  hasContagiousDisease: boolean; contagiousDiseaseNote?: string | null;
  appointments: Appt[]; examinations: Exam[]; payments: Pay[];
  prescriptions: Rx[]; labOrders: LabOrder[]; taksitPlanlari: TaksitPlan[];
};
type Appt = { id: string; startAt: string; endAt: string; type: string; status: string; doctor?: { fullName: string } };
type Exam = { id: string; treatmentName: string; toothNo?: string | null; amount: string | number; status: string; diagnosedAt: string; doctorId: string; doctor?: { id: string; fullName: string } };
type Pay = { id: string; amount: string | number; method: string; description?: string | null; createdAt: string; doctorId?: string | null; doctor?: { id: string; fullName: string } | null; posId?: string | null };
type Rx = { id: string; drugs: string; note?: string | null; createdAt: string };
type StaffLite = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean | null } | null };
type ClinicTask = {
  id: string;
  title: string;
  details?: string | null;
  vendorName?: string | null;
  type: "PARCA_SIPARIS" | "LAB" | "ARAMA" | "EVRAK" | "DIGER";
  priority: number;
  status: "ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";
  dueAt?: string | null;
  remindAt?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
};
type Tab = "bilgi" | "randevular" | "gorevler" | "tedavi" | "odeme" | "recete" | "notlar" | "lab" | "belgeler" | "duzenle";
type ToothStatus = TSType;
type ExportFormat = "pdf" | "excel";
type PatientExportSection = "profile" | "completedTreatments" | "plannedTreatments" | "payments" | "balance" | "appointments" | "labOrders" | "prescriptions" | "documents" | "notes";

type PatientDetailData = Patient & {
  appointments: Appt[];
  examinations: Exam[];
  payments: Pay[];
  prescriptions: Rx[];
  labOrders: LabOrder[];
  taksitPlanlari: TaksitPlan[];
};

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: "bilgi", label: "Özet" },
  { key: "randevular", label: "Randevular" },
  { key: "gorevler", label: "Görevler" },
  { key: "tedavi", label: "Tedavi" },
  { key: "odeme", label: "Finans" },
  { key: "recete", label: "Reçete" },
  { key: "notlar", label: "Notlar" },
  { key: "lab", label: "Laboratuvar" },
  { key: "belgeler", label: "Belgeler & Onam" },
  { key: "duzenle", label: "Düzenle" },
];

const PRIMARY_TAB_ORDER: Tab[] = ["bilgi", "tedavi", "lab", "odeme", "randevular"];
const MORE_TAB_ORDER: Tab[] = ["recete", "notlar", "gorevler", "belgeler", "duzenle"];
const TAB_SHORT_LABELS: Partial<Record<Tab, string>> = {
  bilgi: "Özet",
  tedavi: "Tedavi",
  lab: "Laboratuvar",
  odeme: "Finans",
  randevular: "Randevular",
  recete: "Reçete",
  notlar: "Notlar",
  gorevler: "Görevler",
  belgeler: "Belgeler",
  duzenle: "Hasta Bilgileri",
};

const PATIENT_EXPORT_SECTIONS: { key: PatientExportSection; label: string; description: string }[] = [
  { key: "profile", label: "Hasta Bilgileri", description: "Kimlik, iletişim, sağlık uyarıları ve kurum bilgileri" },
  { key: "completedTreatments", label: "Yapılan Tedaviler", description: "Tamamlanan/ücrete yansıyan tedavi kayıtları" },
  { key: "plannedTreatments", label: "Yapılacak Tedaviler", description: "Muayene listesi ve bekleyen tedavi planı adımları" },
  { key: "payments", label: "Ödemeler", description: "Tahsilat, ödeme yöntemi, POS ve hekim bilgileri" },
  { key: "balance", label: "Kalan Ödeme", description: "Tedavi toplamı, indirim, ödenen ve kalan bakiye özeti" },
  { key: "appointments", label: "Randevular", description: "Geçmiş ve gelecek randevu kayıtları" },
  { key: "labOrders", label: "Laboratuvar", description: "Lab işleri, prova/gönderim, fatura ve firma bağlantısı" },
  { key: "prescriptions", label: "Reçeteler", description: "Yazılan ilaç ve reçete notları" },
  { key: "documents", label: "Belgeler", description: "Belge/röntgen dosya listesi ve onam kayıtları" },
  { key: "notes", label: "Notlar", description: "Hasta dosyasındaki klinik notlar" },
];

const DEFAULT_PATIENT_EXPORT_SELECTION: Record<PatientExportSection, boolean> = {
  profile: true,
  completedTreatments: true,
  plannedTreatments: true,
  payments: true,
  balance: true,
  appointments: false,
  labOrders: false,
  prescriptions: false,
  documents: false,
  notes: false,
};

const isDiagnosisStatus = (status: string | null | undefined) => {
  const normalized = String(status || "").toLocaleLowerCase("tr-TR");
  return normalized.includes("diagnoz") || normalized.includes("ön teşhis") || normalized.includes("on teshis");
};

const isChargeableTreatment = (status: string | null | undefined) => !isDiagnosisStatus(status);

const isEffectiveDoctor = (staff: StaffLite) =>
  staff.role === "DOKTOR" || (staff.role === "YONETICI" && staff.profile?.hideAsDoctor === false);

const TREAT_ADULT_UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const TREAT_ADULT_LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const TREAT_CHILD_UPPER = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"];
const TREAT_CHILD_LOWER = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"];

const TASK_TYPE_LABELS: Record<ClinicTask["type"], string> = {
  PARCA_SIPARIS: "Parça Sipariş",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

const TASK_STATUS_LABELS: Record<ClinicTask["status"], string> = {
  ACIK: "Açık",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

const TAKSIT_PLAN_STATUS_LABELS: Record<string, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
  DEVAM_EDIYOR: "Devam Ediyor",
};

const TAKSIT_ITEM_STATUS_LABELS: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  GECIKTI: "Gecikti",
  IPTAL: "İptal",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

const LAB_CATEGORIES = [
  {
    group: "Sabit Restorasyon",
    items: ["Zirkonyum", "E-max", "Metal Destekli Porselen", "Full Metal", "Kuron Tamir"],
  },
  { group: "Veneer", items: ["Veneer (Laminat)"] },
  {
    group: "Protez",
    items: ["Tam Protez", "Hareketli Kısmi Protez", "Hareketli Kısmi Protez (Metal Kroşe)", "Protez Tamir", "İmmediyat Protez"],
  },
  {
    group: "İmplant Üstü Restorasyon",
    items: ["İmplant Üstü Sabit Restorasyon", "İmplant Üstü Hareketli Protez"],
  },
  {
    group: "Aparey ve Plak",
    items: ["Gece Plağı", "Kas Gevşetici Splint (Michigan)", "Şeffaf Plak (Aligner)", "Braket Reteyner", "Bruksizm Plağı"],
  },
  {
    group: "Estetik & Diğer",
    items: ["Beyazlatma Atel", "Zirkon Alt Yapı", "Braket", "Diğer"],
  },
];

const WORKFLOW_FIRST_STEP: Record<string, { send: string; request: string }> = {
  Zirkonyum: { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
  "E-max": { send: "Ölçü", request: "E-max Prova" },
  "Metal Destekli Porselen": { send: "Ölçü", request: "Metal Alt Yapı Prova" },
  "Full Metal": { send: "Ölçü", request: "Metal Prova" },
  "Veneer (Laminat)": { send: "Ölçü", request: "Wax-up / Mock-up Prova" },
  "İmplant Üstü Sabit Restorasyon": { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
};

// Tam adım zincirleri — laboratuvar sayfasıyla aynı şablon
const WORKFLOW_TEMPLATES: Record<string, { send: string; request: string }[]> = {
  Zirkonyum: [
    { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
    { send: "Zirkonyum Alt Yapı", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "E-max": [
    { send: "Ölçü", request: "E-max Prova" },
    { send: "E-max Prova", request: "Glazeli Bitim" },
  ],
  "Metal Destekli Porselen": [
    { send: "Ölçü", request: "Metal Alt Yapı Prova" },
    { send: "Metal Alt Yapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "Full Metal": [
    { send: "Ölçü", request: "Metal Prova" },
    { send: "Metal Prova", request: "Final Bitim" },
  ],
  "Kuron Tamir": [{ send: "Kırık/Hasarlı Kronkopru", request: "Onarılmış Kronkopru" }],
  "Veneer (Laminat)": [
    { send: "Ölçü", request: "Wax-up / Mock-up Prova" },
    { send: "Mock-up Onayı", request: "Laminat Prova" },
    { send: "Laminat Prova", request: "Glazeli Bitim" },
  ],
  "Tam Protez": [
    { send: "Primer Ölçü", request: "Bireysel Kaşık" },
    { send: "Fonksiyonel Ölçü", request: "Mum Prova" },
    { send: "Mum Prova", request: "Akrilik Prova" },
    { send: "Akrilik Prova", request: "Tam Protez Bitim" },
  ],
  "Hareketli Kısmi Protez": [
    { send: "Ölçü", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Hareketli Kısmi Protez (Metal Kroşe)": [
    { send: "Ölçü", request: "Kroşe Altyapı Prova" },
    { send: "Kroşe Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Protez Tamir": [{ send: "Kırık Protez", request: "Tamir Edilmiş Protez" }],
  "İmplant Üstü Sabit Restorasyon": [
    { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "İmplant Üstü Hareketli Protez": [
    { send: "Ölçü + Bar Ölçüsü", request: "Bar Prova" },
    { send: "Bar Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Gece Plağı": [{ send: "Ölçü", request: "Gece Plağı" }],
  "Kas Gevşetici Splint (Michigan)": [
    { send: "Ölçü", request: "Michigan Splint" },
    { send: "Splint Prova", request: "Oklüzal Ayarlama" },
  ],
  "Şeffaf Plak (Aligner)": [{ send: "Dijital Tarama / Ölçü", request: "Aligner Seti" }],
  "Braket Reteyner": [{ send: "Ölçü", request: "Reteyner" }],
  "Bruksizm Plağı": [{ send: "Ölçü", request: "Bruksizm Plağı" }],
  "Beyazlatma Atel": [{ send: "Ölçü", request: "Beyazlatma Atel" }],
};

function normalizeWorkflowText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/\(final\)/g, "")
    .replace(/son duzeltme\s*\/\s*glaze/g, "glazeli bitim")
    .replace(/glaze/g, "glazeli bitim")
    .replace(/zirkon\s+alt\s*yapi/g, "zirkonyum alt yapi")
    .replace(/zirkon\s+altyapi/g, "zirkonyum alt yapi")
    .replace(/(acik|kisisel)\s+kasik\s+ile\s+olcu/g, "olcu")
    .replace(/(acik|kisisel)\s+kasik\s+olcu/g, "olcu")
    .replace(/\s+/g, " ").trim();
}

function isSameWorkflowValue(left: string, right: string) {
  return normalizeWorkflowText(left) === normalizeWorkflowText(right);
}

function isSpoonRequestItem(value: string) {
  return SPOON_REQUEST_OPTIONS_LAB.some((item) => isSameWorkflowValue(item, value));
}

function getReceivedItemFromNote(note?: string | null, fallback = "") {
  const match = (note || "").match(/LAB_GELEN_IS:([^|]+)/);
  return (match?.[1] || fallback || "").trim();
}

function getNextTemplateStepIndex(labType: string, trips: { description: string; receivedAt?: string | null; receivedNote?: string | null }[]) {
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  if (template.length === 0) return 0;
  let cursor = 0;
  for (const trip of trips) {
    if (cursor >= template.length) break;
    const { sentItem, requestedItem } = splitTripDescription(trip.description);
    if (isSpoonRequestItem(requestedItem || "")) continue;
    const expected = template[cursor];
    if (isSameWorkflowValue(sentItem, expected.send) && isSameWorkflowValue(requestedItem || "", expected.request || "")) {
      const receivedItem = getReceivedItemFromNote(trip.receivedNote, requestedItem || "");
      if (trip.receivedAt && requestedItem && !isSameWorkflowValue(receivedItem, requestedItem)) break;
      cursor += 1;
    }
  }
  return cursor;
}

const SPOON_REQUEST_OPTIONS_LAB = ["Açık Kaşık", "Kişisel Kaşık"];
const SPOON_REQUEST_OPTIONS = ["Açık Kaşık", "Kişisel Kaşık"];
const PROVA_FOLLOW_UP_MARKER = "RANDEVU_PROVA_GEREKLI";
const RECEIVED_ITEM_MARKER = "LAB_GELEN_IS:";

function cleanLabReceivedNote(note?: string | null) {
  return (note || "")
    .replace(`${PROVA_FOLLOW_UP_MARKER} | `, "")
    .replace(PROVA_FOLLOW_UP_MARKER, "")
    .replace(new RegExp(`\\s*\\|?\\s*${RECEIVED_ITEM_MARKER}[^|]*\\|?\\s*`, "g"), " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .trim();
}

function buildLabReceivedNote(baseNote: string, receivedItem: string, needsAppointment: boolean) {
  return [
    needsAppointment ? PROVA_FOLLOW_UP_MARKER : "",
    receivedItem.trim() ? `${RECEIVED_ITEM_MARKER}${receivedItem.trim()}` : "",
    baseNote.trim(),
  ].filter(Boolean).join(" | ") || null;
}

type ImpressionMethod = "" | "KLASIK_OLCU" | "DIJITAL_TARAMA";

function isMeasurementStep(sentItem: string) {
  return /(ölçü|olcu|tarama|scan)/i.test(sentItem);
}

function buildSentNote(baseNote: string, method: ImpressionMethod, sentItem: string) {
  const methodLabel = method === "KLASIK_OLCU" ? "Klasik Ölçü" : method === "DIJITAL_TARAMA" ? "Dijital Tarama" : "";
  const methodPart = methodLabel && isMeasurementStep(sentItem) ? `Ölçü Yöntemi: ${methodLabel}` : "";
  return [methodPart, baseNote.trim()].filter(Boolean).join(" | ") || null;
}

function splitTripDescription(description: string) {
  const parts = String(description || "").split("→");
  const sentItem = (parts[0] || "").trim();
  const requestedItem = (parts[1] || "").trim();
  return { sentItem, requestedItem };
}

function LabDentalChart({ selected, onChange }: { selected: number[]; onChange: (nums: number[]) => void }) {
  const toggle = (num: number) => {
    if (selected.includes(num)) {
      onChange(selected.filter((n) => n !== num));
    } else {
      onChange([...selected, num].sort((a, b) => a - b));
    }
  };

  const selectGroup = (group: number[]) => {
    const allSelected = group.every((n) => selected.includes(n));
    if (allSelected) {
      onChange(selected.filter((n) => !group.includes(n)));
    } else {
      onChange(Array.from(new Set([...selected, ...group])).sort((a, b) => a - b));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {[
          { label: "Üst Çene", group: [...UPPER_RIGHT, ...UPPER_LEFT] },
          { label: "Alt Çene", group: [...LOWER_LEFT, ...LOWER_RIGHT] },
          { label: "Tüm Çene", group: [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT] },
        ].map(({ label, group }) => (
          <button
            key={label}
            type="button"
            onClick={() => selectGroup(group)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
          >
            {label}
          </button>
        ))}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-100"
          >
            Temizle
          </button>
        )}
      </div>

      <OdontogramSelector
        selected={selected.map(String)}
        onToggle={(num) => toggle(Number(num))}
        dentition="adult"
      />

      {selected.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{selected.length} diş</span> seçili: {selected.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function HastaDetayContent() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id") || "";
  const [data, setData] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("bilgi");
  const [payMethod, setPayMethod] = useState("NAKIT");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payPosId, setPayPosId] = useState("");
  const [payDoctorId, setPayDoctorId] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setEditingPaymentId("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount("");
    setPayDesc("");
    setPayPosId("");
    setPayDoctorId("");
    setPayMethod("NAKIT");
  };
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportSelection, setExportSelection] = useState<Record<PatientExportSection, boolean>>(DEFAULT_PATIENT_EXPORT_SELECTION);
  const [exportHideDoctor, setExportHideDoctor] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [docCategory, setDocCategory] = useState<"BELGE" | "RONTGEN" | "FOTOGRAF">("BELGE");
  const [docToothNo, setDocToothNo] = useState("");
  const [docNote, setDocNote] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadError, setDocUploadError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  // Başlangıçta sessionStorage'dan oku — flash'siz render
  const [currentUserRole, setCurrentUserRole] = useState(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("dev-preview-role") || "") : ""
  );

  // Rol bazlı sekme filtreleme
  // BANKO: tedavi, recete, lab sekmeleri API tarafından engellendi
  // DOKTOR: patients:write yetkisi yok — "Düzenle" sekmesi doldurulup kaydedilemez, gösterilmemeli
  const visibleTabItems = TAB_ITEMS.filter(t => {
    if (currentUserRole === "BANKO") return !["tedavi", "recete", "lab", "belgeler"].includes(t.key);
    if (currentUserRole === "DOKTOR") return t.key !== "duzenle";
    return true;
  });
  const [posDevices, setPosDevices] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [editForm, setEditForm] = useState<Partial<Patient & { birthDate: string }>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [clinicTasks, setClinicTasks] = useState<ClinicTask[]>([]);
  const [treatmentPlans, setTreatmentPlans] = useState<{ id: string; title: string; status: string; totalCost: number | string | null; steps: { id: string }[] }[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<ClinicTask["type"]>("PARCA_SIPARIS");
  const [taskPriority, setTaskPriority] = useState(2);
  const [taskAssignedToId, setTaskAssignedToId] = useState("");
  const [taskVendor, setTaskVendor] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState("");
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
  const [examInlineEdits, setExamInlineEdits] = useState<Record<string, { amount: string; doctorId: string; toothNo?: string; treatmentName?: string; diagnosedAt?: string }>>({});
  const [selectedDiagnozIds, setSelectedDiagnozIds] = useState<string[]>([]);
  const [bulkConverting, setBulkConverting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [examSavingId, setExamSavingId] = useState<string | null>(null);
  // Tedavi formu - muayene tarzı
  const [priceList, setPriceList] = useState<{id:string;code?:string;treatment:string;amount:number;isTemplate?:boolean}[]>([]);
  const [treatDropdownId, setTreatDropdownId] = useState("");
  const [treatmentQuery, setTreatmentQuery] = useState("");
  const [treatmentDropdownOpen, setTreatmentDropdownOpen] = useState(false);
  const [treatCustomAmount, setTreatCustomAmount] = useState("");
  const [treatSelectedTeeth, setTreatSelectedTeeth] = useState<string[]>([]);
  const [treatToothType, setTreatToothType] = useState<"adult"|"child">("adult");
  const [treatDoctorId, setTreatDoctorId] = useState("");
  const [doctorOptions, setDoctorOptions] = useState<StaffLite[]>([]);
  const [globalLabNames, setGlobalLabNames] = useState<string[]>([]);
  const [clinicName, setClinicName] = useState("");
  const [activePriceList, setActivePriceList] = useState<"standard" | "custom">("standard");
  const [priceListSourceReady, setPriceListSourceReady] = useState(false);

  // Finans / taksitlendirme
  const [installmentLoading, setInstallmentLoading] = useState(false);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  const [installmentStep, setInstallmentStep] = useState<"borç" | "plan" | "onay">("borç");
  const actionMenuRef = useRef<HTMLDetailsElement>(null);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const [installmentForm, setInstallmentForm] = useState({
    toplamBorc: "",
    pesnat: "0",
    taksitSayisi: "3",
    period: "AYLIK" as const,
    startDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });
  const [installmentPreview, setInstallmentPreview] = useState<{date: string; amount: number}[]>([]);

  // Laboratuvar süreç yönetimi (hasta-detay içi)
  const [labDetailModalOpen, setLabDetailModalOpen] = useState(false);
  const [labDetailLoading, setLabDetailLoading] = useState(false);
  const [labActionSaving, setLabActionSaving] = useState(false);
  const [labActionError, setLabActionError] = useState("");
  const [labSelectedOrderId, setLabSelectedOrderId] = useState("");
  const [labOrderDetail, setLabOrderDetail] = useState<LabOrderDetail | null>(null);
  const [labCreateModalOpen, setLabCreateModalOpen] = useState(false);
  const [labCreateSaving, setLabCreateSaving] = useState(false);
  const [labCreateError, setLabCreateError] = useState("");
  const [labNewForm, setLabNewForm] = useState({
    doctorId: "",
    labName: "",
    customLabName: "",
    labType: "",
    teeth: "",
    notes: "",
    sentItem: "",
    requestedItem: "",
    impressionMethod: "" as ImpressionMethod,
  });
  const [labNewDoctorSearch, setLabNewDoctorSearch] = useState("");
  const [labNewLabSearch, setLabNewLabSearch] = useState("");
  const [labNewTypeSearch, setLabNewTypeSearch] = useState("");
  const [labTripForm, setLabTripForm] = useState({
    sentItem: "",
    requestedItem: "",
    impressionMethod: "" as ImpressionMethod,
    sentAt: new Date().toISOString().slice(0, 10),
    sentNote: "",
  });
  const [labTripSuggested, setLabTripSuggested] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [labTripEditForm, setLabTripEditForm] = useState({
    sentItem: "",
    requestedItem: "",
    sentAt: new Date().toISOString().slice(0, 10),
    sentNote: "",
  });
  const [labDetailAction, setLabDetailAction] = useState<"trip" | "receive" | "invoice" | "rpt" | "editTrip" | null>(null);
  const [labActiveTrip, setLabActiveTrip] = useState<LabTrip | null>(null);
  const [labReceiveForm, setLabReceiveForm] = useState({
    receivedAt: new Date().toISOString().slice(0, 10),
    receivedItem: "",
    receivedNote: "",
    needsAppointment: true,
  });
  const [labInvoiceForm, setLabInvoiceForm] = useState({
    item: "",
    amount: "",
    invoiceNo: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [labRptReason, setLabRptReason] = useState("");

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

  const toDateInputValue = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const knownLabs = useMemo(() => {
    return Array.from(new Set(globalLabNames.map((name) => name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  }, [globalLabNames]);

  const labNewDoctorOptions = useMemo(() => {
    const q = labNewDoctorSearch.trim().toLocaleLowerCase("tr-TR");
    return doctorOptions
      .filter((doctor) => !q || doctor.fullName.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 40)
      .map((doctor) => ({ id: doctor.id, label: doctor.fullName }));
  }, [doctorOptions, labNewDoctorSearch]);

  const labNewLabOptions = useMemo(() => {
    const q = labNewLabSearch.trim().toLocaleLowerCase("tr-TR");
    return knownLabs
      .filter((lab) => !q || lab.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 40)
      .map((lab) => ({ id: lab, label: lab }));
  }, [knownLabs, labNewLabSearch]);

  const labNewTypeOptions = useMemo(() => {
    const q = labNewTypeSearch.trim().toLocaleLowerCase("tr-TR");
    return LAB_CATEGORIES
      .flatMap((category) => category.items.map((item) => ({ id: item, label: item, meta: category.group })))
      .filter((type) => !q || type.label.toLocaleLowerCase("tr-TR").includes(q) || type.meta.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 60);
  }, [labNewTypeSearch]);

  const syncTabInUrl = (nextTab: Tab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    syncTabInUrl(nextTab);
  };
  const closeActionMenu = () => {
    if (actionMenuRef.current) actionMenuRef.current.open = false;
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const menu = actionMenuRef.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const visibleTabKeys = new Set(visibleTabItems.map((item) => item.key));
  const primaryTabs = PRIMARY_TAB_ORDER.filter((key) => visibleTabKeys.has(key));
  const moreTabs = MORE_TAB_ORDER.filter((key) => visibleTabKeys.has(key));
  const isMoreTabActive = moreTabs.includes(tab);
  const tabLabel = (key: Tab) => TAB_SHORT_LABELS[key] || TAB_ITEMS.find((item) => item.key === key)?.label || key;

  const toBirthDateIso = (value?: string | null) => value ? new Date(value + "T00:00:00.000Z").toISOString() : null;

  const updatePatient = async (payload: Record<string, unknown>) => {
    return fetch("/api/patients/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  };

  const load = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const [res, taskRes, planRes] = await Promise.all([
        fetch("/api/patients/" + id, { cache: "no-store" }),
        fetch(`/api/clinic-tasks?patientId=${id}&take=200`, { cache: "no-store" }),
        // Hasta detayında tedavi planları hiç görünmüyordu — hasta-detay ile
        // tedavi-plani arasındaki zincir kopuktu (bkz. denetim raporu Tema 6/7).
        fetch(`/api/treatment-plans?patientId=${id}&take=50`, { cache: "no-store" }),
      ]);
      if (!res.ok) {
        setData(null);
        setLoadError(res.status === 404 ? "Hasta bulunamadı" : "Hasta kartı yüklenemedi");
        return;
      }

      const d = await res.json();
      const taskJson = await taskRes.json().catch(() => []);
      const planJson = await planRes.json().catch(() => ({ items: [] }));
      const normalizedData: PatientDetailData = {
        ...d,
        appointments: Array.isArray(d?.appointments) ? d.appointments : [],
        examinations: Array.isArray(d?.examinations) ? d.examinations : [],
        payments: Array.isArray(d?.payments) ? d.payments : [],
        prescriptions: Array.isArray(d?.prescriptions) ? d.prescriptions : [],
        labOrders: Array.isArray(d?.labOrders) ? d.labOrders : [],
        taksitPlanlari: Array.isArray(d?.taksitPlanlari) ? d.taksitPlanlari : [],
      };
      setData(normalizedData);
      setClinicTasks(Array.isArray(taskJson) ? taskJson : []);
      setTreatmentPlans(Array.isArray(planJson?.items) ? planJson.items : []);
      // Sessiz (gerçek zamanlı) yenilemede duzenle formunu ezmiyoruz — kullanıcı o an
      // formu dolduruyor olabilir.
      if (!silent || tab !== "duzenle") {
        setEditForm({
          fullName: normalizedData.fullName, tcNo: normalizedData.tcNo, phone: normalizedData.phone, gender: normalizedData.gender,
          address: normalizedData.address || "", insurance: normalizedData.insurance || "", referrer: normalizedData.referrer || "", profession: normalizedData.profession || "",
          discountRate: normalizedData.discountRate, notes: normalizedData.notes || "",
          surgeries: normalizedData.surgeries || "", medications: normalizedData.medications || "",
          otherDiseases: normalizedData.otherDiseases || "", bloodType: normalizedData.bloodType || "",
          birthDate: normalizedData.birthDate ? new Date(normalizedData.birthDate).toISOString().slice(0, 10) : "",
          hasAllergy: normalizedData.hasAllergy, hasHepatitis: normalizedData.hasHepatitis, hasKidney: normalizedData.hasKidney,
          hasDiabetes: normalizedData.hasDiabetes, hasHeart: normalizedData.hasHeart, hasBloodIssue: normalizedData.hasBloodIssue,
          hasContagiousDisease: normalizedData.hasContagiousDisease, contagiousDiseaseNote: normalizedData.contagiousDiseaseNote || ""
        });
      }
      if (normalizedData.toothChart) {
        try { setToothMap(JSON.parse(normalizedData.toothChart)); } catch { setToothMap({}); }
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setTab("bilgi");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") !== "bilgi") {
        params.set("tab", "bilgi");
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Başka bir personel bu hastaya ödeme/borç/randevu/tedavi kaydı eklediğinde
  // sayfayı sessizce (tam ekran yenileme olmadan) güncelle.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(true); }, 400);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(true);
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Laboratuvar gönderim formu otomatik taslak doldurma
  useEffect(() => {
    if (!labOrderDetail || labTripSuggested) return;
    const template = WORKFLOW_TEMPLATES[labOrderDetail.labType] ?? [];
    const stepIndex = getNextTemplateStepIndex(labOrderDetail.labType, labOrderDetail.trips);
    const suggestion = template[stepIndex] ?? null;
    if (!suggestion || labTripForm.sentItem) return;

    const receivedSpoonItem = [...labOrderDetail.trips]
      .reverse()
      .map((t) => ({ ...t, parts: splitTripDescription(t.description) }))
      .find((t) => Boolean(t.receivedAt) && isSpoonRequestItem(t.parts.requestedItem || ""))
      ?.parts.requestedItem;
    const suggestedSend =
      suggestion && stepIndex === 0 && receivedSpoonItem
        ? `${receivedSpoonItem} ile Ölçü`
        : suggestion.send;

    setLabTripForm((prev) => ({
      ...prev,
      sentItem: suggestedSend,
      requestedItem: suggestion.request,
    }));
    setLabTripSuggested(true);
  }, [labOrderDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLabOrderDetail = async (orderId: string) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`/api/lab-orders/${orderId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const err = new Error(payload?.error || "Laboratuvar detayı alınamadı");
          // Geçici sunucu/bağlantı hatalarında 1 kez otomatik yeniden dene.
          if (response.status >= 500 && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw err;
        }

        const detail = payload as LabOrderDetail;
        setLabOrderDetail(detail);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Laboratuvar detayı alınamadı");
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
      }
    }

    throw lastError || new Error("Laboratuvar detayı alınamadı");
  };

  const openLabCreateModal = () => {
    setLabCreateError("");
    const defaultDoctorId = doctorOptions[0]?.id || "";
    const defaultLabName = knownLabs[0] || "";
    setLabNewForm({
      doctorId: defaultDoctorId,
      labName: defaultLabName,
      customLabName: "",
      labType: "",
      teeth: "",
      notes: "",
      sentItem: "",
      requestedItem: "",
      impressionMethod: "",
    });
    setLabNewDoctorSearch(doctorOptions.find((d) => d.id === defaultDoctorId)?.fullName || "");
    setLabNewLabSearch(defaultLabName);
    setLabNewTypeSearch("");
    setLabCreateModalOpen(true);
  };

  const closeLabCreateModal = () => {
    setLabCreateModalOpen(false);
    setLabCreateSaving(false);
    setLabCreateError("");
  };

  const createOrderFromPatientDetail = async () => {
    const resolvedLabName = labNewForm.labName.trim();
    if (!id || !labNewForm.doctorId || !resolvedLabName || !labNewForm.labType.trim()) return;
    if (!knownLabs.includes(resolvedLabName)) {
      setLabCreateError("Laboratuvar önce Firma Kartları ekranında Laboratuvar olarak işaretlenmelidir.");
      return;
    }

    setLabCreateSaving(true);
    setLabCreateError("");
    try {
      const firstDescription = labNewForm.requestedItem.trim()
        ? `${labNewForm.sentItem.trim()} → ${labNewForm.requestedItem.trim()}`
        : labNewForm.sentItem.trim();

      const createResponse = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: id,
          doctorId: labNewForm.doctorId,
          labName: resolvedLabName,
          labType: labNewForm.labType.trim(),
          teeth: labNewForm.teeth.trim() || null,
          notes: labNewForm.notes.trim() || null,
          firstTrip: labNewForm.sentItem.trim()
            ? {
                description: firstDescription,
                sentNote: buildSentNote("", labNewForm.impressionMethod, labNewForm.sentItem),
              }
            : null,
        }),
      });

      const createdPayload = await createResponse.json().catch(() => null);
      if (!createResponse.ok) throw new Error(createdPayload?.error || "Laboratuvar işi oluşturulamadı");

      await load();
      closeLabCreateModal();
      showToast("success", "Laboratuvar işi oluşturuldu");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Laboratuvar işi oluşturulamadı";
      setLabCreateError(msg);
      showToast("error", msg);
    } finally {
      setLabCreateSaving(false);
    }
  };

  const openLabDetailModal = async (orderId: string) => {
    setLabSelectedOrderId(orderId);
    setLabDetailModalOpen(true);
    setLabDetailLoading(true);
    setLabActionError("");
    setEditingTripId(null);
    try {
      await refreshLabOrderDetail(orderId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Laboratuvar detayı alınamadı";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabDetailLoading(false);
    }
  };

  const closeLabDetailModal = () => {
    setLabDetailModalOpen(false);
    setLabDetailLoading(false);
    setLabActionSaving(false);
    setLabActionError("");
    setLabSelectedOrderId("");
    setLabOrderDetail(null);
    setLabTripForm({ sentItem: "", requestedItem: "", impressionMethod: "", sentAt: new Date().toISOString().slice(0, 10), sentNote: "" });
    setLabTripSuggested(false);
    setLabTripEditForm({ sentItem: "", requestedItem: "", sentAt: new Date().toISOString().slice(0, 10), sentNote: "" });
    setEditingTripId(null);
    setLabDetailAction(null);
    setLabActiveTrip(null);
    setLabActionError("");
    setLabReceiveForm({ receivedAt: new Date().toISOString().slice(0, 10), receivedItem: "", receivedNote: "", needsAppointment: true });
    setLabInvoiceForm({ item: "", amount: "", invoiceNo: "", issuedAt: new Date().toISOString().slice(0, 10), note: "" });
    setLabRptReason("");
  };

  const createTripFromPatientDetail = async () => {
    if (!labOrderDetail || !labTripForm.sentItem.trim()) return;
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const description = labTripForm.requestedItem.trim()
        ? `${labTripForm.sentItem.trim()} → ${labTripForm.requestedItem.trim()}`
        : labTripForm.sentItem.trim();

      const response = await fetch(`/api/lab-orders/${labOrderDetail.id}/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          sentAt: labTripForm.sentAt,
          sentNote: buildSentNote(labTripForm.sentNote.trim(), labTripForm.impressionMethod, labTripForm.sentItem) || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Laboratuvar gönderimi eklenemedi");

      await Promise.all([refreshLabOrderDetail(labOrderDetail.id), load()]);
      setLabTripForm({ sentItem: "", requestedItem: "", impressionMethod: "", sentAt: new Date().toISOString().slice(0, 10), sentNote: "" });
      setLabTripSuggested(false);
      showToast("success", "Laboratuvar gönderimi eklendi");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Laboratuvar gönderimi eklenemedi";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  const startEditTripFromPatientDetail = (trip: LabTrip) => {
    const parsed = splitTripDescription(trip.description);
    setEditingTripId(trip.id);
    setLabTripEditForm({
      sentItem: parsed.sentItem,
      requestedItem: parsed.requestedItem,
      sentAt: trip.sentAt ? new Date(trip.sentAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      sentNote: trip.sentNote || "",
    });
  };

  const cancelEditTripFromPatientDetail = () => {
    setEditingTripId(null);
    setLabTripEditForm({ sentItem: "", requestedItem: "", sentAt: new Date().toISOString().slice(0, 10), sentNote: "" });
  };

  const saveTripEditFromPatientDetail = async () => {
    if (!labOrderDetail || !editingTripId || !labTripEditForm.sentItem.trim()) return;
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const description = labTripEditForm.requestedItem.trim()
        ? `${labTripEditForm.sentItem.trim()} → ${labTripEditForm.requestedItem.trim()}`
        : labTripEditForm.sentItem.trim();

      const response = await fetch(`/api/lab-orders/${labOrderDetail.id}/trips/${editingTripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          sentAt: labTripEditForm.sentAt,
          sentNote: labTripEditForm.sentNote.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Adım güncellenemedi");

      await Promise.all([refreshLabOrderDetail(labOrderDetail.id), load()]);
      cancelEditTripFromPatientDetail();
      showToast("success", "Adım güncellendi");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Adım güncellenemedi";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  const closeLabDetailAction = () => {
    setLabDetailAction(null);
    setLabActiveTrip(null);
    setLabActionError("");
    setLabRptReason("");
    cancelEditTripFromPatientDetail();
  };

  const toLocalLabTrip = (trip: SharedLabTrip): LabTrip => ({
    id: trip.id,
    order: Number(trip.order || 0),
    description: trip.description || "",
    sentAt: trip.sentAt,
    receivedAt: trip.receivedAt || null,
    sentNote: trip.sentNote || null,
    receivedNote: trip.receivedNote || null,
  });

  const openPatientLabTripAction = () => {
    if (!labOrderDetail) return;
    const template = WORKFLOW_TEMPLATES[labOrderDetail.labType] ?? [];
    const stepIndex = getNextTemplateStepIndex(labOrderDetail.labType, labOrderDetail.trips);
    const suggestion = template[stepIndex] ?? null;
    setLabTripForm((prev) => ({
      ...prev,
      sentItem: prev.sentItem || suggestion?.send || "",
      requestedItem: prev.requestedItem || suggestion?.request || "",
      sentAt: new Date().toISOString().slice(0, 10),
    }));
    setLabDetailAction("trip");
  };

  const openPatientLabReceiveAction = (_order: SharedLabOrder, trip: SharedLabTrip) => {
    setLabActiveTrip(toLocalLabTrip(trip));
    const parts = splitTripDescription(trip.description);
    setLabReceiveForm({
      receivedAt: new Date().toISOString().slice(0, 10),
      receivedItem: getReceivedItemFromNote(trip.receivedNote, parts.requestedItem || parts.sentItem),
      receivedNote: cleanLabReceivedNote(trip.receivedNote),
      needsAppointment: true,
    });
    setLabDetailAction("receive");
  };

  const openPatientLabInvoiceAction = (order: SharedLabOrder) => {
    setLabInvoiceForm({
      item: order.labType || "Laboratuvar ücreti",
      amount: "",
      invoiceNo: "",
      issuedAt: new Date().toISOString().slice(0, 10),
      note: "",
    });
    setLabDetailAction("invoice");
  };

  const openPatientLabEditTripAction = (_order: SharedLabOrder, trip: SharedLabTrip) => {
    const localTrip = toLocalLabTrip(trip);
    setLabActiveTrip(localTrip);
    startEditTripFromPatientDetail(localTrip);
    setLabDetailAction("editTrip");
  };

  const createTripAndCloseFromPatientDetail = async () => {
    await createTripFromPatientDetail();
    setLabDetailAction(null);
  };

  const saveTripEditAndCloseFromPatientDetail = async () => {
    await saveTripEditFromPatientDetail();
    setLabDetailAction(null);
    setLabActiveTrip(null);
  };

  const markTripReceivedFromPatientDetail = async () => {
    if (!labOrderDetail || !labActiveTrip) return;
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const finalNote = buildLabReceivedNote(labReceiveForm.receivedNote, labReceiveForm.receivedItem, labReceiveForm.needsAppointment);
      const response = await fetch(`/api/lab-orders/${labOrderDetail.id}/trips/${labActiveTrip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receivedAt: labReceiveForm.receivedAt,
          receivedNote: finalNote || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Geliş kaydedilemedi");

      await Promise.all([refreshLabOrderDetail(labOrderDetail.id), load()]);
      closeLabDetailAction();
      showToast("success", labReceiveForm.needsAppointment ? "Geliş kaydedildi, hasta takip aksiyonu açıldı" : "Geliş kaydedildi");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Geliş kaydedilemedi";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  const addLabInvoiceFromPatientDetail = async () => {
    if (!labOrderDetail || !labInvoiceForm.item.trim() || !labInvoiceForm.amount) return;
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const response = await fetch(`/api/lab-orders/${labOrderDetail.id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: labInvoiceForm.item.trim(),
          amount: Number(labInvoiceForm.amount),
          invoiceNo: labInvoiceForm.invoiceNo.trim() || null,
          issuedAt: labInvoiceForm.issuedAt,
          note: labInvoiceForm.note.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Fatura eklenemedi");

      await Promise.all([refreshLabOrderDetail(labOrderDetail.id), load()]);
      closeLabDetailAction();
      showToast("success", "Laboratuvar faturası eklendi");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fatura eklenemedi";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  const completeLabOrderFromPatientDetail = async (order: SharedLabOrder) => {
    if (!(await confirmDialog("Laboratuvar işi tamamlandı olarak işaretlensin mi?"))) return;
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const response = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "HASTAYA_TAKILDI" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "İş tamamlanamadı");

      await Promise.all([refreshLabOrderDetail(order.id), load()]);
      showToast("success", "Laboratuvar işi tamamlandı");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "İş tamamlanamadı";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  const openPatientLabRptAction = () => {
    setLabRptReason("");
    setLabDetailAction("rpt");
  };

  const reopenLabOrderAsRptFromPatientDetail = async () => {
    if (!labOrderDetail || !labRptReason.trim()) return;
    const firstStep = (WORKFLOW_TEMPLATES[labOrderDetail.labType] || [])[0];
    const restartDescription = firstStep ? `${firstStep.send} → ${firstStep.request}` : "Ölçü";
    setLabActionSaving(true);
    setLabActionError("");
    try {
      const response = await fetch(`/api/lab-orders/${labOrderDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RPT_REOPEN",
          reason: labRptReason.trim(),
          restartDescription,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "RPT olarak yeniden açılamadı");

      await Promise.all([refreshLabOrderDetail(labOrderDetail.id), load()]);
      closeLabDetailAction();
      showToast("success", "Laboratuvar işi RPT olarak yeniden açıldı");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "RPT olarak yeniden açılamadı";
      setLabActionError(msg);
      showToast("error", msg);
    } finally {
      setLabActionSaving(false);
    }
  };

  // Installment modal Escape key handler
  useEffect(() => {
    if (!installmentModalOpen) return;

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInstallmentModalOpen(false);
        setInstallmentStep("borç");
        setInstallmentForm({toplamBorc: "", pesnat: "0", taksitSayisi: "3", period: "AYLIK", startDate: new Date().toISOString().slice(0, 10), notes: ""});
        setInstallmentPreview([]);
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [installmentModalOpen]);

  useEffect(() => {
    const storedPriceList = window.localStorage.getItem(ACTIVE_PRICE_LIST_STORAGE_KEY);
    if (storedPriceList === "standard" || storedPriceList === "custom") setActivePriceList(storedPriceList);

    fetch("/api/pos-devices")
      .then(r => r.ok ? r.json() : [])
      .then((devs: { id: string; name: string; isActive: boolean }[]) => setPosDevices(devs.filter(d => d.isActive)))
      .catch(() => {});

    cachedGet<{ id?: string; role?: string } | null>("/api/auth/me", 60_000)
      .then(d => {
        setCurrentUserId(d?.id || "");
        const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
        const effectiveRole = preview || d?.role || "";
        if (effectiveRole) setCurrentUserRole(effectiveRole);
        if (d?.id) setTreatDoctorId(d.id);
      })
      .catch(() => {});

    cachedGet<StaffLite[]>("/api/staff", 60_000)
      .then((list) => setDoctorOptions((list || []).filter(isEffectiveDoctor)))
      .catch(() => {});

    cachedGet<{ name?: string; kategori?: string; isActive?: boolean }[]>("/api/firma", 60_000)
      .then((rows) => {
        const names = (Array.isArray(rows) ? rows : [])
          .filter((firma) => firma.kategori === "LAB" && firma.name)
          .map((firma) => String(firma.name).trim())
          .filter(Boolean);
        setGlobalLabNames(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "tr")));
      })
      .catch(() => {});

    cachedGet<any>("/api/settings", 60_000)
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

  const saveActivePriceList = async (next: "standard" | "custom") => {
    setActivePriceList(next);
    window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, next);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activePriceList: next }),
      });
      if (!res.ok) throw new Error("settings");
      showToast("success", next === "custom" ? "Özel fiyat listesi kullanılacak" : "TDB 2026 tarifesi kullanılacak");
    } catch {
      showToast("error", "Fiyat kaynağı kaydedilemedi");
    }
  };

  const addDirectToExaminationList = async (toothNo?: string) => {
    if (!treatDropdownId) return showToast("error", "Önce tedavi seçin");
    if (!treatDoctorId && !currentUserId) return showToast("error", "Önce doktor seçin");

    const fallbackTreatmentPool = TDB_2026_CORE_PRICE_CATALOG;
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

  const addTeethToExaminationList = async (_teeth: string[], label: string) => {
    if (treatmentSaving) return;
    if (!treatDropdownId) return showToast("error", "Önce tedavi seçin");
    if (!treatDoctorId && !currentUserId) return showToast("error", "Önce doktor seçin");

    const selected = [...priceList, ...TDB_2026_CORE_PRICE_CATALOG].find(p => p.id === treatDropdownId);
    if (!selected) return showToast("error", "Geçerli bir tedavi seçin");

    setTreatmentSaving(true);
    try {
      const res = await fetch("/api/examinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: id,
          doctorId: treatDoctorId || currentUserId,
          treatmentName: selected.treatment,
          toothNo: label,
          amount: treatCustomAmount ? Number(treatCustomAmount) : Number(selected.amount || 0),
          status: "Diagnoz (Ön Teşhis)",
          diagnosedAt: new Date().toISOString(),
          note: newTreatmentNote || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `${label} kaydı eklenemedi`);
      }
      showToast("success", `${label} için tek muayene kaydı eklendi`);
      void load();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Çene seçimi eklenemedi");
    } finally {
      setTreatmentSaving(false);
    }
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
    // Kuruş küsuratı son taksite eklenir; aksi halde taksitlerin toplamı "remaining"i tutturamaz
    // ve hasta hesabında asla kapanmayan bir kuruş bakiyesi kalır.
    const perInstallment = Math.round((remaining / installmentCount) * 100) / 100;

    const daysMap: Record<string, number> = {HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30, IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365};
    const daysDiff = daysMap[installmentForm.period] || 30;
    const startDate = new Date(installmentForm.startDate);

    const preview = Array.from({length: installmentCount}, (_, i) => {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (i * daysDiff));
      const isLast = i === installmentCount - 1;
      const amount = isLast
        ? Math.round((remaining - perInstallment * (installmentCount - 1)) * 100) / 100
        : perInstallment;
      return {date: dueDate.toISOString().slice(0, 10), amount};
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
        baslik: `${installmentPreview.length} Taksitli Ödeme - ${new Date().toLocaleDateString("tr-TR")}`,
        toplamBorc: totalDebt,
        pesnat: downPayment,
        taksitSayisi: installmentPreview.length,
        period: installmentForm.period,
        startDate: installmentForm.startDate,
        notes: installmentForm.notes || undefined,
        taksitler: installmentPreview.map((p, i) => ({ siraNo: i + 1, date: p.date, amount: p.amount }))
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

  const buildToothChartHtml = (map: Record<string, string>): string => {
    const rows = Object.entries(map)
      .filter(([, status]) => status && status !== "saglikli")
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([tooth, status]) => `<tr><td>${tooth}</td><td>${TOOTH_STATUS_LABELS[status as ToothStatus] || status}</td></tr>`)
      .join("");

    return `<table class="tooth-chart"><thead><tr><th>Diş No</th><th>Durum</th></tr></thead><tbody>${rows || `<tr><td colspan="2" style="text-align:center;color:#94a3b8">İşaretli diş kaydı yok</td></tr>`}</tbody></table>`;
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
      <div><div class="h-title">${clinicName || "Klinik"}</div><div class="h-sub">Diş Sağlığı Merkezi</div></div>
      <div class="h-right"><div style="font-size:12px;font-weight:700;letter-spacing:1px">${docType}</div><div style="font-size:9px;opacity:0.8">${new Date().toLocaleDateString("tr-TR")}</div></div>
    </div>`;
  };

  const openTreatmentPrint = () => {
    const list = (data?.examinations || []).filter(e => isChargeableTreatment(e.status));
    setSelectedTreatForPrint(list.map(t => t.id));
    setTreatmentPrintOpen(true);
  };

  const doPrintTreatments = () => {
    if (!data) return;
    const selected = (data.examinations || []).filter(e => isChargeableTreatment(e.status) && selectedTreatForPrint.includes(e.id));
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
    const toothNo = editVals?.toothNo ?? exam.toothNo ?? undefined;
    const treatmentName = (editVals?.treatmentName ?? exam.treatmentName).trim() || exam.treatmentName;
    const diagnosedAt = editVals?.diagnosedAt ? new Date(`${editVals.diagnosedAt}T12:00:00.000Z`).toISOString() : exam.diagnosedAt;
    if (!doctorId) return showToast("error", "Doktor seçilmedi");

    setExamSavingId(exam.id);
    const res = await fetch("/api/examinations/" + exam.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Tedavi (Ücretli)",
        treatmentName,
        toothNo,
        amount,
        diagnosedAt,
        doctorId,
      })
    });
    setExamSavingId(null);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Tedaviye aktarma başarısız");
    }

    showToast("success", `"${treatmentName}" tedaviye aktarıldı`);
    setExamInlineEdits(prev => { const n = {...prev}; delete n[exam.id]; return n; });
    setSelectedDiagnozIds(prev => prev.filter(x => x !== exam.id));
    void load();
  };

  const saveExamInlineEdit = async (exam: Exam) => {
    const editVals = examInlineEdits[exam.id];
    if (!editVals) return;
    const toothNo = editVals.toothNo ?? exam.toothNo ?? undefined;
    const treatmentName = (editVals.treatmentName ?? exam.treatmentName).trim();
    if (!treatmentName) return showToast("error", "Tedavi adı boş olamaz");
    const diagnosedAt = editVals.diagnosedAt ? new Date(`${editVals.diagnosedAt}T12:00:00.000Z`).toISOString() : exam.diagnosedAt;
    setExamSavingId(exam.id);
    const res = await fetch("/api/examinations/" + exam.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: exam.status,
        treatmentName,
        toothNo,
        amount: Number(editVals.amount) || 0,
        diagnosedAt,
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
    if (!(await confirmDialog(`${selectedDiagnozIds.length} muayene kaydı tedaviye aktarılsın mı?`))) return;
    setBulkConverting(true);
    const examList = (data?.examinations || []).filter(e => isDiagnosisStatus(e.status));
    let errCount = 0;
    for (const eId of selectedDiagnozIds) {
      const exam = examList.find(e => e.id === eId);
      if (!exam) { errCount++; continue; }
      const editVals = examInlineEdits[eId];
      const amount = editVals ? (Number(editVals.amount) || 0) : Number(exam.amount || 0);
      const doctorId = editVals?.doctorId || exam.doctorId || currentUserId;
      const toothNo = editVals?.toothNo ?? exam.toothNo ?? undefined;
      const treatmentName = (editVals?.treatmentName ?? exam.treatmentName).trim() || exam.treatmentName;
      const diagnosedAt = editVals?.diagnosedAt ? new Date(`${editVals.diagnosedAt}T12:00:00.000Z`).toISOString() : exam.diagnosedAt;
      if (!doctorId) { errCount++; continue; }
      const res = await fetch("/api/examinations/" + eId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Tedavi (Ücretli)",
          treatmentName,
          toothNo,
          amount,
          diagnosedAt,
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

  const bulkDeleteDiagnozlar = async () => {
    if (selectedDiagnozIds.length === 0) return;
    const selectedCount = selectedDiagnozIds.length;
    if (!(await confirmDialog({
      message: `${selectedCount} bekleyen tedavi kaydı silinsin mi? Bu işlem geri alınamaz.`,
      danger: true,
      confirmText: "Sil",
    }))) return;

    setBulkDeleting(true);
    let errCount = 0;
    for (const eId of selectedDiagnozIds) {
      const res = await fetch("/api/examinations/" + eId, { method: "DELETE" });
      if (!res.ok) errCount++;
    }
    setBulkDeleting(false);
    if (errCount > 0) showToast("error", `${errCount} kayıt silinemedi`);
    else showToast("success", `${selectedCount} kayıt silindi`);
    const deletedIds = [...selectedDiagnozIds];
    setSelectedDiagnozIds([]);
    setExamInlineEdits(prev => { const n = {...prev}; deletedIds.forEach(id => delete n[id]); return n; });
    void load();
  };

  const deleteExamRecord = async (examId: string, asTreatment = false) => {
    const ok = await confirmDialog({
      message: asTreatment ? "Tedavi kaydı silinsin mi?" : "Muayene kaydı silinsin mi?",
      danger: true,
      confirmText: "Sil",
    });
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

  const startEditPayment = (p: { id: string; createdAt: string; method: string; description?: string | null; amount: string | number; doctorId?: string | null; posId?: string | null }) => {
    setEditingPaymentId(p.id);
    setPayAmount(String(Number(p.amount)));
    setPayMethod(p.method);
    setPayDesc(p.description || "");
    setPayPosId(p.posId || "");
    setPayDoctorId(p.doctorId || "");
    setPayDate(new Date(p.createdAt).toISOString().slice(0, 10));
    setPaymentModalOpen(true);
  };

  const addPayment = async () => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("error", "Geçerli bir tutar girin");
    if (!payDoctorId) return showToast("error", "Lütfen bir doktor seçin");
    if ((payMethod === "KREDI_KARTI" || payMethod === "MAIL_ORDER") && !payPosId) {
      return showToast("error", "Kart / mail order tahsilatı için POS seçimi zorunlu");
    }
    setPayLoading(true);
    const res = editingPaymentId
      ? await fetch("/api/payments/" + editingPaymentId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: payMethod, amount, description: payDesc, doctorId: payDoctorId, posId: payPosId || null, createdAt: new Date(payDate + "T00:00:00").toISOString() })
        })
      : await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: id, method: payMethod, amount, description: payDesc, doctorId: payDoctorId, ...(payPosId && { posId: payPosId }) })
        });
    if (res.ok) {
      showToast("success", editingPaymentId ? "Ödeme güncellendi" : "Ödeme kaydedildi");
      closePaymentModal();
      void load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.message || (editingPaymentId ? "Ödeme güncellenemedi" : "Ödeme kaydedilemedi"));
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

  // "Vazgeç" — formu son kaydedilmiş hasta verisine geri döndürür (kaydetmeden).
  const cancelEdit = () => {
    if (!data) return;
    setEditForm({
      fullName: data.fullName, tcNo: data.tcNo, phone: data.phone, gender: data.gender,
      address: data.address || "", insurance: data.insurance || "", referrer: data.referrer || "", profession: data.profession || "",
      discountRate: data.discountRate, notes: data.notes || "",
      surgeries: data.surgeries || "", medications: data.medications || "",
      otherDiseases: data.otherDiseases || "", bloodType: data.bloodType || "",
      birthDate: data.birthDate ? new Date(data.birthDate).toISOString().slice(0, 10) : "",
      hasAllergy: data.hasAllergy, hasHepatitis: data.hasHepatitis, hasKidney: data.hasKidney,
      hasDiabetes: data.hasDiabetes, hasHeart: data.hasHeart, hasBloodIssue: data.hasBloodIssue,
      hasContagiousDisease: data.hasContagiousDisease, contagiousDiseaseNote: data.contagiousDiseaseNote || "",
    });
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

  const createClinicTask = async () => {
    if (!taskTitle.trim()) return showToast("error", "Görev başlığı girin");
    setTaskSaving(true);
    const res = await fetch("/api/clinic-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: id,
        title: taskTitle.trim(),
        type: taskType,
        priority: taskPriority,
        assignedToId: taskAssignedToId || undefined,
        vendorName: taskVendor.trim() || undefined,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : undefined,
        details: taskDetails.trim() || undefined,
      }),
    });
    setTaskSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Görev oluşturulamadı");
    }

    setTaskTitle("");
    setTaskType("PARCA_SIPARIS");
    setTaskPriority(2);
    setTaskAssignedToId("");
    setTaskVendor("");
    setTaskDueAt("");
    setTaskDetails("");
    showToast("success", "Görev eklendi");
    void load();
  };

  const updateClinicTaskStatus = async (taskId: string, status: ClinicTask["status"]) => {
    setTaskBusyId(taskId);
    const res = await fetch("/api/clinic-tasks/" + taskId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTaskBusyId("");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Görev güncellenemedi");
    }
    showToast("success", "Görev durumu güncellendi");
    void load();
  };

  const deleteClinicTask = async (taskId: string) => {
    if (!(await confirmDialog({ message: "Görev silinsin mi?", danger: true, confirmText: "Sil" }))) return;
    setTaskBusyId(taskId);
    const res = await fetch("/api/clinic-tasks/" + taskId, { method: "DELETE" });
    setTaskBusyId("");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Görev silinemedi");
    }
    showToast("success", "Görev silindi");
    void load();
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
    if (!(await confirmDialog({ message: "Reçete silinsin mi?", danger: true, confirmText: "Sil" }))) return;
    const res = await fetch("/api/prescriptions/" + rxId, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast("error", err.message || "Reçete silinemedi");
    }
    showToast("success", "Reçete silindi");
    void load();
  };

  const loadDocuments = async () => {
    if (!id) return;
    setDocumentsLoading(true);
    try {
      const res = await fetch(`/api/documents?patientId=${id}`, { cache: "no-store" });
      if (!res.ok) {
        showToast("error", "Belgeler/röntgenler yüklenemedi. Lütfen tekrar deneyin.");
        setDocuments([]);
        return;
      }
      const json = await res.json().catch(() => []);
      setDocuments(Array.isArray(json) ? json : []);
    } catch {
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
      setDocumentsLoaded(true);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!id) return;
    setDocUploadError("");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      const message = "Yalnızca JPG, PNG, WEBP veya PDF dosyası yüklenebilir.";
      setDocUploadError(message);
      return showToast("error", message);
    }
    if (file.size > 15 * 1024 * 1024) {
      const message = "Dosya boyutu en fazla 15MB olabilir.";
      setDocUploadError(message);
      return showToast("error", message);
    }
    setDocUploading(true);
    try {
      const formData = new FormData();
      formData.append("patientId", id);
      formData.append("category", docCategory);
      if (docToothNo.trim()) formData.append("toothNo", docToothNo.trim());
      if (docNote.trim()) formData.append("note", docNote.trim());
      formData.append("file", file);

      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json?.error || "Belge yüklenemedi";
        setDocUploadError(message);
        showToast("error", message);
        return;
      }
      setDocuments((prev) => [json as PatientDocument, ...prev]);
      setDocToothNo("");
      setDocNote("");
      showToast("success", "Belge yüklendi");
      void loadDocuments();
    } catch {
      const message = "Belge yüklenirken bağlantı hatası oluştu";
      setDocUploadError(message);
      showToast("error", message);
    } finally {
      setDocUploading(false);
    }
  };

  const deleteDocument = async (docId: string) => {
    if (!(await confirmDialog({ message: "Bu belge silinsin mi? Bu işlem geri alınamaz.", danger: true, confirmText: "Sil" }))) return;
    const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast("error", err?.error || "Belge silinemedi");
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    showToast("success", "Belge silindi");
  };

  useEffect(() => {
    if (tab === "belgeler" && !documentsLoaded) void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  useEffect(() => {
    const onRealtime = () => {
      if (tab === "belgeler") void loadDocuments();
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => window.removeEventListener("ks:realtime-sync", onRealtime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

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

  if (loading) return (
    <section className="space-y-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-slate-50" />
    </section>
  );
  if (!data) return <section className="rounded-xl bg-white border border-slate-100 p-6 shadow-sm"><p>{loadError || "Hasta bulunamadı"}. <Link href="/hasta" className="text-primary underline">Geri Dön</Link></p></section>;

  const totalPaid = data.payments.reduce((s, p) => s + Number(p.amount), 0);
  const diagnozlar = data.examinations.filter(e => isDiagnosisStatus(e.status));
  const tedaviler = data.examinations.filter(e => isChargeableTreatment(e.status));
  const totalCharged = tedaviler.reduce((s, e) => s + Number(e.amount), 0);
  const discountedTotal = totalCharged * (1 - (Number(data.discountRate || 0) / 100));
  const totalDebt = discountedTotal - totalPaid;

  const healthFlags = ([
    ["Alerji", data.hasAllergy], ["Hepatit", data.hasHepatitis], ["Böbrek", data.hasKidney],
    ["Diyabet", data.hasDiabetes], ["Kalp", data.hasHeart], ["Kan Sorunu", data.hasBloodIssue],
    ["Bulaşıcı Hastalık", data.hasContagiousDisease],
  ] as [string, boolean][]).filter(([, v]) => v);
  const canOpenTab = (key: Tab) => visibleTabItems.some((item) => item.key === key);
  const now = Date.now();
  const upcomingAppointments = data.appointments
    .filter((a) => new Date(a.startAt).getTime() >= now && !["IPTAL", "TAMAMLANDI"].includes(a.status))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const activeLabs = data.labOrders.filter((l) => l.status !== "TAMAMLANDI");
  const activeTasks = clinicTasks.filter((task) => !["TAMAMLANDI", "IPTAL"].includes(task.status));
  const unpaidInstallmentCount = data.taksitPlanlari.reduce((sum, plan) => (
    sum + (plan.taksitler || []).filter((item) => toNumber(item.kalan) > 0 || ["BEKLIYOR", "GECIKTI"].includes(item.status)).length
  ), 0);
  const criticalActionItems: {
    id: string;
    title: string;
    detail: string;
    tone: string;
    action: string;
    onClick: () => void;
  }[] = [
    ...(healthFlags.length > 0 ? [{
      id: "health",
      title: "Sağlık uyarısı var",
      detail: healthFlags.map(([label]) => label).join(", "),
      tone: "border-red-100 bg-red-50 text-red-700",
      action: canOpenTab("duzenle") ? "Düzenle" : "Kontrol Et",
      onClick: () => canOpenTab("duzenle") ? selectTab("duzenle") : selectTab("bilgi"),
    }] : []),
    ...(totalDebt > 0 ? [{
      id: "debt",
      title: "Tahsilat bekliyor",
      detail: `Kalan bakiye ${totalDebt.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`,
      tone: "border-amber-100 bg-amber-50 text-amber-700",
      action: "Ödeme Al",
      onClick: () => setPaymentModalOpen(true),
    }] : []),
    ...(upcomingAppointments[0] ? [{
      id: "next-appointment",
      title: "Sıradaki randevu",
      detail: `${new Date(upcomingAppointments[0].startAt).toLocaleString("tr-TR")} · ${upcomingAppointments[0].doctor?.fullName || "Doktor belirtilmedi"}`,
      tone: "border-primary/20 bg-primary/10 text-primary",
      action: "Randevular",
      onClick: () => selectTab("randevular"),
    }] : []),
    ...(activeLabs.length > 0 && canOpenTab("lab") ? [{
      id: "lab",
      title: `${activeLabs.length} açık laboratuvar işi`,
      detail: activeLabs.slice(0, 2).map((l) => `${l.labType}${l.labName ? ` · ${l.labName}` : ""}`).join(" / "),
      tone: "border-violet-100 bg-violet-50 text-violet-700",
      action: "Lab Aç",
      onClick: () => selectTab("lab"),
    }] : []),
    ...(diagnozlar.length > 0 && canOpenTab("tedavi") ? [{
      id: "diagnosis",
      title: `${diagnozlar.length} tedavi bekleyen kayıt`,
      detail: "Muayene listesinden tedaviye aktarılabilir.",
      tone: "border-emerald-100 bg-emerald-50 text-emerald-700",
      action: "Tedavi",
      onClick: () => selectTab("tedavi"),
    }] : []),
    ...(activeTasks.length > 0 && canOpenTab("gorevler") ? [{
      id: "task",
      title: `${activeTasks.length} açık görev`,
      detail: activeTasks[0]?.title || "Hasta için takip gerektiren görev var.",
      tone: "border-indigo-100 bg-indigo-50 text-indigo-700",
      action: "Görevler",
      onClick: () => selectTab("gorevler"),
    }] : []),
    ...(unpaidInstallmentCount > 0 && canOpenTab("odeme") ? [{
      id: "installment",
      title: `${unpaidInstallmentCount} bekleyen taksit`,
      detail: "Ödeme planı kontrol edilmeli.",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      action: "Finans",
      onClick: () => selectTab("odeme"),
    }] : []),
  ].slice(0, 6);

  const exportSelectedKeys = PATIENT_EXPORT_SECTIONS.filter((section) => exportSelection[section.key]).map((section) => section.key);
  const escapeExcelCell = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const dateText = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("tr-TR") : "-";
  const dateTimeText = (value: unknown) => value ? new Date(String(value)).toLocaleString("tr-TR") : "-";
  const moneyText = (value: unknown) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
  const safeFilePart = (value: string) => value.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "hasta";

  const buildPatientExportSections = (patient: Record<string, any>) => {
    const exams = Array.isArray(patient.examinations) ? patient.examinations : [];
    const completed = exams.filter((e) => isChargeableTreatment(e.status));
    const plannedFromExams = exams.filter((e) => isDiagnosisStatus(e.status));
    const plans = Array.isArray(patient.treatmentPlans) ? patient.treatmentPlans : [];
    const plannedFromPlans = plans.flatMap((plan) =>
      (Array.isArray(plan.steps) ? plan.steps : [])
        .filter((step: Record<string, any>) => !["TAMAMLANDI", "IPTAL"].includes(String(step.status || "")))
        .map((step: Record<string, any>) => ({
          source: plan.title || "Tedavi Planı",
          date: step.doneAt || plan.createdAt,
          treatmentName: step.treatmentName,
          toothNo: step.toothNo,
          amount: step.amount,
          status: step.status || plan.status,
          doctor: plan.doctor,
          note: step.note || plan.notes,
        }))
    );
    const health = [
      patient.hasAllergy && "Alerji",
      patient.hasHepatitis && "Hepatit",
      patient.hasKidney && "Böbrek",
      patient.hasDiabetes && "Diyabet",
      patient.hasHeart && "Kalp",
      patient.hasBloodIssue && "Kan Sorunu",
      patient.hasContagiousDisease && "Bulaşıcı Hastalık",
    ].filter(Boolean).join(", ") || "Aktif uyarı yok";

    return {
      profile: {
        title: "Hasta Bilgileri",
        headers: ["Alan", "Değer"],
        rows: [
          ["Ad Soyad", patient.fullName],
          ["TC Kimlik", patient.tcNo],
          ["Telefon", patient.phone],
          ["Meslek", patient.profession || "-"],
          ["Cinsiyet", patient.gender || "-"],
          ["Doğum Tarihi", patient.birthDate ? dateText(patient.birthDate) : "-"],
          ["Kurum / Sigorta", patient.insurance || "-"],
          ["İndirim", `%${patient.discountRate || 0}`],
          ["Sağlık Uyarıları", health],
          ["Kullandığı İlaçlar", patient.medications || "-"],
          ["Geçirdiği İşlemler", patient.surgeries || "-"],
          ["Diğer Hastalıklar", patient.otherDiseases || "-"],
        ],
      },
      completedTreatments: {
        title: "Yapılan Tedaviler",
        headers: exportHideDoctor ? ["Tarih", "Tedavi", "Diş", "Tutar", "Durum"] : ["Tarih", "Tedavi", "Diş", "Tutar", "Hekim", "Durum"],
        rows: completed.map((e: Record<string, any>) => [
          dateText(e.diagnosedAt),
          e.treatmentName || "-",
          e.toothNo || "-",
          moneyText(e.amount),
          ...(exportHideDoctor ? [] : [e.doctor?.fullName || "-"]),
          e.status || "-",
        ]),
      },
      plannedTreatments: {
        title: "Yapılacak / Planlanan Tedaviler",
        headers: exportHideDoctor ? ["Kaynak", "Tarih", "Tedavi", "Diş", "Tutar", "Durum"] : ["Kaynak", "Tarih", "Tedavi", "Diş", "Tutar", "Hekim", "Durum"],
        rows: [
          ...plannedFromExams.map((e: Record<string, any>) => [
            "Muayene Listesi",
            dateText(e.diagnosedAt),
            e.treatmentName || "-",
            e.toothNo || "-",
            moneyText(e.amount),
            ...(exportHideDoctor ? [] : [e.doctor?.fullName || "-"]),
            e.status || "-",
          ]),
          ...plannedFromPlans.map((e: Record<string, any>) => [
            e.source || "Tedavi Planı",
            dateText(e.date),
            e.treatmentName || "-",
            e.toothNo || "-",
            moneyText(e.amount),
            ...(exportHideDoctor ? [] : [e.doctor?.fullName || "-"]),
            e.status || "-",
          ]),
        ],
      },
      payments: {
        title: "Ödemeler",
        headers: exportHideDoctor ? ["Tarih", "Tutar", "Yöntem", "POS", "Açıklama"] : ["Tarih", "Tutar", "Yöntem", "POS", "Hekim", "Açıklama"],
        rows: (Array.isArray(patient.payments) ? patient.payments : []).map((p: Record<string, any>) => [
          dateTimeText(p.createdAt),
          moneyText(p.amount),
          String(p.method || "-").replace(/_/g, " "),
          p.pos?.name || "-",
          ...(exportHideDoctor ? [] : [p.doctor?.fullName || "-"]),
          p.description || "-",
        ]),
      },
      balance: {
        title: "Kalan Ödeme Özeti",
        headers: ["Alan", "Tutar"],
        rows: [
          ["Brüt tedavi toplamı", moneyText(totalCharged)],
          ["İndirim oranı", `%${Number(patient.discountRate || 0)}`],
          ["İndirimli tedavi toplamı", moneyText(discountedTotal)],
          ["Ödenen toplam", moneyText(totalPaid)],
          ["Kalan ödeme", moneyText(totalDebt)],
        ],
      },
      appointments: {
        title: "Randevular",
        headers: exportHideDoctor ? ["Başlangıç", "Bitiş", "Tip", "Durum", "Not"] : ["Başlangıç", "Bitiş", "Hekim", "Tip", "Durum", "Not"],
        rows: (Array.isArray(patient.appointments) ? patient.appointments : []).map((a: Record<string, any>) => [
          dateTimeText(a.startAt),
          dateTimeText(a.endAt),
          ...(exportHideDoctor ? [] : [a.doctor?.fullName || "-"]),
          a.type || "-",
          APPOINTMENT_STATUS_LABELS[a.status || ""] || a.status || "-",
          a.note || "-",
        ]),
      },
      labOrders: {
        title: "Laboratuvar Kayıtları",
        headers: exportHideDoctor ? ["Tarih", "Laboratuvar", "Firma", "İş", "Diş", "Durum", "Fatura", "Tutar"] : ["Tarih", "Laboratuvar", "Firma", "İş", "Diş", "Durum", "Fatura", "Tutar", "Hekim"],
        rows: (Array.isArray(patient.labOrders) ? patient.labOrders : []).map((l: Record<string, any>) => [
          dateText(l.createdAt),
          l.labName || "-",
          l.firma?.name || "-",
          l.labType || "-",
          l.teeth || "-",
          String(l.status || "-").replace(/_/g, " "),
          l.invoiceNo || (Array.isArray(l.invoices) && l.invoices[0]?.invoiceNo) || "-",
          moneyText(l.price || (Array.isArray(l.invoices) ? l.invoices.reduce((sum: number, inv: Record<string, any>) => sum + Number(inv.amount || 0), 0) : 0)),
          ...(exportHideDoctor ? [] : [l.doctor?.fullName || "-"]),
        ]),
      },
      prescriptions: {
        title: "Reçeteler",
        headers: exportHideDoctor ? ["Tarih", "İlaçlar", "Not"] : ["Tarih", "Hekim", "İlaçlar", "Not"],
        rows: (Array.isArray(patient.prescriptions) ? patient.prescriptions : []).map((rx: Record<string, any>) => [
          dateText(rx.createdAt),
          ...(exportHideDoctor ? [] : [rx.doctor?.fullName || "-"]),
          rx.drugs || "-",
          rx.note || "-",
        ]),
      },
      documents: {
        title: "Belgeler ve Onamlar",
        headers: ["Tarih", "Tür", "Başlık / Dosya", "Durum", "Not"],
        rows: [
          ...(Array.isArray(patient.documents) ? patient.documents : []).map((doc: Record<string, any>) => [
            dateText(doc.createdAt),
            doc.category || "Belge",
            doc.fileName || "-",
            doc.toothNo ? `Diş ${doc.toothNo}` : "-",
            doc.note || "-",
          ]),
          ...(Array.isArray(patient.consents) ? patient.consents : []).map((consent: Record<string, any>) => [
            dateText(consent.signedAt),
            "Onam",
            consent.title || "-",
            consent.status || "-",
            consent.voidReason || consent.signerName || "-",
          ]),
        ],
      },
      notes: {
        title: "Hasta Notları",
        headers: ["Not"],
        rows: patient.notes ? [[patient.notes]] : [],
      },
    } satisfies Record<PatientExportSection, { title: string; headers: string[]; rows: (string | number)[][] }>;
  };

  const downloadPatientExportExcel = (sections: ReturnType<typeof buildPatientExportSections>, keys: PatientExportSection[], fileName: string) => {
    const tables = keys.map((key) => {
      const section = sections[key];
      return `
        <h2>${escapeExcelCell(section.title)}</h2>
        <table>
          <thead><tr>${section.headers.map((header) => `<th>${escapeExcelCell(header)}</th>`).join("")}</tr></thead>
          <tbody>${
            section.rows.length
              ? section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExcelCell(cell)}</td>`).join("")}</tr>`).join("")
              : `<tr><td colspan="${section.headers.length}">Kayıt yok</td></tr>`
          }</tbody>
        </table>`;
    }).join("<br/>");
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8" />
      <style>
        @page{margin:.45in}
        body{font-family:"Segoe UI",Arial,sans-serif;color:#111827;background:#fff;font-size:10pt}
        .cover{border:1px solid #cbd5e1;padding:14px;margin-bottom:14px;background:#f8fafc}
        .brand{font-size:10pt;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
        h1{font-size:20pt;margin:4px 0 6px;color:#0f172a}
        h2{font-size:12pt;margin:16px 0 6px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
        .meta{font-size:9pt;color:#64748b;margin-bottom:4px}
        .pill{display:inline-block;border:1px solid #cbd5e1;background:#f8fafc;padding:4px 8px;margin:4px 6px 0 0;font-size:9pt}
        table{border-collapse:collapse;width:100%;font-size:10pt;margin-bottom:10px}
        th{background:#0f172a;color:#fff;text-align:left;padding:7px;border:1px solid #334155;font-size:9pt}
        td{padding:6px 7px;border:1px solid #cbd5e1;mso-number-format:"\\@";vertical-align:top}
        tr:nth-child(even) td{background:#f8fafc}
      </style></head>
      <body>
        <div class="cover">
          <div class="brand">${escapeExcelCell(clinicName || "Klinik")}</div>
          <h1>Hasta Dışa Aktarım Raporu</h1>
          <div class="meta">${escapeExcelCell(data.fullName)} · TC: ${escapeExcelCell(data.tcNo)} · ${escapeExcelCell(new Date().toLocaleString("tr-TR"))}</div>
          <span class="pill">Format: Excel</span>
          <span class="pill">Bölüm: ${keys.length}</span>
          <span class="pill">Doktor bilgisi: ${exportHideDoctor ? "Gizli" : "Görünür"}</span>
        </div>
        ${tables}
      </body></html>`;
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadPatientExportPdf = (sections: ReturnType<typeof buildPatientExportSections>, keys: PatientExportSection[], fileName: string) => {
    const doc = createPdfDoc("l");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedAt = new Date().toLocaleString("tr-TR");
    const footerText = `${clinicName || "Klinik"} · Hasta raporu · ${data.fullName}`;

    const drawHeader = (suffix = "") => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 23, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text(pdfSafeText(`Hasta Dışa Aktarım Raporu${suffix}`), 14, 12);
      doc.setFontSize(8.5);
      doc.text(pdfSafeText(`${clinicName || "Klinik"} · ${data.fullName} · ${generatedAt}`), 14, 19);
      doc.setTextColor(17, 24, 39);
    };

    const drawMetaBox = () => {
      const selectedText = pdfSafeText(`Seçilen içerik: ${keys.map((key) => sections[key].title).join(", ")}`);
      const selectedLines = doc.splitTextToSize(selectedText, pageWidth - 36);
      const boxHeight = Math.max(18, 12 + selectedLines.length * 4);
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 28, pageWidth - 28, boxHeight, 2, 2, "FD");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafeText(`TC: ${data.tcNo || "-"}    Bölüm: ${keys.length}    Doktor bilgisi: ${exportHideDoctor ? "Gizli" : "Görünür"}`), 18, 35);
      doc.text(selectedLines, 18, 41);
      doc.setTextColor(17, 24, 39);
      return 28 + boxHeight + 8;
    };

    const drawFooter = () => {
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(pdfSafeText(footerText), 14, pageHeight - 6);
        doc.text(pdfSafeText(`Sayfa ${page}/${pageCount}`), pageWidth - 14, pageHeight - 6, { align: "right" });
      }
      doc.setTextColor(17, 24, 39);
    };

    drawHeader();
    let y = drawMetaBox();
    keys.forEach((key) => {
      if (y > 175) {
        doc.addPage();
        drawHeader(" · Devam");
        y = 34;
      }
      const section = sections[key];
      y = addPdfSection(doc, y, section.title, section.headers, section.rows);
    });
    drawFooter();
    doc.save(`${fileName}.pdf`);
  };

  const runPatientExport = async () => {
    const keys = exportSelectedKeys;
    if (keys.length === 0) {
      showToast("error", "Dışa aktarmak için en az bir bölüm seçin.");
      return;
    }
    setExportBusy(true);
    try {
      const res = await fetch(`/api/patients/${data.id}/export`, { cache: "no-store" });
      if (!res.ok) {
        showToast("error", "Hasta verileri dışa aktarılamadı.");
        return;
      }
      const payload = await res.json();
      const patient = payload?.patient || data;
      const sections = buildPatientExportSections(patient);
      const fileName = `hasta-raporu-${safeFilePart(data.fullName)}-${new Date().toISOString().slice(0, 10)}`;
      if (exportFormat === "pdf") downloadPatientExportPdf(sections, keys, fileName);
      else downloadPatientExportExcel(sections, keys, fileName);
      setExportModalOpen(false);
      showToast("success", "Dışa aktarım hazırlandı.");
    } catch {
      showToast("error", "Dışa aktarım sırasında hata oluştu.");
    } finally {
      setExportBusy(false);
    }
  };

  const openLabOrderDetail = (orderId: string) => {
    void openLabDetailModal(orderId);
  };

  const toSharedLabOrder = (order: LabOrderDetail): SharedLabOrder => ({
    id: order.id,
    labName: order.labName || "Laboratuvar belirtilmedi",
    labType: order.labType || "Laboratuvar işi",
    teeth: order.teeth || "",
    notes: order.notes || "",
    status: order.status || "DEVAM_EDIYOR",
    patient: {
      id: order.patient?.id || data?.id || "",
      fullName: order.patient?.fullName || data?.fullName || "Hasta belirtilmedi",
      phone: order.patient?.phone || data?.phone || "",
    },
    doctor: {
      id: order.doctor?.id || "",
      fullName: order.doctor?.fullName || "Doktor belirtilmedi",
    },
    trips: (order.trips || []).map((trip, index) => ({
      id: trip.id,
      order: Number(trip.order || index + 1),
      description: trip.description || "Laboratuvar adımı",
      sentAt: trip.sentAt,
      receivedAt: trip.receivedAt || null,
      sentNote: trip.sentNote || null,
      receivedNote: trip.receivedNote || null,
    })),
    invoices: (order.invoices || []).map((invoice) => ({
      id: invoice.id,
      item: invoice.item,
      amount: Number(invoice.amount || 0),
      invoiceNo: invoice.invoiceNo || null,
      issuedAt: invoice.issuedAt,
      note: invoice.note || null,
    })),
  });

  return (
    <section className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.text}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
            {data.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black text-slate-900">{data.fullName}</h2>
              {data.hasContagiousDisease && (
                <span className="rounded-full border border-red-300 bg-red-600 px-2 py-0.5 text-[11px] font-black text-white" title={data.contagiousDiseaseNote || "Bulaşıcı hastalık"}>
                  ⚠ Bulaşıcı Hastalık
                </span>
              )}
              {healthFlags.length > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">Sağlık uyarısı</span>}
              {totalDebt > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Kalan {totalDebt.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">TC: {data.tcNo}{(currentUserRole !== "DOKTOR" && currentUserRole !== "ASISTAN") ? ` · ${data.phone}` : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <details ref={actionMenuRef} className="relative">
            <summary className="cursor-pointer list-none rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800">
              + İşlem
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {canOpenTab("tedavi") && (
                <button
                  type="button"
                  onClick={() => {
                    selectTab("tedavi");
                    closeActionMenu();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Tedavi Ekle
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPaymentModalOpen(true);
                  closeActionMenu();
                }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ödeme Al
              </button>
              {canOpenTab("lab") && (
                <button
                  type="button"
                  onClick={() => {
                    openLabCreateModal();
                    closeActionMenu();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Lab İşi
                </button>
              )}
              {canOpenTab("recete") && (
                <button
                  type="button"
                  onClick={() => {
                    selectTab("recete");
                    closeActionMenu();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reçete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  selectTab("bilgi");
                  closeActionMenu();
                }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Not Ekle
              </button>
            </div>
          </details>
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            title="Hasta dosyasını seçili içeriklerle PDF veya Excel olarak dışa aktar"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Dışa Aktar
          </button>
          <Link href="/hasta" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Liste</Link>
        </div>
        </div>
        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <button onClick={() => canOpenTab("randevular") && selectTab("randevular")} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-100">
            <span className="block font-bold uppercase">Randevu</span><span className="text-sm font-black text-slate-900">{data.appointments.length}</span>
          </button>
          <button onClick={() => canOpenTab("tedavi") && selectTab("tedavi")} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-100">
            <span className="block font-bold uppercase">Tedavi</span><span className="text-sm font-black text-slate-900">{tedaviler.length}</span>
          </button>
          <button onClick={() => canOpenTab("odeme") && selectTab("odeme")} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-100">
            <span className="block font-bold uppercase">Ödenen</span><span className="text-sm font-black text-emerald-700">{totalPaid.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL</span>
          </button>
          <button onClick={() => canOpenTab("odeme") && selectTab("odeme")} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-100">
            <span className="block font-bold uppercase">Kalan</span><span className={`text-sm font-black ${totalDebt > 0 ? "text-red-700" : "text-emerald-700"}`}>{totalDebt.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL</span>
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {primaryTabs.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => selectTab(tabKey)}
              className={"shrink-0 rounded-xl px-4 py-2 text-sm font-black transition-colors " + (tab === tabKey ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}
            >
              {tabLabel(tabKey)}
            </button>
          ))}
        </div>
        {moreTabs.length > 0 && (
          <details ref={moreMenuRef} className="relative shrink-0">
            <summary className={"cursor-pointer list-none rounded-xl px-4 py-2 text-sm font-black transition-colors " + (isMoreTabActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
              Diğer
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {moreTabs.map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => {
                    selectTab(tabKey);
                    if (moreMenuRef.current) moreMenuRef.current.open = false;
                  }}
                  className={"block w-full px-3 py-2 text-left text-sm font-semibold transition-colors " + (tab === tabKey ? "bg-slate-50 text-slate-950" : "text-slate-700 hover:bg-slate-50")}
                >
                  {tabLabel(tabKey)}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {tab === "bilgi" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">Açık İşler</h3>
                  <p className="text-xs text-slate-500">Bu hasta için aksiyon gerektiren başlıklar.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{criticalActionItems.length} kayıt</span>
              </div>
              {criticalActionItems.length === 0 ? (
                <div className="px-5 py-8 text-sm text-slate-500">Aksiyon gerektiren açık başlık görünmüyor.</div>
              ) : (
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {criticalActionItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onClick}
                      className={`rounded-xl border px-4 py-3 text-left transition hover:shadow-sm ${item.tone}`}
                    >
                      <span className="block text-sm font-black text-slate-900">{item.title}</span>
                      <span className="mt-1 block line-clamp-2 text-xs text-slate-600">{item.detail}</span>
                      <span className="mt-2 inline-block text-xs font-black">{item.action}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">Hasta Notu</h3>
                  <p className="text-xs text-slate-500">Kısa klinik notu buradan eklenir; eski notlar altta korunur.</p>
                </div>
                {data.notes && (
                  <button
                    type="button"
                    onClick={() => selectTab("notlar")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Not Arşivi
                  </button>
                )}
              </div>
              {data.notes && (
                <div className="mb-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  {data.notes}
                </div>
              )}
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Hasta için kısa not yazın..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={noteSaving || !noteText.trim()}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {noteSaving ? "Kaydediliyor..." : "Notu Kaydet"}
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-slate-900">Hasta Profili</h3>
                <button onClick={() => selectTab("duzenle")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Düzenle</button>
              </div>
              <dl className="space-y-2 text-sm">
                {[
                  ...(currentUserRole !== "DOKTOR" && currentUserRole !== "ASISTAN" ? [["Telefon", data.phone]] : []),
                  ["Cinsiyet", data.gender === "ERKEK" || data.gender === "Erkek" ? "Erkek" : "Kadın"],
                  ["Kurum", data.insurance || "-"],
                  ["Meslek", data.profession || "-"],
                  ["Referans", data.referrer || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                    <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
                    <dd className="min-w-0 truncate font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Sağlık Uyarıları</p>
                <div className="flex flex-wrap gap-1.5">
                  {healthFlags.length > 0 ? healthFlags.map(([label]) => (
                    <span key={label} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{label}</span>
                  )) : (
                    <span className="text-xs font-semibold text-slate-400">Aktif uyarı yok</span>
                  )}
                </div>
                {(data.medications || data.surgeries || data.otherDiseases || data.notes) && (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {data.medications && <p><span className="font-bold text-slate-700">İlaç:</span> {data.medications}</p>}
                    {data.surgeries && <p><span className="font-bold text-slate-700">Ameliyat:</span> {data.surgeries}</p>}
                    {data.otherDiseases && <p><span className="font-bold text-slate-700">Diğer:</span> {data.otherDiseases}</p>}
                    {data.notes && <p><span className="font-bold text-slate-700">Not:</span> {data.notes}</p>}
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Finans</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Net tedavi</span><span className="font-bold text-slate-900">{discountedTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Ödenen</span><span className="font-bold text-emerald-700">{totalPaid.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-1"><span className="font-bold text-slate-700">Kalan</span><span className={`font-black ${totalDebt > 0 ? "text-red-700" : "text-emerald-700"}`}>{totalDebt.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span></div>
                </div>
              </div>
            </div>
          </aside>
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
                <tr
                  key={a.id}
                  className="cursor-pointer border-b hover:bg-primary/10"
                  onClick={() => {
                    const d = new Date(a.startAt);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, "0");
                    const dd = String(d.getDate()).padStart(2, "0");
                    const params = new URLSearchParams({
                      view: "GUN",
                      date: `${yyyy}-${mm}-${dd}`,
                      focusAppointmentId: a.id,
                    });
                    router.push(`/randevu?${params.toString()}`);
                  }}
                  title="Randevular ekranında ilgili güne git"
                >
                  <td className="px-3 py-2">{new Date(a.startAt).toLocaleString("tr-TR")}</td>
                  <td className="px-3 py-2">{a.doctor?.fullName || "-"}</td>
                  <td className="px-3 py-2"><span className={"rounded-full px-2 py-0.5 text-xs " + (a.type==="ACIL"?"bg-red-100 text-red-700":a.type==="KONTROL"?"bg-yellow-100 text-yellow-700":"bg-primary/10 text-primary")}>{a.type}</span></td>
                  <td className="px-3 py-2"><span className={"rounded-full px-2 py-0.5 text-xs " + (a.status==="GELDI"?"bg-green-100 text-green-700":a.status==="GELMEDI"?"bg-red-100 text-red-700":a.status==="IPTAL"?"bg-gray-200 text-gray-600":"bg-yellow-100 text-yellow-700")}>{APPOINTMENT_STATUS_LABELS[a.status || ""] || a.status || "Bekliyor"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "gorevler" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Yeni Görev Ekle</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                placeholder="Görev başlığı (örn: X firmasından implant parçası sipariş)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select value={taskType} onChange={e => setTaskType(e.target.value as ClinicTask["type"])} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={taskPriority} onChange={e => setTaskPriority(Number(e.target.value))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value={1}>Öncelik: Düşük</option>
                <option value={2}>Öncelik: Orta</option>
                <option value={3}>Öncelik: Yüksek</option>
              </select>
              <input
                value={taskVendor}
                onChange={e => setTaskVendor(e.target.value)}
                placeholder="Firma/Tedarikçi (opsiyonel)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select value={taskAssignedToId} onChange={e => setTaskAssignedToId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Sorumlu: Seçilmedi</option>
                {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
              <input
                type="datetime-local"
                value={taskDueAt}
                onChange={e => setTaskDueAt(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={taskDetails}
              onChange={e => setTaskDetails(e.target.value)}
              rows={2}
              placeholder="Detay/hatırlatma notu"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <button onClick={() => void createClinicTask()} disabled={taskSaving} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                {taskSaving ? "Ekleniyor..." : "Görev Ekle"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Görev</th>
                  <th className="px-3 py-2 text-left">Tip</th>
                  <th className="px-3 py-2 text-left">Sorumlu</th>
                  <th className="px-3 py-2 text-left">Termin</th>
                  <th className="px-3 py-2 text-left">Durum</th>
                  <th className="px-3 py-2 text-left">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {clinicTasks.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Kayıtlı görev yok</td></tr>}
                {clinicTasks.map(t => (
                  <tr key={t.id} className="border-b">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{t.title}</p>
                      {t.vendorName && <p className="text-xs text-slate-500">Firma: {t.vendorName}</p>}
                      {t.details && <p className="text-xs text-slate-500">{t.details}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs">{TASK_TYPE_LABELS[t.type]}</td>
                    <td className="px-3 py-2 text-xs">{t.assignedTo?.fullName || "-"}</td>
                    <td className="px-3 py-2 text-xs">{t.dueAt ? new Date(t.dueAt).toLocaleString("tr-TR") : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (t.status === "TAMAMLANDI" ? "bg-emerald-100 text-emerald-700" : t.status === "IPTAL" ? "bg-slate-200 text-slate-700" : t.status === "BEKLEMEDE" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary")}>{TASK_STATUS_LABELS[t.status]}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {t.status !== "TAMAMLANDI" && (
                          <button onClick={() => void updateClinicTaskStatus(t.id, "TAMAMLANDI")} disabled={taskBusyId === t.id} className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Tamamla</button>
                        )}
                        {t.status !== "BEKLEMEDE" && t.status !== "TAMAMLANDI" && (
                          <button onClick={() => void updateClinicTaskStatus(t.id, "BEKLEMEDE")} disabled={taskBusyId === t.id} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">Beklet</button>
                        )}
                        {t.status !== "ACIK" && (
                          <button onClick={() => void updateClinicTaskStatus(t.id, "ACIK")} disabled={taskBusyId === t.id} className="rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Açık Yap</button>
                        )}
                        <button onClick={() => void deleteClinicTask(t.id)} disabled={taskBusyId === t.id} className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Sil</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "tedavi" && (() => {
        const UPPER = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
        const LOWER = ["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"];
        const UPPER_C = ["55","54","53","52","51","61","62","63","64","65"];
        const LOWER_C = ["85","84","83","82","81","71","72","73","74","75"];
        const fallbackTreatmentPool = TDB_2026_CORE_PRICE_CATALOG;
        // Katalog + DB listesini birleştir: DB'de eksik kayıt olsa bile tüm tedaviler görünür.
        const treatmentMap = new Map<string, { id: string; code?: string; treatment: string; amount: number; isTemplate?: boolean }>();
        const treatmentKey = (item: { code?: string; treatment: string }) => `${item.code || ""}::${item.treatment.toLocaleLowerCase("tr-TR")}`;
        for (const item of fallbackTreatmentPool) treatmentMap.set(treatmentKey(item), item);
        for (const item of priceList) treatmentMap.set(treatmentKey(item), item);
        const treatmentPool = Array.from(treatmentMap.values()).sort((a, b) => a.treatment.localeCompare(b.treatment, "tr"));
        const treatmentQueryNorm = treatmentQuery.trim().toLocaleLowerCase("tr-TR");
        const filteredTreatmentPool = treatmentPool
          .filter((p) => !treatmentQueryNorm || p.treatment.toLocaleLowerCase("tr-TR").includes(treatmentQueryNorm) || String(p.code || "").toLocaleLowerCase("tr-TR").includes(treatmentQueryNorm))
          .slice(0, 80);
        const onToothPick = async (n: string) => {
          if (treatmentSaving) return;
          await addDirectToExaminationList(n);
        };
        const selectedPriceItem = treatmentPool.find(p => p.id === treatDropdownId);
        // ASISTAN'ın examinations:write yetkisi yok — liste görüntülenir ama yazma eylemleri gizlenir.
        const canWriteExam = currentUserRole !== "ASISTAN";
        const planStatusLabel: Record<string, string> = { PLANLANDI: "Planlandı", DEVAM_EDIYOR: "Devam Ediyor", TAMAMLANDI: "Tamamlandı", IPTAL: "İptal" };
        const planStatusCls: Record<string, string> = {
          PLANLANDI: "bg-slate-100 text-slate-700", DEVAM_EDIYOR: "bg-primary/10 text-primary",
          TAMAMLANDI: "bg-emerald-100 text-emerald-700", IPTAL: "bg-red-100 text-red-700",
        };
        return (
        <div className="space-y-4">
          {treatmentPlans.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-primary">Tedavi Planları</h3>
                <Link href="/tedavi-plani" className="text-xs font-semibold text-primary underline">Tümünü Yönet</Link>
              </div>
              <p className="mb-3 text-xs text-primary">
                Bu tutarlar aşağıdaki &quot;Kalan&quot; bakiyeye otomatik yansımaz — plan, hasta muayeneye/tedaviye geldikçe
                aşağıdan ayrıca faturalandırılır. Aradaki farkı kontrol için burada gösteriliyor.
              </p>
              <div className="space-y-2">
                {treatmentPlans.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{plan.title}</p>
                      <p className="text-xs text-slate-500">{plan.steps.length} adım</p>
                    </div>
                    <span className={`mr-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ${planStatusCls[plan.status] || "bg-slate-100 text-slate-700"}`}>
                      {planStatusLabel[plan.status] || plan.status}
                    </span>
                    {plan.totalCost != null && <span className="font-bold text-slate-700">₺{Number(plan.totalCost).toLocaleString("tr-TR")}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {currentUserRole === "ASISTAN" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Yeni muayene/tedavi eklemek için doktor yetkisi gereklidir. Mevcut kayıtları aşağıdaki listede görüntüleyebilirsiniz.
          </div>
          ) : (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Muayene/Tedavi Oluştur</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Doktor ve tedavi seçin. Diş şemasından tıkladığınız dişler otomatik olarak muayene listesine aktarılır.</p>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-600">
                Fiyat kaynağı: <span className="font-semibold text-slate-900">{activePriceList === "custom" ? "Özel fiyat listesi" : "TDB 2026 tarifesi"}</span>
              </div>
              <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => void saveActivePriceList("standard")}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${activePriceList === "standard" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  TDB 2026
                </button>
                <button
                  type="button"
                  onClick={() => void saveActivePriceList("custom")}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${activePriceList === "custom" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Özel Liste
                </button>
              </div>
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
              <div className="relative flex items-center overflow-visible rounded-lg border">
                <span className="shrink-0 bg-primary px-3 py-2 text-sm font-semibold text-white">Tedavi</span>
                <input
                  value={treatmentQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTreatmentQuery(value);
                    setTreatmentDropdownOpen(true);
                    const exact = treatmentPool.find((p) => p.treatment.toLocaleLowerCase("tr-TR") === value.trim().toLocaleLowerCase("tr-TR") || p.code === value.trim());
                    if (exact) {
                      setTreatDropdownId(exact.id);
                      setTreatCustomAmount(String(exact.amount));
                    } else {
                      setTreatDropdownId("");
                    }
                  }}
                  onFocus={() => setTreatmentDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setTreatmentDropdownOpen(false), 150)}
                  placeholder="Tedavi adı veya kod yazarak ara..."
                  className="min-w-0 flex-1 border-none px-3 py-2 text-sm outline-none"
                />
                {treatmentDropdownOpen && (
                  <div className="absolute left-16 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                    {filteredTreatmentPool.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-400">Tedavi bulunamadı</div>
                    ) : (
                      filteredTreatmentPool.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTreatDropdownId(p.id);
                            setTreatmentQuery(p.treatment);
                            setTreatCustomAmount(String(p.amount));
                            setTreatmentDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-primary/10 ${treatDropdownId === p.id ? "bg-primary/10 text-primary" : "text-slate-700"}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.treatment}</span>
                            <span className="text-xs text-slate-400">{p.code || "Özel"} · {activePriceList === "custom" ? "Özel liste" : "TDB"}</span>
                          </span>
                          <span className="shrink-0 font-bold text-slate-900">{Number(p.amount || 0).toLocaleString("tr-TR")} TL</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-1">
                  {(["adult","child"] as const).map(k => (
                    <button key={k} type="button" onClick={() => { setTreatToothType(k); setTreatSelectedTeeth([]); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${treatToothType===k ? "bg-primary text-white" : "bg-white text-slate-600 border hover:bg-slate-100"}`}>
                      {k === "adult" ? "Yetişkin Dişleri" : "Çocuk Dişleri"}
                    </button>
                  ))}
                </div>
                {treatSelectedTeeth.length > 0 && <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => setTreatSelectedTeeth([])}>Seçimi Temizle</button>}
              </div>

              <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                {[
                  {
                    label: "Üst Çene",
                    teeth: treatToothType === "adult" ? TREAT_ADULT_UPPER : TREAT_CHILD_UPPER,
                  },
                  {
                    label: "Alt Çene",
                    teeth: treatToothType === "adult" ? TREAT_ADULT_LOWER : TREAT_CHILD_LOWER,
                  },
                  {
                    label: "Tüm Çene",
                    teeth: treatToothType === "adult"
                      ? [...TREAT_ADULT_UPPER, ...TREAT_ADULT_LOWER]
                      : [...TREAT_CHILD_UPPER, ...TREAT_CHILD_LOWER],
                  },
                ].map((group) => (
                  <button
                    key={group.label}
                    type="button"
                    onClick={() => { void addTeethToExaminationList(group.teeth, group.label); }}
                    disabled={treatmentSaving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {treatToothType === "adult" && (
                <OdontogramSelector
                  selected={treatSelectedTeeth}
                  onToggle={(num) => { void onToothPick(num); }}
                  dentition="adult"
                />
              )}

              {treatToothType === "child" && (
                <OdontogramSelector
                  selected={treatSelectedTeeth}
                  onToggle={(num) => { void onToothPick(num); }}
                  dentition="child"
                />
              )}

              {treatSelectedTeeth.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">
                  <span className="mr-1 text-xs text-gray-500">Seçili:</span>
                  {treatSelectedTeeth.map(n => <span key={n} className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">{n}</span>)}
                </div>
              )}
            </div>

            <div className="mb-2 grid gap-3 md:grid-cols-3">
              <div className="flex items-center overflow-hidden rounded-lg border">
                <span className="shrink-0 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">Tutar</span>
                <input type="number" className="flex-1 border-none px-3 py-2 text-sm outline-none" value={treatCustomAmount} onChange={e => setTreatCustomAmount(e.target.value)} placeholder={selectedPriceItem ? String(selectedPriceItem.amount) : "0"} />
              </div>
              <div className="flex items-center rounded-lg border bg-gray-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
                Dişe tıklarsanız diş bazlı, çene butonuna tıklarsanız tek çene kaydı Muayene Listesi tablosuna eklenir.
              </div>
            </div>
          </div>
          )}

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-amber-700">Muayene Listesi (Tedavi Bekleyen)</h3>
                <span className="text-xs text-slate-400">{diagnozlar.length} kayıt</span>
              </div>
              <div className="flex items-center gap-2">
                {canWriteExam && selectedDiagnozIds.length > 0 && (
                  <>
                    <button
                      onClick={() => { void bulkConvertDiagnozlar(); }}
                      disabled={bulkConverting || bulkDeleting}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {bulkConverting ? "Aktarılıyor..." : `Seçilenleri Tedaviye Aktar (${selectedDiagnozIds.length})`}
                    </button>
                    <button
                      onClick={() => { void bulkDeleteDiagnozlar(); }}
                      disabled={bulkConverting || bulkDeleting}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      {bulkDeleting ? "Siliniyor..." : `Seçilenleri Sil (${selectedDiagnozIds.length})`}
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
                    {canWriteExam && (
                    <input type="checkbox"
                      checked={diagnozlar.length > 0 && selectedDiagnozIds.length === diagnozlar.length}
                      onChange={ev => setSelectedDiagnozIds(ev.target.checked ? diagnozlar.map(d => d.id) : [])}
                      className="rounded"
                    />
                    )}
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
                        {canWriteExam && (
                        <input type="checkbox"
                          checked={selectedDiagnozIds.includes(e.id)}
                          onChange={ev => setSelectedDiagnozIds(prev => ev.target.checked ? [...prev, e.id] : prev.filter(x => x !== e.id))}
                          className="rounded"
                        />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(e.diagnosedAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-3 py-2">{e.treatmentName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.toothNo || "—"}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" min="0" step="0.01"
                          value={currentAmount}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              amount: ev.target.value,
                              doctorId: prev[e.id]?.doctorId ?? (e.doctorId ?? ""),
                            }
                          }))}
                          className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right text-xs font-semibold hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none disabled:opacity-70"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={currentDoctorId}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              amount: prev[e.id]?.amount ?? String(Number(e.amount || 0)),
                              doctorId: ev.target.value,
                            }
                          }))}
                          className="w-full min-w-[110px] rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none disabled:opacity-70"
                        >
                          <option value="">— Seçin —</option>
                          {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!canWriteExam && <span className="text-xs text-slate-300">—</span>}
                          {canWriteExam && hasEdits && (
                            <button
                              onClick={() => { void saveExamInlineEdit(e); }}
                              disabled={isSaving}
                              title="Değişiklikleri kaydet (aktarmadan)"
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                              {isSaving ? "⏳" : "💾"}
                            </button>
                          )}
                          {canWriteExam && (
                          <button
                            onClick={() => { void convertExamDirect(e); }}
                            disabled={isSaving}
                            className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 whitespace-nowrap"
                          >
                            {isSaving ? "..." : "Tedaviye Aktar"}
                          </button>
                          )}
                          {canWriteExam && (
                          <button
                            onClick={() => { void deleteExamRecord(e.id, false); }}
                            disabled={isSaving}
                            className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200 disabled:opacity-50"
                          >
                            Sil
                          </button>
                          )}
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
                <tr><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Tedavi</th><th className="px-3 py-2 text-left">Diş No</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-left">Doktor</th><th className="px-3 py-2 text-center">İşlem</th></tr>
              </thead>
              <tbody>
                {tedaviler.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Henüz yapılan tedavi kaydı yok</td></tr>}
                {tedaviler.map(e => {
                  const editVals = examInlineEdits[e.id];
                  const currentDiagnosedAt = editVals?.diagnosedAt ?? toDateInputValue(e.diagnosedAt);
                  const currentTreatmentName = editVals?.treatmentName ?? e.treatmentName;
                  const currentToothNo = editVals?.toothNo ?? (e.toothNo || "");
                  const currentAmount = editVals?.amount ?? String(Number(e.amount || 0));
                  const currentDoctorId = editVals?.doctorId ?? e.doctorId ?? "";
                  const hasEdits = !!editVals;
                  const isSaving = examSavingId === e.id;

                  return (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={currentDiagnosedAt}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              diagnosedAt: ev.target.value,
                              treatmentName: prev[e.id]?.treatmentName ?? e.treatmentName,
                              toothNo: prev[e.id]?.toothNo ?? (e.toothNo || ""),
                              amount: prev[e.id]?.amount ?? String(Number(e.amount || 0)),
                              doctorId: prev[e.id]?.doctorId ?? (e.doctorId || ""),
                            },
                          }))}
                          className="rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={currentTreatmentName}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              treatmentName: ev.target.value,
                              diagnosedAt: prev[e.id]?.diagnosedAt ?? toDateInputValue(e.diagnosedAt),
                              toothNo: prev[e.id]?.toothNo ?? (e.toothNo || ""),
                              amount: prev[e.id]?.amount ?? String(Number(e.amount || 0)),
                              doctorId: prev[e.id]?.doctorId ?? (e.doctorId || ""),
                            },
                          }))}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={currentToothNo}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              diagnosedAt: prev[e.id]?.diagnosedAt ?? toDateInputValue(e.diagnosedAt),
                              treatmentName: prev[e.id]?.treatmentName ?? e.treatmentName,
                              amount: prev[e.id]?.amount ?? String(Number(e.amount || 0)),
                              doctorId: prev[e.id]?.doctorId ?? (e.doctorId || ""),
                              toothNo: ev.target.value,
                            },
                          }))}
                          placeholder="—"
                          className="w-20 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={currentAmount}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              diagnosedAt: prev[e.id]?.diagnosedAt ?? toDateInputValue(e.diagnosedAt),
                              treatmentName: prev[e.id]?.treatmentName ?? e.treatmentName,
                              amount: ev.target.value,
                              doctorId: prev[e.id]?.doctorId ?? (e.doctorId || ""),
                              toothNo: prev[e.id]?.toothNo ?? (e.toothNo || ""),
                            },
                          }))}
                          className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right text-xs font-semibold hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={currentDoctorId}
                          disabled={!canWriteExam}
                          onChange={ev => setExamInlineEdits(prev => ({
                            ...prev,
                            [e.id]: {
                              ...(prev[e.id] ?? {}),
                              diagnosedAt: prev[e.id]?.diagnosedAt ?? toDateInputValue(e.diagnosedAt),
                              treatmentName: prev[e.id]?.treatmentName ?? e.treatmentName,
                              amount: prev[e.id]?.amount ?? String(Number(e.amount || 0)),
                              doctorId: ev.target.value,
                              toothNo: prev[e.id]?.toothNo ?? (e.toothNo || ""),
                            },
                          }))}
                          className="w-full min-w-[110px] rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:outline-none"
                        >
                          <option value="">— Seçin —</option>
                          {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!canWriteExam && <span className="text-xs text-slate-300">—</span>}
                          {canWriteExam && hasEdits && (
                            <button
                              onClick={() => { void saveExamInlineEdit(e); }}
                              disabled={isSaving}
                              title="Değişiklikleri kaydet"
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                              {isSaving ? "⏳" : "💾"}
                            </button>
                          )}
                          {canWriteExam && (
                          <button onClick={() => { void deleteExamRecord(e.id, true); }} disabled={isSaving} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200 disabled:opacity-50">Sil</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold">Toplam:</td><td className="px-3 py-2 text-right font-bold">{totalCharged.toFixed(2)} TL</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        </div>
        );
      })()}

      {tab === "odeme" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
            <div className="p-3 text-center"><p className="text-xs text-slate-500">Brüt Tedavi</p><p className="font-bold text-slate-900">{totalCharged.toFixed(2)} TL</p></div>
            <div className="p-3 text-center"><p className="text-xs text-slate-500">İndirim</p><p className="font-bold text-orange-600">%{data.discountRate}</p></div>
            <div className="p-3 text-center"><p className="text-xs text-slate-500">İndirimli Tutar</p><p className="font-bold text-primary">{discountedTotal.toFixed(2)} TL</p></div>
            <div className="p-3 text-center"><p className="text-xs text-slate-500">Kalan</p><p className={"font-bold " + (totalDebt > 0 ? "text-red-600" : "text-green-700")}>{totalDebt.toFixed(2)} TL</p></div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setPaymentModalOpen(true)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Ödeme Al</button>
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
                    <p className="text-xs font-bold uppercase text-slate-500">{LABELS[m]}</p>
                    <p className="mt-0.5 text-base font-black text-slate-800">{"₺" + new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2}).format(total)}</p>
                  </div>
                );
              })}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Hekim</th><th className="px-3 py-2 text-left">Yöntem</th><th className="px-3 py-2 text-left">Açıklama</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-center">İşlem</th></tr>
              </thead>
              <tbody>
                {data.payments.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Ödeme yok</td></tr>}
                {data.payments.map((p: {id:string; createdAt:string; method:string; description?:string|null; amount:string|number; doctorId?:string|null; doctor?:{id:string; fullName:string}|null; posId?:string|null}) => {
                  const ML: Record<string,string> = { NAKIT:"Nakit", KREDI_KARTI:"Kredi Kartı", HAVALE_EFT:"Havale/EFT", MAIL_ORDER:"Mail Order", DIGER:"Diğer" };
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs">{new Date(p.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-3 py-2 text-xs">{p.doctor?.fullName || "—"}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{ML[p.method] || p.method}</span></td>
                      <td className="px-3 py-2 text-xs">{p.description||"—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{"₺" + Number(p.amount).toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEditPayment(p)} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Düzenle</button>
                          <button onClick={async()=>{if(!(await confirmDialog({ message: "Ödeme silinsin mi?", danger: true, confirmText: "Sil" })))return;const res=await fetch("/api/payments/"+p.id,{method:"DELETE"});if(!res.ok){const err=await res.json().catch(()=>({}));showToast("error",err.message||"Ödeme silinemedi");return;}showToast("success","Ödeme silindi");void load();}} className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-200">Sil</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <button onClick={() => {setInstallmentModalOpen(true); setInstallmentStep("borç"); setInstallmentForm({toplamBorc: String(discountedTotal), pesnat: "0", taksitSayisi: "3", period: "AYLIK", startDate: new Date().toISOString().slice(0, 10), notes: ""});}} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition">+ Taksit Planı Oluştur</button>
          </div>

          <Modal
            open={installmentModalOpen}
            onClose={() => setInstallmentModalOpen(false)}
            title="Taksit Planı Oluştur"
            description={`Adım ${installmentStep === "borç" ? 1 : installmentStep === "plan" ? 2 : 3} / 3`}
            size="lg"
            footer={
              <>
                <Button variant="secondary" onClick={() => {setInstallmentModalOpen(false); setInstallmentStep("borç"); setInstallmentPreview([]);}}>İptal</Button>
                {(installmentStep === "plan" || installmentStep === "onay") && <Button variant="secondary" onClick={handleInstallmentPrevStep}>← Geri</Button>}
                {installmentStep !== "onay" && <Button onClick={handleInstallmentNextStep}>Devam Et</Button>}
                {installmentStep === "onay" && <Button onClick={createInstallmentPlan} loading={installmentLoading}>Planı Oluştur</Button>}
              </>
            }
          >
                <div>
                  {installmentStep === "borç" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-slate-50 border p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-slate-600">Toplam Tedavi:</span><span className="font-bold">₺{totalCharged.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-600">İndirim:</span><span className="font-bold text-orange-600">-₺{(totalCharged - discountedTotal).toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm border-t pt-2"><span className="text-slate-600">Net Tutar:</span><span className="font-bold">₺{discountedTotal.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-600">Ödenen:</span><span className="font-bold text-green-600">₺{totalPaid.toLocaleString("tr-TR")}</span></div>
                        <div className="flex justify-between text-sm border-t pt-2 text-lg"><span className="text-slate-700 font-semibold">Kalan Borç:</span><span className="font-bold text-red-600">₺{totalDebt.toLocaleString("tr-TR")}</span></div>
                      </div>

                      <FormField label="Taksitlendirilecek Tutarı Gir" hint={`Maks: ₺${(discountedTotal - totalPaid).toLocaleString("tr-TR")}`}>
                        <input type="number" min="1" max={discountedTotal - totalPaid} value={installmentForm.toplamBorc} onChange={e=>setInstallmentForm({...installmentForm, toplamBorc:e.target.value})} placeholder="₺ Tutar" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-lg font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                      </FormField>

                      <FormField label="Peşinat Tutarı (İsteğe Bağlı)" hint={Number(installmentForm.pesnat) > 0 ? `Taksitlendirilecek Miktar: ₺${(Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)).toLocaleString("tr-TR")}` : undefined}>
                        <input type="number" min="0" max={Number(installmentForm.toplamBorc) || 0} value={installmentForm.pesnat} onChange={e=>setInstallmentForm({...installmentForm, pesnat:e.target.value})} placeholder="₺ Peşinat" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-lg font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                      </FormField>
                    </div>
                  )}

                  {installmentStep === "plan" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-primary/10 border border-primary/20 p-4">
                        <p className="text-sm text-primary"><strong>Taksitlendirilecek Tutar:</strong> ₺{(Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0)).toLocaleString("tr-TR")}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Taksit Sayısı">
                          <input
                            type="number"
                            min="1"
                            max="60"
                            value={installmentForm.taksitSayisi}
                            onChange={e => {
                              const v = e.target.value;
                              setInstallmentForm(f => ({...f, taksitSayisi: v}));
                              setTimeout(generateInstallmentPreview, 0);
                            }}
                            className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                          />
                        </FormField>
                        <FormField label="Periyod">
                          <select value={installmentForm.period} onChange={e=>{setInstallmentForm({...installmentForm, period:e.target.value as any}); setTimeout(generateInstallmentPreview, 0);}} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                            <option value="HAFTALIK">Haftalık</option>
                            <option value="IKIHALFTALIK">2 Haftalık</option>
                            <option value="AYLIK">Aylık</option>
                            <option value="IKIAYLIK">2 Aylık</option>
                            <option value="UCAYLIK">3 Aylık</option>
                            <option value="ALTIAYLIK">6 Aylık</option>
                          </select>
                        </FormField>
                      </div>

                      <FormField label="İlk Taksit Tarihi">
                        <input type="date" value={installmentForm.startDate} onChange={e=>{setInstallmentForm({...installmentForm, startDate:e.target.value}); setTimeout(generateInstallmentPreview, 0);}} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                      </FormField>

                      <FormField label="Notlar">
                        <textarea value={installmentForm.notes} onChange={e=>setInstallmentForm({...installmentForm, notes:e.target.value})} placeholder="Ek notlar..." rows={2} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                      </FormField>

                      {installmentPreview.length > 0 && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b">
                            <p className="text-xs font-semibold text-slate-700">Taksit Takvimi <span className="text-primary">(düzenlenebilir)</span></p>
                            <button type="button" onClick={() => generateInstallmentPreview()} className="text-xs text-primary hover:underline">↺ Yeniden Oluştur</button>
                          </div>
                          <div className="divide-y max-h-64 overflow-y-auto">
                            {installmentPreview.map((item, i) => (
                              <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 px-3 py-1.5 text-xs">
                                <span className="font-semibold text-slate-500 w-6">{i + 1}.</span>
                                <input
                                  type="date"
                                  value={item.date}
                                  onChange={e => setInstallmentPreview(prev => prev.map((p, j) => j === i ? {...p, date: e.target.value} : p))}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                />
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">₺</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.amount}
                                    onChange={e => setInstallmentPreview(prev => prev.map((p, j) => j === i ? {...p, amount: Number(e.target.value)} : p))}
                                    className="w-full rounded border border-slate-300 pl-5 pr-2 py-1 text-xs focus:border-primary focus:outline-none"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          {(() => {
                            const sumAmounts = installmentPreview.reduce((s, p) => s + (p.amount || 0), 0);
                            const expected = Number(installmentForm.toplamBorc || 0) - Number(installmentForm.pesnat || 0);
                            const diff = Math.abs(sumAmounts - expected);
                            return (
                              <div className={`flex justify-between px-3 py-2 text-xs font-semibold border-t ${diff > 0.02 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                <span>Toplam: ₺{sumAmounts.toLocaleString("tr-TR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                <span>{diff > 0.02 ? `Beklenen: ₺${expected.toLocaleString("tr-TR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "Tutar eşleşiyor"}</span>
                              </div>
                            );
                          })()}
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
                          <div className="flex justify-between"><span>Taksit Sayısı:</span><span className="font-bold">{installmentPreview.length}x</span></div>
                          <div className="flex justify-between"><span>Taksit Tutarı:</span><span className="font-bold">₺{installmentPreview.length > 0 ? (installmentPreview.reduce((s,p)=>s+p.amount,0)/installmentPreview.length).toLocaleString("tr-TR", {maximumFractionDigits: 2}) : "—"}</span></div>
                          <div className="flex justify-between"><span>Başlangıç Tarihi:</span><span>{new Date(installmentForm.startDate).toLocaleDateString("tr-TR")}</span></div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">Lütfen bilgileri kontrol edip Oluştur butonuna basınız</p>
                    </div>
                  )}
                </div>
          </Modal>

          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Ödeme Planları</h3>
              <Link href="/muhasebe?tab=taksit" className="text-xs font-bold text-primary hover:underline">Tüm Planları Aç</Link>
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
                    AKTIF:"bg-green-100 text-green-700", TAMAMLANDI:"bg-primary/10 text-primary",
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
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls[plan.status] || "bg-gray-100 text-gray-600"}`}>{TAKSIT_PLAN_STATUS_LABELS[plan.status] || plan.status}</span>
                          <button onClick={() => printInstallmentPlan(plan)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">🖨 Yazdır</button>
                          <button
                            onClick={async () => {
                              if (!(await confirmDialog({ message: "Bu taksit planı ve tüm taksitleri silinsin mi?", danger: true, confirmText: "Sil" }))) return;
                              const res = await fetch(`/api/taksit-plani/${plan.id}`, { method: "DELETE" });
                              if (res.ok) { showToast("success", "Taksit planı silindi"); void load(); }
                              else showToast("error", "Taksit planı silinemedi");
                            }}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50">
                            Sil
                          </button>
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
                                    <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 font-semibold ${sc[t.status] || "bg-gray-100 text-gray-600"}`}>{TAKSIT_ITEM_STATUS_LABELS[t.status] || t.status}</span></td>
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
                            aria-label="İlacı listeden kaldır"
                            title="İlacı listeden kaldır"
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
              {rxSaving ? "Reçete Kaydediliyor..." : "Reçeteyi Kaydet"}
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
            <div className="flex items-center gap-3">
              <button
                onClick={openLabCreateModal}
                className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                Hasta İçin Yeni İş
              </button>
            </div>
          </div>
          {(!data.labOrders || data.labOrders.length === 0) ? (
            <div className="rounded-xl border bg-white p-8 text-center text-slate-400">
              <svg className="mx-auto mb-3 h-10 w-10 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
              <p>Bu hasta için laboratuvar kaydı bulunmuyor</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                <span className="font-bold text-slate-900">{data.labOrders.length} iş</span>
                <span className="h-4 w-px bg-slate-200" />
                <span>Açık iş: <b className="text-amber-700">{data.labOrders.filter(l=>l.status!=="HASTAYA_TAKILDI"&&l.status!=="IPTAL").length}</b></span>
                <span>Tamamlanan: <b className="text-emerald-700">{data.labOrders.filter(l=>l.status==="HASTAYA_TAKILDI").length}</b></span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(
                    data.labOrders.reduce((acc, order) => {
                      const key = (order.labType || "Belirsiz").trim() || "Belirsiz";
                      acc[key] = (acc[key] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <span key={type} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                        {count} {type}
                      </span>
                    ))}
                </div>
              </div>
              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Tarih</th>
                      <th className="px-3 py-2 text-left">İş</th>
                      <th className="px-3 py-2 text-left">Laboratuvar</th>
                      <th className="px-3 py-2 text-left">Doktor</th>
                      <th className="px-3 py-2 text-left">Durum</th>
                      <th className="px-3 py-2 text-right">Tutar</th>
                      <th className="px-3 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.labOrders.map(l => {
                      // LabOrderStatus enum'u ile birebir eşleşir (bkz. prisma/schema.prisma) —
                      // eskiden burada var olmayan enum değerleri (SIPARIS_VERILDI vb.) listeleniyor,
                      // en sık görülen DEVAM_EDIYOR ise hiç eşleşmediği için ham kod olarak görünüyordu.
                      const statusCls: Record<string,string> = {
                        DEVAM_EDIYOR: "bg-primary/10 text-primary",
                        HASTAYA_TAKILDI: "bg-green-100 text-green-700",
                        IPTAL: "bg-gray-100 text-gray-500",
                      };
                      const statusLabel: Record<string,string> = {
                        DEVAM_EDIYOR: "Laboratuvarda",
                        HASTAYA_TAKILDI: "Hastaya Takıldı",
                        IPTAL: "İptal",
                      };
                      return (
                        <tr
                          key={l.id}
                          className="cursor-pointer hover:bg-slate-50 transition"
                          onClick={() => openLabOrderDetail(l.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openLabOrderDetail(l.id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Laboratuvar işi ${l.labType} laboratuvar merkezinde aç`}
                        >
                          <td className="px-3 py-2 text-xs">{new Date(l.createdAt).toLocaleDateString("tr-TR")}</td>
                          <td className="px-3 py-2 font-medium">
                            <div>{l.labType}</div>
                            {l.notes && <p className="line-clamp-1 text-xs font-normal text-slate-500">{l.notes}</p>}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{l.labName || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{l.doctor?.fullName || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls[l.status] || "bg-gray-100 text-gray-600"}`}>{statusLabel[l.status] || l.status.replace(/_/g," ")}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-red-600">{l.price ? `₺${Number(l.price).toLocaleString("tr-TR")}` : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openLabOrderDetail(l.id);
                              }}
                              className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                            >
                              Aç
                            </button>
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

      {tab === "belgeler" && (
        <div className="space-y-4">
          <PatientConsentPanel patientId={data.id} patientName={data.fullName} patientTcNo={data.tcNo} />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Belge / Röntgen Yükle</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">JPG, PNG, WEBP, PDF · 15MB</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_minmax(220px,1fr)_260px]">
              <div>
                <label className="mb-1 block text-xs text-gray-600">Kategori</label>
                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value as typeof docCategory)} className="w-full rounded border px-3 py-2 text-sm">
                  <option value="BELGE">Belge (kimlik, sigorta, rıza formu…)</option>
                  <option value="RONTGEN">Röntgen</option>
                  <option value="FOTOGRAF">Ağız İçi Fotoğraf</option>
                </select>
              </div>
              {docCategory !== "BELGE" && (
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Diş No (opsiyonel)</label>
                  <input value={docToothNo} onChange={(e) => setDocToothNo(e.target.value)} placeholder="örn. 26" className="w-full rounded border px-3 py-2 text-sm" />
                </div>
              )}
              <div className={docCategory === "BELGE" ? "" : ""}>
                <label className="mb-1 block text-xs text-gray-600">Not (opsiyonel)</label>
                <input value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder="Açıklama" className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">Dosya (JPG, PNG, WEBP, PDF — en fazla 15MB)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={docUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadDocument(file);
                  }}
                  className="w-full rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                />
              </div>
            </div>
            {docUploading && <p className="mt-2 text-xs font-medium text-primary">Dosya yükleniyor, lütfen bekleyin...</p>}
            {docUploadError && <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{docUploadError}</p>}
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Yüklü Belgeler</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{documents.length} kayıt</span>
            </div>
            {documentsLoading && documents.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : documents.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Henüz belge veya röntgen yüklenmemiş.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                    <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer" className="block">
                      {doc.mimeType.startsWith("image/") ? (
                        <img src={`/api/documents/${doc.id}/file`} alt={doc.fileName} className="h-32 w-full object-cover" />
                      ) : (
                        <div className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
                          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                          <span className="text-[10px] font-semibold uppercase">PDF</span>
                        </div>
                      )}
                    </a>
                    <div className="p-1.5">
                      <p className="truncate text-[11px] font-semibold text-slate-700" title={doc.fileName}>{doc.fileName}</p>
                      <p className="text-[10px] text-slate-400">
                        {doc.category === "BELGE" ? "Belge" : doc.category === "RONTGEN" ? "Röntgen" : "Fotoğraf"}
                        {doc.toothNo ? ` · Diş ${doc.toothNo}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => void deleteDocument(doc.id)}
                      title="Sil"
                      aria-label="Sil"
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-500 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "duzenle" && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-4 font-semibold">Hasta Bilgilerini Düzenle</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Ad Soyad">
              <input value={editForm.fullName||""} onChange={e=>setEditForm({...editForm,fullName:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="TC Kimlik No">
              <input value={editForm.tcNo||""} inputMode="numeric" maxLength={11} onChange={e=>setEditForm({...editForm,tcNo:e.target.value.replace(/\D/g,"").slice(0,11)})} className="mt-1 w-full rounded border px-3 py-2 font-mono" />
            </FormField>
            {currentUserRole !== "DOKTOR" && currentUserRole !== "ASISTAN" && (
              <div><PhoneInput label="Telefon" value={editForm.phone||""} onChange={phone=>setEditForm({...editForm,phone})} /></div>
            )}
            <FormField label="Cinsiyet">
              <select value={editForm.gender||""} onChange={e=>setEditForm({...editForm,gender:e.target.value})} className="mt-1 w-full rounded border px-3 py-2"><option value="ERKEK">Erkek</option><option value="KADIN">Kadın</option></select>
            </FormField>
            <FormField label="Doğum Tarihi">
              <input type="date" value={(editForm.birthDate as string)||""} onChange={e=>setEditForm({...editForm,birthDate:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="Kan Grubu">
              <select value={(editForm as any).bloodType||""} onChange={e=>setEditForm({...editForm,...{bloodType:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2"><option value="">Bilinmiyor</option>{["A+","A-","B+","B-","AB+","AB-","0+","0-"].map(g=><option key={g} value={g}>{g}</option>)}</select>
            </FormField>
            <FormField label="Anlaşmalı Kurum">
              <input value={editForm.insurance||""} onChange={e=>setEditForm({...editForm,insurance:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="Referans Eden Kişi">
              <input value={(editForm as any).referrer||""} onChange={e=>setEditForm({...editForm,...{referrer:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="Meslek">
              <input value={(editForm as any).profession||""} onChange={e=>setEditForm({...editForm,...{profession:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="İndirim Oranı (%)">
              <input type="number" min={0} max={100} value={editForm.discountRate||0} onChange={e=>setEditForm({...editForm,discountRate:Math.min(100,Math.max(0,parseInt(e.target.value)||0))})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Adres">
                <input value={editForm.address||""} onChange={e=>setEditForm({...editForm,address:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
              </FormField>
            </div>
            <FormField label="Geçirdiği Ameliyatlar">
              <input value={editForm.surgeries||""} onChange={e=>setEditForm({...editForm,surgeries:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <FormField label="Kullandığı İlaçlar">
              <input value={editForm.medications||""} onChange={e=>setEditForm({...editForm,medications:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Diğer Hastalıklar">
                <input value={(editForm as any).otherDiseases||""} onChange={e=>setEditForm({...editForm,...{otherDiseases:e.target.value}})} className="mt-1 w-full rounded border px-3 py-2" />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-gray-600 mb-2">Sağlık Durumu</p>
              <div className="flex flex-wrap gap-4">
                {([["hasAllergy","Alerji"],["hasHeart","Kalp Hastalığı"],["hasDiabetes","Diyabet"],["hasKidney","Böbrek Hastalığı"],["hasHepatitis","Hepatit"],["hasBloodIssue","Kan Sorunu"],["hasContagiousDisease","Bulaşıcı Hastalık"]] as [keyof Patient,string][]).map(([field,label])=>(
                  <label key={field} className={`flex items-center gap-1 text-sm cursor-pointer ${field === "hasContagiousDisease" ? "font-bold text-red-700" : ""}`}>
                    <input type="checkbox" checked={!!editForm[field]} onChange={e=>setEditForm({...editForm,[field]:e.target.checked})} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {editForm.hasContagiousDisease && (
              <div className="md:col-span-2">
                <FormField label="Bulaşıcı Hastalık Detayı">
                  <input value={editForm.contagiousDiseaseNote||""} onChange={e=>setEditForm({...editForm,contagiousDiseaseNote:e.target.value})} placeholder="Hangi bulaşıcı hastalık? (ör. Hepatit B, Tüberküloz)" className="mt-1 w-full rounded border border-red-200 bg-red-50/50 px-3 py-2" />
                </FormField>
              </div>
            )}
            <div className="md:col-span-2">
              <FormField label="Notlar">
                <textarea value={editForm.notes||""} onChange={e=>setEditForm({...editForm,notes:e.target.value})} rows={2} className="mt-1 w-full rounded border px-3 py-2" />
              </FormField>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveEdit} loading={editLoading}>Kaydet</Button>
            <Button variant="secondary" onClick={cancelEdit} disabled={editLoading}>Vazgeç</Button>
          </div>
        </div>
      )}

      <Modal
        open={labCreateModalOpen}
        onClose={closeLabCreateModal}
        title="Hasta İçin Yeni Laboratuvar İşi"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeLabCreateModal}>Vazgeç</Button>
            <Button
              onClick={createOrderFromPatientDetail}
              disabled={labCreateSaving || !labNewForm.doctorId || !labNewForm.labName.trim() || !labNewForm.labType.trim()}
              loading={labCreateSaving}
            >
              Oluştur
            </Button>
          </>
        }
      >
            <div className="space-y-3">
              {labCreateError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{labCreateError}</div>
              )}
              <LabOrderForm
                hidePatientField
                doctorSearch={labNewDoctorSearch}
                onDoctorSearchChange={(value) => {
                  setLabNewDoctorSearch(value);
                  setLabNewForm((prev) => ({ ...prev, doctorId: "" }));
                }}
                doctorOptions={labNewDoctorOptions}
                onDoctorSelect={(option) => {
                  setLabNewDoctorSearch(option.label);
                  setLabNewForm((prev) => ({ ...prev, doctorId: option.id }));
                }}
                labSearch={labNewLabSearch}
                onLabSearchChange={(value) => {
                  setLabNewLabSearch(value);
                  setLabNewForm((prev) => ({ ...prev, labName: value, customLabName: "" }));
                }}
                labOptions={labNewLabOptions}
                onLabSelect={(option) => {
                  setLabNewLabSearch(option.label);
                  setLabNewForm((prev) => ({ ...prev, labName: option.label, customLabName: "" }));
                }}
                hasKnownLabs={knownLabs.length > 0}
                labTypeSearch={labNewTypeSearch}
                onLabTypeSearchChange={(value) => {
                  setLabNewTypeSearch(value);
                  setLabNewForm((prev) => ({ ...prev, labType: "" }));
                }}
                labTypeOptions={labNewTypeOptions}
                onLabTypeSelect={(option) => {
                  const selected = option.label;
                  const first = WORKFLOW_FIRST_STEP[selected];
                  setLabNewTypeSearch(selected);
                  setLabNewForm((prev) => ({
                    ...prev,
                    labType: selected,
                    sentItem: first ? first.send : prev.sentItem,
                    requestedItem: first ? first.request : prev.requestedItem,
                  }));
                }}
                teethSelector={
                  <LabDentalChart
                    selected={labNewForm.teeth ? labNewForm.teeth.split(",").map((t) => Number(t.trim())).filter(Boolean) : []}
                    onChange={(nums) => setLabNewForm((prev) => ({ ...prev, teeth: nums.join(", ") }))}
                  />
                }
                sentItem={labNewForm.sentItem}
                onSentItemChange={(value) =>
                  setLabNewForm((prev) => ({
                    ...prev,
                    sentItem: value,
                    impressionMethod: isMeasurementStep(value) ? prev.impressionMethod : "",
                  }))
                }
                sentItemQuickPicks={
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SPOON_REQUEST_OPTIONS.map((opt) => {
                      const isActive = labNewForm.requestedItem === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (isActive) {
                              // Seçimi kaldır — labType'a göre varsayılan öneriye dön
                              const defaultRequest = WORKFLOW_FIRST_STEP[labNewForm.labType]?.request || "";
                              setLabNewForm((prev) => ({ ...prev, requestedItem: defaultRequest }));
                            } else {
                              setLabNewForm((prev) => ({ ...prev, sentItem: "Ölçü", requestedItem: opt }));
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                }
                requestedItem={labNewForm.requestedItem}
                onRequestedItemChange={(value) => setLabNewForm((prev) => ({ ...prev, requestedItem: value }))}
                showImpressionMethod={isMeasurementStep(labNewForm.sentItem)}
                impressionMethod={labNewForm.impressionMethod}
                onImpressionMethodChange={(value) => setLabNewForm((prev) => ({ ...prev, impressionMethod: value as ImpressionMethod }))}
                notes={labNewForm.notes}
                onNotesChange={(value) => setLabNewForm((prev) => ({ ...prev, notes: value }))}
              />
            </div>
      </Modal>

      <Modal
        open={labDetailModalOpen}
        onClose={() => { if (!labDetailAction) closeLabDetailModal(); }}
        title="Laboratuvar İş Detayı"
        description={labOrderDetail ? `${labOrderDetail.patient?.fullName || data?.fullName} · ${labOrderDetail.labType} · ${labOrderDetail.labName || "Laboratuvar"}` : undefined}
        size="xl"
      >
              {labDetailLoading ? (
                <div className="space-y-2" aria-busy="true">
                  <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                </div>
              ) : !labOrderDetail ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-600">{labActionError || "Laboratuvar detayı yüklenemedi."}</p>
                  {!!labSelectedOrderId && (
                    <button
                      type="button"
                      onClick={() => openLabDetailModal(labSelectedOrderId)}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Tekrar Dene
                    </button>
                  )}
                </div>
              ) : (
                <LabOrderDetailPanel
                  order={toSharedLabOrder(labOrderDetail)}
                  onAddTrip={openPatientLabTripAction}
                  onAddInvoice={openPatientLabInvoiceAction}
                  onReceive={openPatientLabReceiveAction}
                  onEditTrip={openPatientLabEditTripAction}
                  onComplete={completeLabOrderFromPatientDetail}
                  onRpt={openPatientLabRptAction}
                />
              )}
      </Modal>

      {labDetailAction && labOrderDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={closeLabDetailAction}>
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Laboratuvar işlem penceresi"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {labDetailAction === "trip" && "Laboratuvara Gönderim Ekle"}
                  {labDetailAction === "receive" && "Laboratuvardan Geliş Kaydet"}
                  {labDetailAction === "invoice" && "Fatura Kalemi"}
                  {labDetailAction === "editTrip" && "Adımı Düzenle"}
                  {labDetailAction === "rpt" && "RPT Olarak Yeniden Aç"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {labOrderDetail.patient?.fullName || data?.fullName} · {labOrderDetail.labType} · {labOrderDetail.labName || "Laboratuvar"}
                </p>
              </div>
              <button onClick={closeLabDetailAction} aria-label="Kapat" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {labActionError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {labActionError}
                </div>
              )}

              {labDetailAction === "trip" && (
                <div className="space-y-3">
                  {(() => {
                    const template = WORKFLOW_TEMPLATES[labOrderDetail.labType] ?? [];
                    const stepIndex = getNextTemplateStepIndex(labOrderDetail.labType, labOrderDetail.trips);
                    const suggestion = template[stepIndex] ?? null;
                    return template.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {labOrderDetail.labType} · Adım {Math.min(stepIndex + 1, template.length)}/{template.length}
                        </p>
                        <div className="mt-2 flex gap-1">
                          {template.map((_, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded px-1 py-1 text-center text-xs ${
                                i < stepIndex ? "bg-emerald-100 text-emerald-700" : i === stepIndex ? "bg-slate-800 font-semibold text-white" : "bg-slate-200 text-slate-400"
                              }`}
                            >
                              {i + 1}
                            </div>
                          ))}
                        </div>
                        {suggestion && (
                          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-900">
                            {suggestion.send} <span className="text-slate-400">→</span> {suggestion.request}
                          </p>
                        )}
                      </div>
                    ) : null;
                  })()}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gönderilen *</span>
                    <input
                      value={labTripForm.sentItem}
                      onChange={(e) => setLabTripForm((prev) => ({ ...prev, sentItem: e.target.value, impressionMethod: isMeasurementStep(e.target.value) ? prev.impressionMethod : "" }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      placeholder="Ölçü, zirkon alt yapı, prova..."
                      autoFocus
                    />
                  </label>
                  {isMeasurementStep(labTripForm.sentItem) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-black uppercase tracking-wide text-amber-700">Özel Ölçü / Kaşık Talebi</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {SPOON_REQUEST_OPTIONS.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setLabTripForm((prev) => ({ ...prev, sentItem: "Ölçü", requestedItem: item }))}
                            className={`rounded-full border px-2.5 py-1.5 text-xs font-bold transition ${
                              isSameWorkflowValue(labTripForm.requestedItem, item)
                                ? "border-slate-800 bg-slate-900 text-white"
                                : "border-amber-200 bg-white text-amber-800 hover:bg-amber-100"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Laboratuvardan Beklenen</span>
                    <input
                      value={labTripForm.requestedItem}
                      onChange={(e) => setLabTripForm((prev) => ({ ...prev, requestedItem: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      placeholder="Zirkonyum alt yapı, dentin prova, glaze..."
                    />
                  </label>
                  {isMeasurementStep(labTripForm.sentItem) && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ölçü Yöntemi</span>
                      <select
                        value={labTripForm.impressionMethod}
                        onChange={(e) => setLabTripForm((prev) => ({ ...prev, impressionMethod: e.target.value as ImpressionMethod }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      >
                        <option value="">Seçiniz</option>
                        <option value="KLASIK_OLCU">Klasik Ölçü</option>
                        <option value="DIJITAL_TARAMA">Dijital Tarama</option>
                      </select>
                    </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gönderim Tarihi *</span>
                      <input
                        type="date"
                        value={labTripForm.sentAt}
                        onChange={(e) => setLabTripForm((prev) => ({ ...prev, sentAt: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Teknik Not</span>
                      <input
                        value={labTripForm.sentNote}
                        onChange={(e) => setLabTripForm((prev) => ({ ...prev, sentNote: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                        placeholder="Renk kodu, özel not..."
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <button onClick={closeLabDetailAction} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
                    <button onClick={createTripAndCloseFromPatientDetail} disabled={labActionSaving || !labTripForm.sentItem.trim()} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {labActionSaving ? "Kaydediliyor..." : "Gönderimi Kaydet"}
                    </button>
                  </div>
                </div>
              )}

              {labDetailAction === "receive" && labActiveTrip && (
                <div className="space-y-3">
                  {(() => {
                    const parts = splitTripDescription(labActiveTrip.description);
                    const differs = labReceiveForm.receivedItem && parts.requestedItem && !isSameWorkflowValue(labReceiveForm.receivedItem, parts.requestedItem);
                    return (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Geliş Özeti</p>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          <div><p className="text-[11px] font-bold uppercase text-slate-400">Gönderilen</p><p className="font-semibold text-slate-900">{parts.sentItem || "-"}</p></div>
                          <div>
                            <p className="text-[11px] font-bold uppercase text-slate-400">Laboratuvardan Gelen</p>
                            <p className="font-semibold text-slate-900">{labReceiveForm.receivedItem || parts.requestedItem || parts.sentItem || "-"}</p>
                            {differs && <p className="mt-1 text-xs font-bold text-amber-700">Beklenen: {parts.requestedItem}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Geliş Tarihi</span>
                    <input type="date" value={labReceiveForm.receivedAt} onChange={(e) => setLabReceiveForm((prev) => ({ ...prev, receivedAt: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Laboratuvardan Gelen</span>
                    <input value={labReceiveForm.receivedItem} onChange={(e) => setLabReceiveForm((prev) => ({ ...prev, receivedItem: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Beklenenden farklı geldiyse değiştirin" />
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-900 transition hover:bg-violet-100">
                    <input type="checkbox" checked={labReceiveForm.needsAppointment} onChange={(e) => setLabReceiveForm((prev) => ({ ...prev, needsAppointment: e.target.checked }))} className="mt-0.5 accent-slate-800" />
                    <span>
                      <span className="block font-black">Bu geliş için prova/randevu planlanacak</span>
                      <span className="mt-0.5 block text-violet-700">Hasta Takip ekranında en güncel lab prova aksiyonu olarak görünür.</span>
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Geliş Notu</span>
                    <input value={labReceiveForm.receivedNote} onChange={(e) => setLabReceiveForm((prev) => ({ ...prev, receivedNote: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Prova hazır, küçük düzeltme gerekli..." />
                  </label>
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <button onClick={closeLabDetailAction} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
                    <button onClick={markTripReceivedFromPatientDetail} disabled={labActionSaving} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {labActionSaving ? "Kaydediliyor..." : "Gelişi Kaydet"}
                    </button>
                  </div>
                </div>
              )}

              {labDetailAction === "invoice" && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Kalem *</span>
                    <input value={labInvoiceForm.item} onChange={(e) => setLabInvoiceForm((prev) => ({ ...prev, item: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Zirkon alt yapı, glaze..." autoFocus />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tutar (TRY) *</span>
                      <input type="number" value={labInvoiceForm.amount} onChange={(e) => setLabInvoiceForm((prev) => ({ ...prev, amount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="0" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fatura No</span>
                      <input value={labInvoiceForm.invoiceNo} onChange={(e) => setLabInvoiceForm((prev) => ({ ...prev, invoiceNo: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="FAT-001" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fatura Tarihi</span>
                    <input type="date" value={labInvoiceForm.issuedAt} onChange={(e) => setLabInvoiceForm((prev) => ({ ...prev, issuedAt: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Not</span>
                    <input value={labInvoiceForm.note} onChange={(e) => setLabInvoiceForm((prev) => ({ ...prev, note: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                  </label>
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <button onClick={closeLabDetailAction} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
                    <button onClick={addLabInvoiceFromPatientDetail} disabled={labActionSaving || !labInvoiceForm.item.trim() || !labInvoiceForm.amount} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {labActionSaving ? "Kaydediliyor..." : "Ekle"}
                    </button>
                  </div>
                </div>
              )}

              {labDetailAction === "editTrip" && labActiveTrip && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gönderilen *</span>
                    <input value={labTripEditForm.sentItem} onChange={(e) => setLabTripEditForm((prev) => ({ ...prev, sentItem: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" autoFocus />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Laboratuvardan Beklenen</span>
                    <input value={labTripEditForm.requestedItem} onChange={(e) => setLabTripEditForm((prev) => ({ ...prev, requestedItem: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gönderim Tarihi *</span>
                      <input type="date" value={labTripEditForm.sentAt} onChange={(e) => setLabTripEditForm((prev) => ({ ...prev, sentAt: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gönderim Notu</span>
                      <input value={labTripEditForm.sentNote} onChange={(e) => setLabTripEditForm((prev) => ({ ...prev, sentNote: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                    </label>
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <button onClick={closeLabDetailAction} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
                    <button onClick={saveTripEditAndCloseFromPatientDetail} disabled={labActionSaving || !labTripEditForm.sentItem.trim()} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {labActionSaving ? "Kaydediliyor..." : "Güncelle"}
                    </button>
                  </div>
                </div>
              )}

              {labDetailAction === "rpt" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">RPT olarak açılan iş ücretsiz tekrar üretim sürecidir. Yeni döngü başlatılır ve fatura ekleme engellenir.</p>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">RPT Nedeni *</span>
                    <input value={labRptReason} onChange={(e) => setLabRptReason(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Örn. Revizyon gerekli" autoFocus />
                  </label>
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <button onClick={closeLabDetailAction} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
                    <button onClick={reopenLabOrderAsRptFromPatientDetail} disabled={labActionSaving || !labRptReason.trim()} className="flex-1 rounded-lg bg-violet-700 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {labActionSaving ? "Açılıyor..." : "RPT Olarak Aç"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Dışa Aktarım"
        description="Hasta dosyasından sadece ihtiyacınız olan bölümleri seçin."
        size="xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Dışa aktarım KVKK erişim işlemi olarak denetim günlüğüne işlenir.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setExportModalOpen(false)}>Vazgeç</Button>
              <Button
                onClick={runPatientExport}
                disabled={exportBusy || exportSelectedKeys.length === 0}
                loading={exportBusy}
              >
                {exportFormat === "pdf" ? "PDF" : "Excel"} Oluştur
              </Button>
            </div>
          </div>
        }
      >
              <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-400">Format</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["pdf", "excel"] as ExportFormat[]).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setExportFormat(format)}
                        className={`rounded-xl border px-3 py-2 text-sm font-black transition ${exportFormat === format ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        {format === "pdf" ? "PDF" : "Excel"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-400">Hızlı Seçim</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExportSelection({ ...DEFAULT_PATIENT_EXPORT_SELECTION, completedTreatments: true, plannedTreatments: true, payments: true })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Tedavi + Ödeme
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportSelection({ ...DEFAULT_PATIENT_EXPORT_SELECTION, profile: false, completedTreatments: false, plannedTreatments: false, payments: false, balance: false, appointments: true })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Sadece Randevular
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportSelection(Object.fromEntries(PATIENT_EXPORT_SECTIONS.map((section) => [section.key, true])) as Record<PatientExportSection, boolean>)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Tüm Dosya
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportSelection(Object.fromEntries(PATIENT_EXPORT_SECTIONS.map((section) => [section.key, false])) as Record<PatientExportSection, boolean>)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={exportHideDoctor}
                  onChange={(e) => setExportHideDoctor(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-black text-slate-900">Doktor bilgisini gizle</span>
                  <span className="mt-0.5 block text-xs text-slate-500">PDF ve Excel çıktılarında hekim adları kolon olarak yer almaz.</span>
                </span>
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase text-slate-400">İçerik</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{exportSelectedKeys.length} bölüm seçili</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PATIENT_EXPORT_SECTIONS.map((section) => {
                    const selected = exportSelection[section.key];
                    return (
                      <label
                        key={section.key}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${selected ? "border-primary/20 bg-primary/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => setExportSelection((prev) => ({ ...prev, [section.key]: e.target.checked }))}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-slate-900">{section.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{section.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              </div>
      </Modal>

      <Modal
        open={paymentModalOpen}
        onClose={closePaymentModal}
        title={editingPaymentId ? "Ödemeyi Düzenle" : "Ödeme Al"}
        description={`${data.fullName} adına tahsilat ${editingPaymentId ? "güncellenir" : "kaydedilir"}.`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closePaymentModal}>Vazgeç</Button>
            <Button variant="primary" onClick={addPayment} loading={payLoading}>
              {editingPaymentId ? "Güncelle" : "Ödeme Kaydet"}
            </Button>
          </>
        }
      >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Tutar (₺)" required>
                <input type="number" placeholder="0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-bold focus:border-emerald-400 focus:outline-none" value={payAmount} onChange={e=>setPayAmount(e.target.value)} autoFocus />
              </FormField>
              <FormField label="Doktor" required>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payDoctorId} onChange={e=>setPayDoctorId(e.target.value)}>
                  <option value="">— Doktor seçin —</option>
                  {doctorOptions.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </FormField>
              {editingPaymentId && (
                <FormField label="Tarih">
                  <input type="date" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payDate} onChange={e=>setPayDate(e.target.value)} />
                </FormField>
              )}
              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                <div className="flex flex-wrap gap-2">
                  {(["NAKIT","KREDI_KARTI","HAVALE_EFT","MAIL_ORDER","DIGER"] as const).map(m => (
                    <button key={m} type="button" onClick={() => { setPayMethod(m); setPayPosId(""); }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${payMethod === m ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {m === "NAKIT" ? "Nakit" : m === "KREDI_KARTI" ? "Kart" : m === "HAVALE_EFT" ? "Havale" : m === "MAIL_ORDER" ? "Mail Order" : "Diğer"}
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
                <FormField label="Açıklama">
                  <input placeholder="Tedavi türü, notlar…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" value={payDesc} onChange={e=>setPayDesc(e.target.value)} />
                </FormField>
              </div>
            </div>
      </Modal>

      {/* Tedavi Yazdırma Modalı */}
      <Modal
        open={treatmentPrintOpen}
        onClose={() => setTreatmentPrintOpen(false)}
        title="Tedavi Raporu Yazdır"
        description="Yazdırmak istediğiniz tedavileri seçin. Varsayılan olarak tüm tedaviler seçilidir."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTreatmentPrintOpen(false)}>Kapat</Button>
            <Button onClick={() => { doPrintTreatments(); setTreatmentPrintOpen(false); }} disabled={selectedTreatForPrint.length === 0}>🖨 Yazdır ({selectedTreatForPrint.length})</Button>
          </>
        }
      >
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
                  checked={selectedTreatForPrint.length === (data?.examinations||[]).filter(e=>isChargeableTreatment(e.status)).length && selectedTreatForPrint.length > 0}
                  onChange={e => {
                    const list = (data?.examinations||[]).filter(e=>isChargeableTreatment(e.status));
                    setSelectedTreatForPrint(e.target.checked ? list.map(t=>t.id) : []);
                  }}
                  className="rounded"
                />
                <span className="font-medium">Tümünü seç</span>
              </label>
              <span className="text-xs text-slate-500">{selectedTreatForPrint.length} seçili</span>
            </div>
            <div className="overflow-y-auto max-h-64 space-y-0.5 border rounded-lg p-2">
              {(data?.examinations||[]).filter(e=>isChargeableTreatment(e.status)).map(t => (
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
              {(data?.examinations||[]).filter(e=>isChargeableTreatment(e.status)).length === 0 && <p className="text-center text-sm text-slate-400 p-4">Tedavi kaydı yok</p>}
            </div>
      </Modal>

      {/* Ödeme Yazdırma Modalı */}
      <Modal
        open={paymentPrintOpen}
        onClose={() => setPaymentPrintOpen(false)}
        title="Ödeme Geçmişi Yazdır"
        description="Yazdırmak istediğiniz ödemeleri seçin. Varsayılan olarak tüm ödemeler seçilidir."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentPrintOpen(false)}>Kapat</Button>
            <Button onClick={() => { doPrintPayments(); setPaymentPrintOpen(false); }} disabled={selectedPayForPrint.length === 0}>🖨 Yazdır ({selectedPayForPrint.length})</Button>
          </>
        }
      >
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
            <div className="overflow-y-auto max-h-64 space-y-0.5 border rounded-lg p-2">
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
      </Modal>
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
