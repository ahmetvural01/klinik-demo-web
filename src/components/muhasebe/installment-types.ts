// Taksit ekranlarının ortak veri tipleri ve hesapları.
import type { BadgeTone } from "@/components/ui/Badge";
import { addDaysToKey } from "@/lib/date-presets";
import { turkeyDateKey } from "@/lib/tz";
import { todayKey } from "@/components/muhasebe/muhasebe-utils";

/** Taksit listesinin plan durumu süzgeci (adres çubuğunda `durum`). */
export type InstallmentStatusFilter = "ACIK" | "GECIKTI" | "TAMAMLANDI" | "IPTAL" | "HEPSI";
export const INSTALLMENT_STATUS_FILTERS: readonly InstallmentStatusFilter[] = ["ACIK", "GECIKTI", "TAMAMLANDI", "IPTAL", "HEPSI"];
export const isInstallmentStatusFilter = (value: string | null | undefined): value is InstallmentStatusFilter =>
  Boolean(value) && (INSTALLMENT_STATUS_FILTERS as readonly string[]).includes(value as string);

/** Liste yanıtındaki özet (sunucu, seçili plan durumuna göre hesaplar). */
export type InstallmentStats = {
  toplamKalan: number;
  gecikenTaksit: number;
  gecikenTutar: number;
  haftaTaksit: number;
  haftaTutar: number;
  /** Gecikmiş taksidi olan plan sayısı. */
  geciken?: number;
  /** Vadesi bugün olan taksit sayısı. */
  bugunVade?: number;
  /** [bugün, 1–30 gün, 31–60 gün, 60+ gün, ileri tarih] */
  aging5?: { amount: number; count: number }[];
};

export type InstallmentPayment = { id: string; tarih: string; tutar: number | string; yontem: string };
export type Installment = {
  id: string;
  siraNo: number;
  vadeDate: string;
  tutar: number | string;
  odenen: number | string;
  kalan: number | string;
  status: string;
  odemeler?: InstallmentPayment[];
};
export type InstallmentPlan = {
  id: string;
  baslik?: string | null;
  toplamBorc: number | string;
  pesnat: number | string;
  taksitSayisi: number;
  period: string;
  startDate: string;
  notes?: string | null;
  status: string;
  createdAt: string;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor: { id: string; fullName: string };
  taksitler: Installment[];
  reminders?: { id: string; note: string; reminderDate: string; status: string }[];
};

export const isOpenInstallment = (item: Installment) => item.status === "BEKLIYOR" || item.status === "GECIKTI";
export const isOpenPlan = (plan: InstallmentPlan) => plan.status === "AKTIF" || plan.status === "DEVAM_EDIYOR";

/** Vade gününün Türkiye takvimindeki karşılığı (sunucu da gecikmeyi Türkiye gece yarısına göre sayar). */
export const dueDayKey = (vadeDate: string) => turkeyDateKey(new Date(vadeDate));

/** İki takvim günü arasındaki gün farkı (saat dilimi kaymaz). */
const daysBetween = (fromKey: string, toKey: string) =>
  Math.round((Date.parse(`${toKey}T12:00:00.000Z`) - Date.parse(`${fromKey}T12:00:00.000Z`)) / 86_400_000);

/** Planın özeti: kalan, ödenen taksit sayısı, en eski açık taksit ve gecikme günü. */
export function planSummary(plan: InstallmentPlan) {
  const items = [...(plan.taksitler || [])].sort((a, b) => a.siraNo - b.siraNo);
  const open = items.filter(isOpenInstallment);
  const kalan = open.reduce((sum, item) => sum + Number(item.kalan || 0), 0);
  const paidCount = items.filter((item) => item.status === "ODENDI").length;
  const activeCount = items.filter((item) => item.status !== "IPTAL").length;
  const next = open[0] || null;
  const today = todayKey();
  const overdue = open.filter((item) => item.status === "GECIKTI" || dueDayKey(item.vadeDate) < today);
  // Gün farkı Türkiye takvim günleriyle: önceden Date.now() farkı gece 00:00–03:00 arasında bir gün eksik sayıyordu.
  const overdueDays = overdue.length ? Math.max(0, daysBetween(dueDayKey(overdue[0].vadeDate), today)) : 0;
  return { kalan: Math.round(kalan * 100) / 100, paidCount, activeCount, next, overdueCount: overdue.length, overdueDays };
}

/**
 * Planın tek rozetle durumu — karar verdiren bilgi: gecikti (kaç gün), vadesi
 * bugün, yaklaşıyor (7 gün içinde), zamanında, tamamlandı, iptal. Önceden
 * rozet "Ödeme bekliyor / Ödeniyor" yazıyor, gecikme ayrı sütunda kırmızı
 * metin ve satır rengiyle üç kez anlatılıyordu.
 */
export function planState(plan: InstallmentPlan, summary = planSummary(plan)): { label: string; tone: BadgeTone } {
  if (plan.status === "IPTAL") return { label: "İptal edildi", tone: "neutral" };
  if (!isOpenPlan(plan) || !summary.next) return { label: "Tamamlandı", tone: "success" };
  if (summary.overdueCount > 0) {
    return { label: summary.overdueDays > 0 ? `${summary.overdueDays} gün gecikti` : "Gecikti", tone: "critical" };
  }
  const due = dueDayKey(summary.next.vadeDate);
  const today = todayKey();
  if (due === today) return { label: "Vadesi bugün", tone: "warning" };
  if (due <= addDaysToKey(today, 6)) return { label: "Yaklaşıyor", tone: "info" };
  return { label: "Zamanında", tone: "neutral" };
}
