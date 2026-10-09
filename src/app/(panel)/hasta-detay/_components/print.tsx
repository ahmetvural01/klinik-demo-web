"use client";

// Hasta dosyasından yazdırılan belgeler (tedavi raporu, tahsilat dökümü,
// taksit planı). Hepsi aynı antet ve hasta şeridini kullanır; yalnız
// @media print altında görünen #ks-print-area alanına yazılır.

import { TOOTH_STATUS_LABELS, type ToothStatus } from "@/components/ToothChart";
import { formatDateText } from "@/components/ui/Money";
import {
  ageFrom,
  getItemAmount,
  getItemDueDate,
  getItemPaid,
  getPlanRemaining,
  getPlanTotal,
  money,
  paymentMethodLabel,
  roundMoney,
  TAKSIT_ITEM_STATUS_LABELS,
  toNumber,
  type Exam,
  type Pay,
  type PatientDetailData,
  type TaksitPlan,
} from "./patient-file-shared";

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const date = (value?: string | null) => (value ? formatDateText(value) : "—");

type PrintContext = { data: PatientDetailData; clinicName: string; hidePhone: boolean };

function printHtml(body: string) {
  const el = document.getElementById("ks-print-area");
  if (!el) return;
  el.innerHTML = `<div class="ks-page"><div class="ks-frame">${body}</div></div>`;
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => { el.innerHTML = ""; }, 1000);
  }, 150);
}

function header({ clinicName }: PrintContext, docType: string) {
  return `<div class="header">
    <div><div class="h-title">${escapeHtml(clinicName || "Klinik")}</div><div class="h-sub">Diş Sağlığı Merkezi</div></div>
    <div class="h-right"><div style="font-size:12px;font-weight:700;letter-spacing:1px">${escapeHtml(docType)}</div><div style="font-size:9px;opacity:0.8">${escapeHtml(formatDateText(new Date()))}</div></div>
  </div>`;
}

function patientBar({ data, hidePhone }: PrintContext) {
  const age = ageFrom(data.birthDate);
  return `<div class="patient-bar">
    <span><strong>${escapeHtml(data.fullName)}</strong></span>
    ${data.tcNo && data.tcNo !== "***" ? `<span>T.C.: <strong>${escapeHtml(data.tcNo)}</strong></span>` : ""}
    ${data.birthDate ? `<span>Doğum: <strong>${escapeHtml(date(data.birthDate))}${age !== null ? ` (${age} yaş)` : ""}</strong></span>` : ""}
    ${!hidePhone && data.phone && data.phone !== "***" ? `<span>Tel: <strong>${escapeHtml(data.phone)}</strong></span>` : ""}
    ${data.bloodType ? `<span>Kan: <strong>${escapeHtml(data.bloodType)}</strong></span>` : ""}
  </div>`;
}

const footer = `<div class="footer"><span>Bu belge bilgi amaçlı hazırlanmıştır.</span><div class="sign-area"><div class="sign-line">Hekim İmza / Kaşe</div></div></div>`;

