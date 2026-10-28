"use client";

// Hasta dosyasından yazdırılan belgeler (tedavi raporu, tedavi teklifi,
// tahsilat dökümü, taksit planı). Hepsi aynı antet ve hasta şeridini kullanır;
// yalnız @media print altında görünen #ks-print-area alanına yazılır.

import { TOOTH_STATUS_LABELS, type ToothStatus } from "@/components/ToothChart";
import { formatDateText } from "@/components/ui/Money";
import { formatPhoneNumber } from "@/lib/format";
import { escapeHtml, letterheadFooterHtml, letterheadHtml, printDocument } from "@/lib/print-letterhead";
import type { ClinicLetterhead } from "./clinic-letterhead";
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

export { escapeHtml };

const date = (value?: string | null) => (value ? formatDateText(value) : "—");

export type PrintContext = { data: PatientDetailData; clinic: ClinicLetterhead; hidePhone: boolean };

// Belgenin gövde stili (antet ve altbilgi ortak: src/lib/print-letterhead.ts).
const DOC_CSS = `
  .ks-doc { display: flex; flex-direction: column; min-height: 268mm; }
  .patient-bar { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 5px 10px; display: flex; gap: 18px; flex-wrap: wrap; font-size: 9.5px; color: #475569; }
  .patient-bar strong { color: #1e293b; }
  .content { padding: 8px 0; flex: 1; }
  .sec-title { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a5f; border-bottom: 1px solid #1e3a5f; padding-bottom: 3px; margin: 10px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead tr { background: #1e3a5f; color: #fff; }
  th { padding: 5px 8px; text-align: left; font-weight: 600; font-size: 9px; letter-spacing: 0.3px; }
  td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tfoot td { background: #f1f5f9; font-weight: 700; border-top: 1.5px solid #cbd5e1; font-size: 10px; }
  .tooth-chart { margin: 4px 0 8px; }
  .sign-row { display: flex; justify-content: flex-end; margin-top: 18px; }
  .sign-line { min-width: 160px; border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 8.5px; color: #64748b; text-align: center; }
`;

function printHtml(title: string, body: string) {
  printDocument(title, `<div class="ks-doc">${body}</div>`, DOC_CSS);
}

function header({ clinic }: PrintContext, docType: string) {
  return letterheadHtml(clinic, { title: docType, date: formatDateText(new Date()) });
}

function patientBar({ data, hidePhone }: PrintContext) {
  const age = ageFrom(data.birthDate);
  return `<div class="patient-bar">
    <span><strong>${escapeHtml(data.fullName)}</strong></span>
    ${data.tcNo && data.tcNo !== "***" ? `<span>T.C.: <strong>${escapeHtml(data.tcNo)}</strong></span>` : ""}
    ${data.birthDate ? `<span>Doğum: <strong>${escapeHtml(date(data.birthDate))}${age !== null ? ` (${age} yaş)` : ""}</strong></span>` : ""}
    ${!hidePhone && data.phone && data.phone !== "***" ? `<span>Tel: <strong>${escapeHtml(data.phoneCountryCode && data.phoneCountryCode !== "+90" ? `${data.phoneCountryCode} ${data.phone}` : formatPhoneNumber(data.phone))}</strong></span>` : ""}
    ${data.bloodType ? `<span>Kan: <strong>${escapeHtml(data.bloodType)}</strong></span>` : ""}
  </div>`;
}

const footerWith = ({ clinic }: PrintContext, note: string) => `<div class="sign-row"><div class="sign-line">Hekim İmza / Kaşe</div></div>${letterheadFooterHtml(clinic, note)}`;
const footer = (context: PrintContext) => footerWith(context, "Bu belge bilgi amaçlı hazırlanmıştır.");

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
  printHtml(`Tedavi raporu — ${context.data.fullName}`, `
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
    ${footer(context)}
  `);
}

/**
 * Tedavi teklifi: planlanan (henüz yapılmamış) tedavilerin fiyat teklifi.
 * Hastaya verilir; borca yansımaz. Hastanın indirimi varsa indirim ve net
 * tutar da yazılır (tedavi raporu ve Hesap sekmesindeki oranla aynı).
 */
export function printTreatmentQuote(context: PrintContext, treatments: Exam[]) {
  const total = roundMoney(treatments.reduce((sum, exam) => sum + toNumber(exam.amount), 0));
  const rate = toNumber(context.data.discountRate);
  const discounted = roundMoney(total * (1 - rate / 100));
  const rows = treatments.map((exam, index) => `<tr>
      <td style="text-align:center">${index + 1}</td>
      <td>${escapeHtml(exam.treatmentName)}</td>
      <td style="text-align:center">${escapeHtml(exam.toothNo || "—")}</td>
      <td>${escapeHtml(exam.doctor?.fullName || "—")}</td>
      <td style="text-align:right">${escapeHtml(money(exam.amount))}</td>
    </tr>`).join("");
  printHtml(`Tedavi teklifi — ${context.data.fullName}`, `
    ${header(context, "TEDAVİ TEKLİFİ")}
    ${patientBar(context)}
    <div class="content">
      <div class="sec-title">Teklif edilen tedaviler</div>
      <table><thead><tr><th style="text-align:center">#</th><th>Tedavi</th><th style="text-align:center">Diş</th><th>Hekim</th><th style="text-align:right">Tutar</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;padding:12px;color:#9ca3af">Kayıt yok</td></tr>`}</tbody>
      <tfoot>
        <tr><td colspan="4" style="text-align:right">Toplam:</td><td style="text-align:right">${escapeHtml(money(total))}</td></tr>
        ${rate > 0 ? `<tr><td colspan="4" style="text-align:right">İndirim (%${escapeHtml(rate)}):</td><td style="text-align:right">-${escapeHtml(money(total - discounted))}</td></tr>
        <tr><td colspan="4" style="text-align:right">Net tutar:</td><td style="text-align:right">${escapeHtml(money(discounted))}</td></tr>` : ""}
      </tfoot>
      </table>
    </div>
    ${footerWith(context, "Bu belge fiyat teklifidir; fatura ya da borç belgesi değildir.")}
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
  printHtml(`Tahsilat dökümü — ${context.data.fullName}`, `
    ${header(context, "TAHSİLAT DÖKÜMÜ")}
    ${patientBar(context)}
    <div class="content">
      <div class="sec-title">Tahsilatlar</div>
      <table><thead><tr><th>Tarih</th><th>Yöntem</th><th>Açıklama</th><th style="text-align:right">Tutar</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='4' style='text-align:center;padding:12px;color:#9ca3af'>Kayıt yok</td></tr>"}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Toplam tahsilat:</td><td style="text-align:right">${escapeHtml(money(total))}</td></tr></tfoot></table>
    </div>
    ${footer(context)}
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
  printHtml(`Ödeme planı — ${context.data.fullName}`, `
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
    ${footer(context)}
  `);
}
