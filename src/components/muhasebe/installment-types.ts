// Taksit ekranlarının ortak veri tipleri ve hesapları.
import { todayKey } from "@/components/muhasebe/muhasebe-utils";

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

/** Planın özeti: kalan, ödenen taksit sayısı, en eski açık taksit ve gecikme günü. */
export function planSummary(plan: InstallmentPlan) {
  const items = [...(plan.taksitler || [])].sort((a, b) => a.siraNo - b.siraNo);
  const open = items.filter(isOpenInstallment);
  const kalan = open.reduce((sum, item) => sum + Number(item.kalan || 0), 0);
  const paidCount = items.filter((item) => item.status === "ODENDI").length;
  const activeCount = items.filter((item) => item.status !== "IPTAL").length;
  const next = open[0] || null;
  const overdue = open.filter((item) => item.status === "GECIKTI" || item.vadeDate.slice(0, 10) < todayKey());
  const overdueDays = overdue.length
    ? Math.max(0, Math.floor((Date.now() - new Date(overdue[0].vadeDate).getTime()) / 86_400_000))
    : 0;
  return { kalan: Math.round(kalan * 100) / 100, paidCount, activeCount, next, overdueCount: overdue.length, overdueDays };
}
