"use client";

import { formatCurrency } from "@/lib/format";
import { formatDateText } from "@/components/ui/Money";
import { escapeHtml, letterheadFooterHtml, letterheadHtml, loadPrintClinic, printDocument } from "@/lib/print-letterhead";
import { showToastSafe } from "@/lib/toast-client";

type Receipt = {
  receiptNo: string;
  amount: number;
  method: string;
  posName: string | null;
  description: string | null;
  date: string;
  patientName: string | null;
  doctorName: string | null;
  remaining: number | null;
};

const RECEIPT_CSS = `
  .rc { max-width: 150mm; margin: 0 auto; }
  .rc-amount { margin: 14px 0 10px; padding: 12px 14px; border: 1.5px solid #1e3a5f; border-radius: 6px; display: flex; justify-content: space-between; align-items: baseline; }
  .rc-amount span { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
  .rc-amount strong { font-size: 20px; color: #0f172a; }
  .rc-rows { width: 100%; border-collapse: collapse; font-size: 11px; }
  .rc-rows td { padding: 5px 0; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .rc-rows td:first-child { width: 38%; color: #64748b; }
  .rc-rows td:last-child { color: #0f172a; font-weight: 600; }
  .rc-signs { display: flex; justify-content: space-between; gap: 24px; margin-top: 34px; }
  .rc-sign { flex: 1; border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 9px; color: #64748b; text-align: center; }
`;

/**
 * Tahsilat makbuzu yazdırır (hastaya verilen ödeme belgesi; resmî fatura
 * değildir). Tahsilattan hemen sonra bildirimdeki "Makbuz yazdır" ile ya da
 * hasta dosyası › Hesap'taki tahsilat satırından açılır.
 */
export async function printPaymentReceipt(paymentId: string) {
  const [clinic, response] = await Promise.all([
    loadPrintClinic(),
    fetch(`/api/payments/${encodeURIComponent(paymentId)}/receipt`, { cache: "no-store" }).catch(() => null),
  ]);
  const data = (await response?.json().catch(() => null)) as (Receipt & { message?: string }) | null;
  if (!response?.ok || !data) {
    showToastSafe({ type: "error", message: data?.message || "Makbuz hazırlanamadı. Bağlantıyı kontrol edip tekrar deneyin." });
    return;
  }
  const method = data.posName ? `${data.method} · ${data.posName}` : data.method;
  const rows: [string, string][] = [
    ["Hasta", data.patientName || "—"],
    ["Tarih", formatDateText(data.date, "datetime")],
    ["Ödeme yöntemi", method],
    ...(data.description ? [["Açıklama", data.description] as [string, string]] : []),
    ...(data.doctorName ? [["Hekim", data.doctorName] as [string, string]] : []),
    // Kalan borç; hasta yapılan tedaviden fazla ödediyse (ör. tedaviden önce) ön ödeme.
    ...(data.remaining !== null
      ? [data.remaining < -0.004
        ? ["Ön ödeme", `${formatCurrency(Math.abs(data.remaining))} (sonraki tedavilerden düşülür)`] as [string, string]
        : ["Kalan borç", data.remaining > 0.004 ? formatCurrency(data.remaining) : "Yok"] as [string, string]]
      : []),
  ];
  const body = `<div class="rc">
    ${letterheadHtml(clinic, { title: "Tahsilat makbuzu", date: formatDateText(new Date()), meta: [`Makbuz no: ${data.receiptNo}`] })}
    <div class="rc-amount"><span>Alınan tutar</span><strong>${escapeHtml(formatCurrency(data.amount))}</strong></div>
    <table class="rc-rows"><tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>
    <div class="rc-signs"><div class="rc-sign">Tahsil eden</div><div class="rc-sign">Ödeyen</div></div>
    ${letterheadFooterHtml(clinic, "Bu makbuz ödeme belgesidir; fatura yerine geçmez.")}
  </div>`;
  printDocument(`Tahsilat makbuzu ${data.receiptNo}`, body, RECEIPT_CSS);
}
