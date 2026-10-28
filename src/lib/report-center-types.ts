// Raporlar ekranının (/rapor) API yanıt biçimleri ve sabitleri. Sunucu
// (src/lib/report-center.ts) ile sayfa aynı türleri kullanır; bu dosya
// veritabanına dokunmaz, istemciye de güvenle alınır. Yanıtta yalnız ekranda
// (ve aynısını veren dışa aktarmada) kullanılan alanlar vardır.

export const REPORT_TYPES = ["ozet", "hastalar", "tedaviler", "giderler"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Hastalar raporunun hızlı süzgeçleri ("tumu" varsayılan, adrese yazılmaz). */
export const REPORT_PATIENT_FILTERS = ["tumu", "yeni", "borclu"] as const;
export type ReportPatientFilter = (typeof REPORT_PATIENT_FILTERS)[number];

/** Satır listeleri (Hastalar, Tedaviler) en çok bu kadar satır döner; toplamlar yine tüm kayıtlardandır. */
export const REPORT_ROW_LIMIT = 1000;

export function isReportType(value: string | null | undefined): value is ReportType {
  return Boolean(value) && (REPORT_TYPES as readonly string[]).includes(value as string);
}

export function isReportPatientFilter(value: string | null | undefined): value is ReportPatientFilter {
  return Boolean(value) && (REPORT_PATIENT_FILTERS as readonly string[]).includes(value as string);
}

/**
 * Doktor seçicisindeki kişi: şubede şu an hekim sayılanlar ve dönemde kaydı
 * (tedavi, ziyaret ya da tahsilat) olanlar. `left`: artık şubede çalışmıyor
 * (pasif ya da şubeden çıkarılmış); ekranda adın yanında "(ayrıldı)" yazar.
 */
export type ReportDoctor = { id: string; fullName: string; left: boolean };

type ReportBase = {
  doctors: ReportDoctor[];
  /** Uygulanan doktor süzgeci; istenen kişi bu kurumda yoksa null (süzgeç yok sayıldı). */
  doctorId: string | null;
};

export type SummaryDoctorRow = {
  /** null: doktor seçilmeden alınmış tahsilat. */
  doctorId: string | null;
  fullName: string;
  patients: number;
  treatments: number;
  treatmentTotal: number;
  collected: number;
};

export type SummaryReport = ReportBase & {
  type: "ozet";
  /** Dönemde Geldi/Tamamlandı randevusu ya da ücrete yansıyan tedavisi olan hasta sayısı. */
  visitedPatients: number;
  treatmentCount: number;
  /** Ücrete yansıyan tedavilerin kayıtlı ücreti. */
  treatmentTotal: number;
  /** Dönemin hasta tahsilatı (Muhasebe ile aynı kaynak). */
  collected: number;
  /** Doktor seçili değilken doktor başına özet; seçiliyken boş. */
  byDoctor: SummaryDoctorRow[];
  topTreatments: Array<{ name: string; count: number }>;
};

export type PatientReportRow = {
  id: string;
  fullName: string;
  /** Kaydı bu dönemde açıldı. */
  isNew: boolean;
  doctorIds: string[];
  treatmentTotal: number;
  collected: number;
  /** Bugünkü bakiye: artı borç, eksi fazla ödeme (ekranda yalnız borç gösterilir). */
  balance: number;
};

export type PatientsReport = ReportBase & {
  type: "hastalar";
  filter: ReportPatientFilter;
  /** Süzgeçlerin sayıları (seçili süzgeçten bağımsız). */
  counts: { all: number; new: number; debtors: number };
  /** Seçili süzgeçteki bütün hastaların toplamı (dışa aktarmanın toplam satırı). */
  totals: { treatmentTotal: number; collected: number; debt: number };
  rows: PatientReportRow[];
  truncated: boolean;
  limit: number;
};

export type TreatmentReportRow = {
  id: string;
  /** Tedavi tarihi (ISO). */
  date: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  treatmentName: string;
  tooth: string;
  amount: number;
};

export type TreatmentsReport = ReportBase & {
  type: "tedaviler";
  /** Bütün tedavilerin toplamı (dışa aktarmanın toplam satırı). */
  totals: { count: number; amount: number };
  rows: TreatmentReportRow[];
  truncated: boolean;
  limit: number;
};

export type ExpensesReport = ReportBase & {
  type: "giderler";
  expenseTotal: number;
  expenseByCategory: Array<{ name: string; amount: number }>;
  /** Tedarikçi alımları (laboratuvar dahil). */
  purchaseTotal: number;
  purchasesBySupplier: Array<{ name: string; amount: number }>;
};

export type ReportResponse = SummaryReport | PatientsReport | TreatmentsReport | ExpensesReport;
