// Hasta dosyası ekranının (hasta-detay) sekmeleri arasında paylaşılan tipler,
// etiket haritaları ve hesap yardımcıları. Önceden hepsi tek bir 5.800 satırlık
// bileşenin içindeydi; aynı etiket (ör. ödeme yöntemi) üç ayrı yerde, üç ayrı
// biçimde yazılıyordu.

import { formatCurrency } from "@/lib/format";
import { getDisplayAppointmentStatus, APPOINTMENT_DISPLAY_STATUS_LABELS, APPOINTMENT_DISPLAY_STATUS_TONE } from "@/lib/appointment-status";
import { examStatusKind, isChargeableExamStatus } from "@/lib/examination-status";
import { patientAge } from "@/lib/patient-display";
import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Sekmeler. "notlar" ve "gorevler" ayrı sekme değil: notlar ve hastaya bağlı
 * görevler Özet'te tek yerde tutulur (bir hastanın açık görevi genelde 0-3
 * tanedir; ayrı sekme telefonda diğer sekmeleri ekran dışına itiyordu). Eski
 * `?tab=notlar` / `?tab=gorevler` bağlantıları Özet'e açılır. Sıra kullanım
 * sıklığına göredir: hekimin işi (Tedavi) ve bankonun işi (Hesap) önde.
 */
export type TabKey = "bilgi" | "tedavi" | "odeme" | "randevular" | "lab" | "recete" | "belgeler";

export const TAB_ORDER: TabKey[] = ["bilgi", "tedavi", "odeme", "randevular", "recete", "lab", "belgeler"];

export const TAB_LABELS: Record<TabKey, string> = {
  bilgi: "Özet",
  tedavi: "Tedavi",
  // Sekme yalnız tahsilat değil: borç özeti, tahsilatlar ve taksit planları.
  // "Tahsilat (2)" sayacı "2 tahsilat" gibi okunuyordu.
  odeme: "Hesap",
  randevular: "Randevular",
  lab: "Laboratuvar",
  recete: "Reçete",
  belgeler: "Belgeler",
};

export const TAB_PERMISSIONS: Record<TabKey, string[]> = {
  bilgi: ["patients:read"],
  randevular: ["appointments:read"],
  tedavi: ["examinations:read", "treatment:read"],
  odeme: ["payments:read", "installments:read", "finance:read"],
  recete: ["prescriptions:read"],
  lab: ["lab:read"],
  // Röntgen/fotoğraf okuma yetkisi (xray:read) olan da sekmeyi açabilmeli;
  // belge türleri sekme içinde ayrıca yetkiye göre süzülür (sunucu da süzer).
  belgeler: ["documents:read", "xray:read"],
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
  /** Plan hekimi: tahsilat taksitlere yalnız bu hekim adına alınırsa işlenir. */
  doctor?: { id?: string; fullName: string } | null;
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
  completedAt?: string | null;
  patient?: { id: string; fullName: string } | null;
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

// Ödeme yöntemi adları uygulama genelindeki tek sözlükten (Muhasebe ile aynı).
export { PAYMENT_METHOD_LABELS, paymentMethodLabel } from "@/lib/payment-methods";

// Görev türü/durum adları burada ayrıca tutulmaz: hasta dosyası Görevler
// sayfasıyla aynı haritayı kullanır (components/takip/TaskFormModal). Önceden
// aynı durum burada "Açık", Görevler'de "Yapılacak" yazıyordu.

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

/**
 * İstemcide bakiye hesabı — YALNIZ YEDEK: hasta dosyası bakiyeyi sunucudan
 * (/api/patients/[id]/balance, Decimal ile) alır; bu hesap yalnız o yanıt
 * gelmezse kullanılır (kayan nokta yuvarlaması yarım kuruşta 1 kuruş farklı
 * çıkabilir).
 */
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

// Cinsiyet ve yaş Hastalar listesi, hasta seçici ve hasta formuyla aynı
// yardımcıdan (lib/patient-display): önceki kopya "DIGER"i boş yazıyor, yaşı
// tarayıcının saat dilimine göre hesaplıyordu (Türkiye gece yarısı saklanan
// doğum gününde bir gün kayabiliyordu).
export { genderLabel } from "@/lib/patient-display";

export function ageFrom(birthDate?: string | null) {
  return patientAge(birthDate);
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

// Tutar girişi burada ayrıştırılmaz: bütün tutar alanları ui/MoneyInput +
// lib/money-input kullanır. Önceki yerel ayrıştırıcı virgülsüz "1.000"ü
// Number("1.000") ile 1 TL'ye çeviriyordu (canlı testte ₺1.000 tahsilat ₺1,00
// olarak kaydedildi, tedavi tutarı "1.250" ₺1,25 göründü).

/**
 * Normalize tutar ("1250.50") × adet → normalize tutar; kuruş hassasiyetinde,
 * kayan nokta hesabı olmadan (çok dişli tedavi kaydının toplamı).
 */
export function multiplyMoney(normalized: string, count: number): string {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(normalized);
  if (!match || !Number.isInteger(count) || count < 0) return "0.00";
  const cents = BigInt(`${match[2]}${match[3]}`) * BigInt(count);
  const digits = cents.toString().padStart(3, "0");
  return `${match[1] && cents > BigInt(0) ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
