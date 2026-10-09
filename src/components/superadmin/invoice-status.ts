/**
 * Platform faturalarının durumu ve toplamları için TEK kaynak.
 *
 * Önceden aynı faturalar üç ekranda üç ayrı mantıkla sayılıyordu: Faturalar
 * sayfası vadesi geçmiş "PENDING" kaydı canlı olarak "Gecikti" sayıyor,
 * Kontrol Paneli ve klinik detayı ham veritabanı durumunu kullanıyordu; iptal
 * edilmiş faturalar "ödenmemiş" toplamına ekleniyordu. Panel, Faturalar ve
 * klinik detayı API'leri artık yalnız bu fonksiyonları kullanır.
 *
 * Ödeme kilidi (requireAuth + billing.ts syncInstitutionPaymentGate) bu
 * dosyadan beslenmez ve DEĞİŞTİRİLMEDİ; burada yalnız gösterim ve özetler var.
 */

export type InvoiceDbStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
export type InvoiceViewStatus = "PENDING" | "OVERDUE" | "PAID" | "CANCELLED";

type InvoiceLike = {
  status: string;
  amount: number | string | { toString(): string };
  dueDate?: Date | string | null;
  paidAt?: Date | string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAmount(value: InvoiceLike["amount"]): number {
  const n = Number(typeof value === "object" && value !== null ? value.toString() : value);
  return Number.isFinite(n) ? n : 0;
}

/** Vadesi geçmiş ama veritabanında hâlâ "PENDING" duran fatura "OVERDUE" sayılır. */
export function deriveInvoiceStatus(invoice: Pick<InvoiceLike, "status" | "dueDate">, now: Date = new Date()): InvoiceViewStatus {
  const status = invoice.status as InvoiceDbStatus;
  if (status === "PENDING") {
    const due = toDate(invoice.dueDate);
    if (due && due < now) return "OVERDUE";
    return "PENDING";
  }
  if (status === "OVERDUE" || status === "PAID" || status === "CANCELLED") return status;
  return "PENDING";
}

export type InvoiceSummary = {
  /** Ödenmemiş ve iptal edilmemiş faturalar (vadesi gelmemiş + gecikmiş). */
  openCount: number;
  openAmount: number;
  overdueCount: number;
  overdueAmount: number;
  /** Vadesi henüz gelmemiş açık faturalar. */
  upcomingCount: number;
  upcomingAmount: number;
  paidCount: number;
  paidAmount: number;
  /** Türkiye takvimine göre bu ay tahsil edilen. */
  paidThisMonthCount: number;
  paidThisMonthAmount: number;
  cancelledCount: number;
  /** En erken vadeli açık faturanın vadesi. */
  nextDueDate: string | null;
};

function turkeyMonthKey(date: Date): string {
  const t = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function summarizeInvoices(invoices: readonly InvoiceLike[], now: Date = new Date()): InvoiceSummary {
  const summary: InvoiceSummary = {
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    upcomingCount: 0,
    upcomingAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    paidThisMonthCount: 0,
    paidThisMonthAmount: 0,
    cancelledCount: 0,
    nextDueDate: null,
  };
  const thisMonth = turkeyMonthKey(now);
  let nextDue: Date | null = null;

  for (const invoice of invoices) {
    const amount = toAmount(invoice.amount);
    const status = deriveInvoiceStatus(invoice, now);
    if (status === "CANCELLED") {
      summary.cancelledCount += 1;
      continue;
    }
    if (status === "PAID") {
      summary.paidCount += 1;
      summary.paidAmount += amount;
      const paidAt = toDate(invoice.paidAt);
      if (paidAt && turkeyMonthKey(paidAt) === thisMonth) {
        summary.paidThisMonthCount += 1;
        summary.paidThisMonthAmount += amount;
      }
      continue;
    }
    summary.openCount += 1;
    summary.openAmount += amount;
    if (status === "OVERDUE") {
      summary.overdueCount += 1;
      summary.overdueAmount += amount;
    } else {
      summary.upcomingCount += 1;
      summary.upcomingAmount += amount;
    }
    const due = toDate(invoice.dueDate);
    if (due && (!nextDue || due < nextDue)) nextDue = due;
  }

  summary.nextDueDate = nextDue ? nextDue.toISOString() : null;
  return summary;
}

export const EMPTY_INVOICE_SUMMARY: InvoiceSummary = summarizeInvoices([]);