function toothChartHtml(toothChart?: string | null) {
  if (!toothChart) return "";
  let map: Record<string, string> = {};
  try { map = JSON.parse(toothChart) as Record<string, string>; } catch { return ""; }
  const rows = Object.entries(map)
    .filter(([, status]) => status && status !== "saglikli")
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([tooth, status]) => `<tr><td>${escapeHtml(tooth)}</td><td>${escapeHtml(TOOTH_STATUS_LABELS[status as ToothStatus] || status)}</td></tr>`)
    .join("");
  if (!rows) return "";
  return `<div class="sec-title">Diş Şeması</div><table class="tooth-chart"><thead><tr><th>Diş No</th><th>Durum</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function printTreatmentReport(context: PrintContext, treatments: Exam[], showPrices: boolean) {
  const total = roundMoney(treatments.reduce((sum, exam) => sum + toNumber(exam.amount), 0));
  const rate = toNumber(context.data.discountRate);
  const discounted = roundMoney(total * (1 - rate / 100));
  const rows = treatments.map((exam) => `<tr>
      <td>${escapeHtml(date(exam.diagnosedAt))}</td>
      <td>${escapeHtml(exam.treatmentName)}</td>
      <td style="text-align:center">${escapeHtml(exam.toothNo || "—")}</td>
      ${showPrices ? `<td style="text-align:right">${escapeHtml(money(exam.amount))}</td>` : ""}
      <td>${escapeHtml(exam.doctor?.fullName || "—")}</td>
    </tr>`).join("");
  const colSpan = showPrices ? 5 : 4;
  const totals = showPrices
    ? `<tfoot>
        <tr><td colspan="3" style="text-align:right">Toplam:</td><td style="text-align:right">${escapeHtml(money(total))}</td><td></td></tr>
        ${rate > 0 ? `<tr><td colspan="3" style="text-align:right">İndirim (%${escapeHtml(rate)}):</td><td style="text-align:right">-${escapeHtml(money(total - discounted))}</td><td></td></tr>
        <tr><td colspan="3" style="text-align:right">Net tutar:</td><td style="text-align:right">${escapeHtml(money(discounted))}</td><td></td></tr>` : ""}
      </tfoot>`
    : "";
  printHtml(`
    ${header(context, "TEDAVİ RAPORU")}
    ${patientBar(context)}
    <div class="content">
      ${toothChartHtml(context.data.toothChart)}
      <div class="sec-title">Yapılan Tedaviler</div>
      <table><thead><tr><th>Tarih</th><th>Tedavi</th><th style="text-align:center">Diş</th>${showPrices ? `<th style="text-align:right">Tutar</th>` : ""}<th>Hekim</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${colSpan}" style="text-align:center;padding:12px;color:#9ca3af">Kayıt yok</td></tr>`}</tbody>
      ${totals}
      </table>
    </div>
    ${footer}
  `);
}

export function printPaymentStatement(context: PrintContext, payments: Pay[]) {
  const total = roundMoney(payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0));
  const rows = payments.map((payment) => `<tr>
      <td>${escapeHtml(date(payment.createdAt))}</td>
      <td>${escapeHtml(paymentMethodLabel(payment.method))}</td>
      <td>${escapeHtml(payment.description || "—")}</td>
      <td style="text-align:right;font-weight:600">${escapeHtml(money(payment.amount))}</td>
    </tr>`).join("");
  printHtml(`
    ${header(context, "TAHSİLAT DÖKÜMÜ")}
    ${patientBar(context)}
    <div class="content">
      <div class="sec-title">Tahsilatlar</div>
      <table><thead><tr><th>Tarih</th><th>Yöntem</th><th>Açıklama</th><th style="text-align:right">Tutar</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='4' style='text-align:center;padding:12px;color:#9ca3af'>Kayıt yok</td></tr>"}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Toplam tahsilat:</td><td style="text-align:right">${escapeHtml(money(total))}</td></tr></tfoot></table>
    </div>
    ${footer}
  `);
}

export function printInstallmentPlan(context: PrintContext, plan: TaksitPlan) {
  const rows = (plan.taksitler || []).map((item, index) => `<tr>
      <td style="text-align:center">${index + 1}</td>
      <td>${escapeHtml(date(getItemDueDate(item)))}</td>
      <td style="text-align:right">${escapeHtml(money(getItemAmount(item)))}</td>
      <td style="text-align:right">${escapeHtml(money(getItemPaid(item)))}</td>
      <td>${escapeHtml(TAKSIT_ITEM_STATUS_LABELS[item.status] || item.status)}</td>
    </tr>`).join("");
  printHtml(`
    ${header(context, "ÖDEME PLANI")}
    ${patientBar(context)}
    <div class="content">
      <div class="sec-title">Plan Bilgisi</div>
      <div style="display:flex;gap:20px;font-size:10px;margin-bottom:8px;flex-wrap:wrap">
        <span>Toplam: <strong>${escapeHtml(money(getPlanTotal(plan)))}</strong></span>
        <span>Peşinat: <strong>${escapeHtml(money(plan.pesnat || 0))}</strong></span>
        <span>Kalan: <strong>${escapeHtml(money(getPlanRemaining(plan)))}</strong></span>
        <span>Plan tarihi: <strong>${escapeHtml(date(plan.createdAt))}</strong></span>
      </div>
      <div class="sec-title">Taksitler</div>
      <table><thead><tr><th style="text-align:center">#</th><th>Vade</th><th style="text-align:right">Tutar</th><th style="text-align:right">Ödenen</th><th>Durum</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='5' style='text-align:center;padding:12px;color:#9ca3af'>Kayıt yok</td></tr>"}</tbody></table>
    </div>
    ${footer}
  `);
}

/** Yazdırma alanı ve yalnız yazdırırken geçerli stiller. Sayfada bir kez yer alır. */
export function PrintArea() {
  return (
    <>
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
          #ks-print-area .footer { border-top: 1px solid #e2e8f0; padding: 6px 14px; display: flex; justify-content: space-between; align-items: flex-end; background: #f8fafc !important; font-size: 8.5px; color: #94a3b8; }
          #ks-print-area .sign-area { text-align: center; }
          #ks-print-area .sign-line { border-top: 1px solid #94a3b8; margin-top: 22px; padding-top: 3px; font-size: 8px; color: #94a3b8; }
        }
      `}</style>
    </>
  );
}
