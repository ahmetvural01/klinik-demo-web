// Hasta dosyası ekranının (hasta-detay) sekmeleri arasında paylaşılan tipler,
// etiket haritaları ve hesap yardımcıları. Önceden hepsi tek bir 5.800 satırlık
// bileşenin içindeydi; aynı etiket (ör. ödeme yöntemi) üç ayrı yerde, üç ayrı
// biçimde yazılıyordu.

import { formatCurrency } from "@/lib/format";
import { getDisplayAppointmentStatus, APPOINTMENT_DISPLAY_STATUS_LABELS, APPOINTMENT_DISPLAY_STATUS_TONE } from "@/lib/appointment-status";
import { examStatusKind, isChargeableExamStatus } from "@/lib/examination-status";
import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Sekmeler. "notlar" ayrı sekme değil: notlar Özet'te tek yerde tutulur
 * (önceden aynı not kutusu hem Özet'te hem Notlar sekmesinde vardı). Eski
 * `?tab=notlar` bağlantıları Özet'e açılır.
 */
export type TabKey = "bilgi" | "tedavi" | "odeme" | "randevular" | "lab" | "recete" | "gorevler" | "belgeler";

export const TAB_ORDER: TabKey[] = ["bilgi", "tedavi", "odeme", "randevular", "lab", "recete", "gorevler", "belgeler"];

export const TAB_LABELS: Record<TabKey, string> = {
  bilgi: "Özet",
  tedavi: "Tedavi",
  odeme: "Tahsilat",
  randevular: "Randevular",
  lab: "Laboratuvar",
  recete: "Reçete",
  gorevler: "Görevler",
  belgeler: "Belgeler ve onam",
};

export const TAB_PERMISSIONS: Record<TabKey, string[]> = {
  bilgi: ["patients:read"],
  randevular: ["appointments:read"],
  gorevler: ["clinictasks:read"],
  tedavi: ["examinations:read", "treatment:read"],
  odeme: ["payments:read", "installments:read", "finance:read"],
  recete: ["prescriptions:read"],
  lab: ["lab:read"],
  belgeler: ["documents:read"],
};

export type PatientDocument = {
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

export type LabTripLite = {
  id: string;
  order: number;
  description: string;
  sentAt: string;
  expectedAt?: string | null;
  receivedAt?: string | null;
  sentNote?: string | null;
  receivedNote?: string | null;
};

export type LabOrder = {
  id: string;
  labName?: string;
  labType: string;
  status: string;
  price?: number | string | null;
  notes?: string | null;
  teeth?: string | null;
  createdAt: string;
  doctor?: { id?: string; fullName: string } | null;
  firmaId?: string | null;
  trips?: LabTripLite[];
  invoices?: { id: string; item: string; amount: number | string; invoiceNo?: string | null; issuedAt: string; note?: string | null }[];
};

export type TaksitItem = {
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

export type TaksitPlan = {
  id: string;
  baslik?: string | null;
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

// Bkz. docs/ILETISIM-MIMARISI-RAPORU.md §1.5 — hasta dosyasındaki SMS izin
// durumu. EXPIRED alanı DB'de tutulmaz, ekranda türetilir.
export type SmsPreference = {
  status: "PENDING" | "ENABLED" | "DISABLED" | "EXPIRED";
  firstConsentAt?: string | null;
  lastRejectionAt?: string | null;
  lastRequestSentAt?: string | null;
  lastRequestAttemptAt?: string | null;
  lastRequestError?: string | null;
};

export type SmsConsentTokenLite = {
  purpose: "INITIAL" | "RESEND";
  expiresAt: string;
  usedAt?: string | null;
  resultStatus?: "PENDING" | "ENABLED" | "DISABLED" | "EXPIRED" | null;
};

export type Appt = {
  id: string;
  startAt: string;
  endAt: string;
  type: string;
  status: string;
  note?: string | null;
  doctor?: { id?: string; fullName: string } | null;
  clinicUnit?: { name: string; code?: string | null } | null;
};

export type Exam = {
  id: string;
  treatmentName: string;
  toothNo?: string | null;
  amount: string | number;
  status: string;
  diagnosedAt: string;
  note?: string | null;
  doctorId: string;
  doctor?: { id: string; fullName: string };
};

export type Pay = {
  id: string;
  amount: string | number;
  method: string;
  description?: string | null;
  createdAt: string;
  doctorId?: string | null;
  doctor?: { id: string; fullName: string } | null;
  posId?: string | null;
};

export type Rx = {
  id: string;
  drugs: string;
  note?: string | null;
  status?: string | null;
  createdAt: string;
  doctor?: { id?: string; fullName: string } | null;
};

export type ClinicTask = {
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
  assignees?: Array<{ userId: string; user: { id: string; fullName: string; role: string; isActive?: boolean } }>;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
};

export type TreatmentPlanLite = {
  id: string;
  title: string;
  status: string;
  totalCost: number | string | null;
  steps: { id: string }[];
};

export type PatientDetailData = {
  id: string;
  fullName: string;
  tcNo: string | null;
  isForeigner?: boolean;
  phoneCountryCode?: string;
  phone: string;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
  discountRate: number;
  referrer?: string | null;
  profession?: string | null;
  notes?: string | null;
  address?: string | null;
  surgeries?: string | null;
  medications?: string | null;
  otherDiseases?: string | null;
  bloodType?: string | null;
  toothChart?: string | null;
  createdAt: string;
  hasAllergy: boolean;
  hasHepatitis: boolean;
  hasKidney: boolean;
  hasDiabetes: boolean;
  hasHeart: boolean;
  hasBloodIssue: boolean;
  hasContagiousDisease: boolean;
  contagiousDiseaseNote?: string | null;
  appointments: Appt[];
  examinations: Exam[];
  payments: Pay[];
  prescriptions: Rx[];
  labOrders: LabOrder[];
  taksitPlanlari: TaksitPlan[];
  smsPreference?: SmsPreference | null;
  smsConsentTokens?: SmsConsentTokenLite[];
};

export type DoctorOption = { id: string; fullName: string; role: string; isActive?: boolean | null; profile?: { hideAsDoctor?: boolean | null } | null };

// ── Sözcükler ─────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi kartı",
  HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail order",
  DIGER: "Diğer",
};

export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method] || method;

export const TASK_TYPE_LABELS: Record<ClinicTask["type"], string> = {
  PARCA_SIPARIS: "Parça sipariş",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

export const TASK_STATUS_LABELS: Record<ClinicTask["status"], string> = {
  ACIK: "Açık",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

export const TASK_STATUS_TONE: Record<ClinicTask["status"], BadgeTone> = {
  ACIK: "info",
  BEKLEMEDE: "warning",
  TAMAMLANDI: "success",
  IPTAL: "neutral",
};

export const TASK_PRIORITY_LABELS: Record<number, string> = { 1: "Düşük", 2: "Orta", 3: "Yüksek" };

export const TAKSIT_PLAN_STATUS_LABELS: Record<string, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
  DEVAM_EDIYOR: "Devam ediyor",
};

export const TAKSIT_PLAN_STATUS_TONE: Record<string, BadgeTone> = {
  AKTIF: "info",
  DEVAM_EDIYOR: "info",
  TAMAMLANDI: "success",
  IPTAL: "neutral",
};

export const TAKSIT_ITEM_STATUS_LABELS: Record<string, string> = {
  ODENDI: "Ödendi",
  KISMI: "Kısmen ödendi",
  BEKLIYOR: "Bekliyor",
  GECIKTI: "Gecikti",
  IPTAL: "İptal",
};

export const TAKSIT_ITEM_STATUS_TONE: Record<string, BadgeTone> = {
  ODENDI: "success",
  KISMI: "info",
  BEKLIYOR: "warning",
  GECIKTI: "critical",
  IPTAL: "neutral",
};

export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  STANDART: "Muayene",
  KONTROL: "Kontrol",
  ACIL: "Acil",
};

export const appointmentTypeLabel = (type: string | null | undefined) => APPOINTMENT_TYPE_LABELS[String(type || "")] || "Muayene";

/**
 * Ekranda gösterilecek randevu durumu. Ham "GELDI" ekranda "Bekliyor" (hasta
 * geldi, bekleme salonunda), ham "BEKLIYOR" "Planlandı" yazar — bu kural
 * kullanıcı geri bildirimiyle konuldu (bkz. src/lib/appointment-status.ts);
 * değiştirilmez.
 */
export function appointmentStatusView(rawStatus: string) {
  const display = getDisplayAppointmentStatus(rawStatus || "");
  return {
    display,
    label: APPOINTMENT_DISPLAY_STATUS_LABELS[display] || "Planlandı",
    tone: (APPOINTMENT_DISPLAY_STATUS_TONE[display] || "info") as BadgeTone,
  };
}

export const DOCUMENT_CATEGORY_LABELS: Record<PatientDocument["category"], string> = {
  BELGE: "Belge",
  RONTGEN: "Röntgen",
  FOTOGRAF: "Ağız içi fotoğraf",
};

// ── Hesaplar ──────────────────────────────────────────────────────────────

export const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/** Kuruşa yuvarlar: 0,1 + 0,2 gibi kayan nokta artıkları "0,00 TL borç" göstermesin. */
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Para her yerde aynı biçimde: ₺1.250,00 */
export const money = (value: unknown) => formatCurrency(roundMoney(toNumber(value)));

/** Muayene listesinde (henüz yapılmamış, ücrete yansımayan) kayıt mı? */
export const isPendingExam = (exam: Pick<Exam, "status">) => examStatusKind(exam.status) === "pending";
/** Yapılan (hastanın borcuna yansıyan) tedavi mi? İptal edilenler hariç. */
export const isChargeableExam = (exam: Pick<Exam, "status">) => isChargeableExamStatus(exam.status);

export type PatientBalance = {
  /** Yapılan (ücrete yansıyan) tedavilerin indirimsiz toplamı. */
  totalCharged: number;
  /** İndirim oranı (%). */
  discountRate: number;
  /** İndirim tutarı. */
  discountAmount: number;
  /** İndirimli tedavi toplamı (hastanın ödemesi gereken). */
  discountedTotal: number;
  /** Alınan tahsilatların toplamı. */
  totalPaid: number;
  /** Kalan borç; eksi ise hasta fazla ödemiş (avans). Kuruşa yuvarlanmış. */
  totalDebt: number;
};

export function computeBalance(data: Pick<PatientDetailData, "examinations" | "payments" | "discountRate">): PatientBalance {
  const totalCharged = roundMoney(data.examinations.filter(isChargeableExam).reduce((sum, e) => sum + toNumber(e.amount), 0));
  const discountRate = toNumber(data.discountRate);
  const discountedTotal = roundMoney(totalCharged * (1 - discountRate / 100));
  const totalPaid = roundMoney(data.payments.reduce((sum, p) => sum + toNumber(p.amount), 0));
  return {
    totalCharged,
    discountRate,
    discountAmount: roundMoney(totalCharged - discountedTotal),
    discountedTotal,
    totalPaid,
    totalDebt: roundMoney(discountedTotal - totalPaid),
  };
}

export const getItemAmount = (item: TaksitItem) => toNumber(item.amount ?? item.tutar);
export const getItemDueDate = (item: TaksitItem) => String(item.dueDate ?? item.vadeDate ?? "");
export const getItemPaidAt = (item: TaksitItem) => String(item.paidAt ?? item.odenenAt ?? "");
export const getItemPaid = (item: TaksitItem) => toNumber(item.odenen);
/** Taksidin kalan tutarı (kısmen ödenmiş taksitte tutar − ödenen). */
export const getItemRemaining = (item: TaksitItem) => {
  if (item.kalan !== undefined && item.kalan !== null) return toNumber(item.kalan);
  return Math.max(getItemAmount(item) - getItemPaid(item), 0);
};

export const getPlanTotal = (plan: TaksitPlan) => {
  if (plan.totalAmount !== undefined && plan.totalAmount !== null) return toNumber(plan.totalAmount);
  if (plan.toplamBorc !== undefined && plan.toplamBorc !== null) return toNumber(plan.toplamBorc);
  return (plan.taksitler || []).reduce((sum, item) => sum + getItemAmount(item), 0);
};

/**
 * Planın kalan tutarı: açık (iptal edilmemiş) taksitlerin kalanlarının
 * toplamı. Önceden taksitlerin hiç kalanı yoksa "toplam − peşinat" gösteriliyor,
 * tamamen ödenmiş plan yine borçlu görünüyordu.
 */
export const getPlanRemaining = (plan: TaksitPlan) => {
  if (plan.remainingAmount !== undefined && plan.remainingAmount !== null) return toNumber(plan.remainingAmount);
  if (plan.kalanBorc !== undefined && plan.kalanBorc !== null) return toNumber(plan.kalanBorc);
  const items = (plan.taksitler || []).filter((item) => item.status !== "IPTAL");
  if (items.length > 0) return roundMoney(items.reduce((sum, item) => sum + getItemRemaining(item), 0));
  return Math.max(getPlanTotal(plan) - toNumber(plan.pesnat), 0);
};

export const isOpenInstallment = (item: TaksitItem) => item.status !== "IPTAL" && item.status !== "ODENDI" && getItemRemaining(item) > 0.004;

export const healthFlagsOf = (data: Pick<PatientDetailData, "hasAllergy" | "hasHepatitis" | "hasKidney" | "hasDiabetes" | "hasHeart" | "hasBloodIssue" | "hasContagiousDisease">) => ([
  ["Alerji", data.hasAllergy],
  ["Hepatit", data.hasHepatitis],
  ["Böbrek", data.hasKidney],
  ["Diyabet", data.hasDiabetes],
  ["Kalp", data.hasHeart],
  ["Kan sorunu", data.hasBloodIssue],
  ["Bulaşıcı hastalık", data.hasContagiousDisease],
] as [string, boolean][]).filter(([, value]) => value).map(([label]) => label);

export const genderLabel = (gender: string | null | undefined) => {
  const g = String(gender || "").toLocaleUpperCase("tr-TR");
  if (g === "ERKEK" || g === "E") return "Erkek";
  if (g === "KADIN" || g === "K") return "Kadın";
  return "";
};

export function ageFrom(birthDate?: string | null) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export const newIdempotencyKey = (prefix = "hd") =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Sunucu hata gövdesinden kullanıcıya gösterilecek mesaj. */
export function errorMessageOf(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return fallback;
}

/** Türkçe para girişi: "1.250,50" / "1250.5" / "1250" → 1250.5 (geçersizse NaN). */
export function parseMoneyInput(value: string) {
  const trimmed = String(value || "").replace(/\s/g, "").replace(/₺|TL/gi, "");
  if (!trimmed) return NaN;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}
