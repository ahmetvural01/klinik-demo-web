import { maskPatientName } from "@/lib/audit-mask";

const PRIORITY_LABELS: Record<number, string> = { 1: "Düşük", 2: "Orta", 3: "Yüksek" };
const STATUS_LABELS: Record<string, string> = { ACIK: "Açık", BEKLEMEDE: "Beklemede", TAMAMLANDI: "Tamamlandı", IPTAL: "İptal edildi" };

type AuditTask = {
  title: string;
  priority: number;
  status: string;
  patient?: { fullName: string } | null;
};

/**
 * Ekip görevi işlem kaydı metni: okunur Türkçe etiketler ("oncelik:2,
 * durum:ACIK" yerine "öncelik Orta · Açık"); bağlı hasta adı KVKK gereği
 * maskelenir (süperadmin denetim ekranı tüm klinikleri tek yerde gösterir).
 */
export function clinicTaskAuditDetail(task: AuditTask) {
  return [
    `"${task.title}"`,
    `öncelik ${PRIORITY_LABELS[task.priority] || task.priority}`,
    STATUS_LABELS[task.status] || task.status,
    task.patient?.fullName ? `hasta ${maskPatientName(task.patient.fullName)}` : "",
  ].filter(Boolean).join(" · ");
}
