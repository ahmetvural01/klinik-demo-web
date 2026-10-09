"use client";

import type { TreatmentOption } from "@/lib/appointment-follow-up";
import {
  countByDisplay,
  displayStatus,
  formatClock,
  durationMinutes,
  parseNoteFull,
  treatmentMetaOf,
  type Appointment,
} from "@/components/randevu/appointment-utils";
import { APPOINTMENT_DISPLAY_STATUS_LABELS, type DisplayAppointmentStatus } from "@/lib/appointment-status";

export type ExportMeta = {
  clinicName: string;
  /** Ör. "Günlük randevu çizelgesi · 9 Ekim 2026 Cuma" */
  title: string;
  doctorName: string;
  /** Dosya adındaki tarih: görüntülenen gün/hafta başı (bugün değil). */
  fileDateKey: string;
  fileKind: "gunluk" | "haftalik";
};

type Row = { date: string; time: string; duration: string; patient: string; doctor: string; treatment: string; status: DisplayAppointmentStatus; note: string };

const STATUS_STYLE: Record<DisplayAppointmentStatus, string> = {
  PLANLANDI: "background:#DBEAFE;color:#1E40AF;",
  BEKLIYOR: "background:#FEF3C7;color:#92400E;",
  TAMAMLANDI: "background:#D1FAE5;color:#065F46;",
  GELMEDI: "background:#FEE2E2;color:#991B1B;",
  IPTAL: "background:#F1F5F9;color:#475569;",
};

const ORDER: DisplayAppointmentStatus[] = ["PLANLANDI", "BEKLIYOR", "TAMAMLANDI", "GELMEDI", "IPTAL"];

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function toRows(appointments: Appointment[], treatments: TreatmentOption[]): Row[] {
  return [...appointments]
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .map((appointment) => {
      const parsed = parseNoteFull(appointment.note, treatments);
      const start = new Date(appointment.startAt);
      return {
        date: start.toLocaleDateString("tr-TR"),
        time: formatClock(start),
        duration: `${durationMinutes(appointment.startAt, appointment.endAt)} dk`,
        patient: appointment.patient?.fullName || "—",
        doctor: appointment.doctor?.fullName || "—",
        treatment: treatmentMetaOf(parsed.treatment, treatments).label,
        status: displayStatus(appointment.status),
        note: parsed.detail.replace(/\n/g, "; "),
      };
    });
}

function summaryLine(appointments: Appointment[]) {
  const counts = countByDisplay(appointments);
  const active = appointments.length - counts.IPTAL;
  return { counts, active };
}

/** Excel (HTML tablo .xls) — Excel'in Türkçe karakterleri doğru açması için BOM'lu. */
export function downloadExcel(appointments: Appointment[], treatments: TreatmentOption[], meta: ExportMeta) {
  const rows = toRows(appointments, treatments);
  const { counts, active } = summaryLine(appointments);
  const now = new Date().toLocaleString("tr-TR");
  const cell = "border:1px solid #CBD5E1;padding:6px 9px;font-size:12px;";
  const body = rows.map((row) => `<tr>
    <td style="${cell}">${esc(row.date)}</td>
    <td style="${cell}font-weight:600;">${esc(row.time)}</td>
    <td style="${cell}">${esc(row.duration)}</td>
    <td style="${cell}font-weight:600;">${esc(row.patient)}</td>
    <td style="${cell}">${esc(row.doctor)}</td>
    <td style="${cell}">${esc(row.treatment)}</td>
    <td style="${cell}${STATUS_STYLE[row.status]}font-weight:600;">${esc(APPOINTMENT_DISPLAY_STATUS_LABELS[row.status])}</td>
    <td style="${cell}color:#475569;">${esc(row.note)}</td>
  </tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>td,th{mso-number-format:"\\@";}</style></head><body>
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;">
<tr><td colspan="8" style="font-size:16px;font-weight:700;padding:10px;">${esc(meta.clinicName || "Randevu çizelgesi")}</td></tr>
<tr><td colspan="8" style="padding:4px 10px;">${esc(meta.title)} · Doktor: ${esc(meta.doctorName)} · Oluşturma: ${esc(now)}</td></tr>
<tr><td colspan="8" style="padding:4px 10px;">Randevu: <b>${active}</b> · ${ORDER.map((status) => `${esc(APPOINTMENT_DISPLAY_STATUS_LABELS[status])}: <b>${counts[status]}</b>`).join(" · ")}</td></tr>
<tr>${["Tarih", "Saat", "Süre", "Hasta", "Doktor", "Tedavi", "Durum", "Not"].map((title) => `<th style="${cell}background:#1E3A5F;color:#fff;text-align:left;">${title}</th>`).join("")}</tr>
${body || `<tr><td colspan="8" style="${cell}text-align:center;color:#64748B;">Kayıt yok</td></tr>`}
</table></body></html>`;
  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `randevu-${meta.fileKind}-${meta.fileDateKey}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function openPrintWindow(title: string, bodyHtml: string, extraCss: string): boolean {
  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) return false;
  printWindow.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#0F172A;font-size:12px}${extraCss}</style></head>
<body>${bodyHtml}<script>window.onload=function(){window.print();}<\/script></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return true;
}

/** Ayrıntılı çizelge (yönetim/arşiv için). */
export function printSchedule(appointments: Appointment[], treatments: TreatmentOption[], meta: ExportMeta): boolean {
  const rows = toRows(appointments, treatments);
  const { counts, active } = summaryLine(appointments);
  const now = new Date().toLocaleString("tr-TR");
  const body = `<div class="page">
  <div class="head"><div><div class="clinic">${esc(meta.clinicName || "Randevu çizelgesi")}</div><div class="sub">${esc(meta.title)}</div></div>
  <div class="meta">Doktor: <b>${esc(meta.doctorName)}</b><br>Oluşturma: ${esc(now)}</div></div>
  <p class="sum">Randevu: <b>${active}</b> · ${ORDER.map((status) => `${esc(APPOINTMENT_DISPLAY_STATUS_LABELS[status])}: <b>${counts[status]}</b>`).join(" · ")}</p>
  <table><thead><tr><th>Tarih</th><th>Saat</th><th>Süre</th><th>Hasta</th><th>Doktor</th><th>Tedavi</th><th>Durum</th><th>Not</th></tr></thead>
  <tbody>${rows.map((row) => `<tr><td>${esc(row.date)}</td><td><b>${esc(row.time)}</b></td><td>${esc(row.duration)}</td><td><b>${esc(row.patient)}</b></td><td>${esc(row.doctor)}</td><td>${esc(row.treatment)}</td><td><span class="badge" style="${STATUS_STYLE[row.status]}">${esc(APPOINTMENT_DISPLAY_STATUS_LABELS[row.status])}</span></td><td class="note">${esc(row.note)}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Kayıt yok</td></tr>`}</tbody></table></div>`;
  return openPrintWindow(meta.title, body, `.page{padding:14mm}.head{display:flex;justify-content:space-between;border-bottom:2px solid #1E3A5F;padding-bottom:10px;margin-bottom:10px}.clinic{font-size:20px;font-weight:800;color:#1E3A5F}.sub{font-size:13px;color:#475569;margin-top:2px}.meta{text-align:right;font-size:11px;color:#475569;line-height:1.6}.sum{margin-bottom:10px;font-size:12px}table{width:100%;border-collapse:collapse}th{background:#1E3A5F;color:#fff;text-align:left;padding:7px 8px;font-size:11px}td{border:1px solid #E2E8F0;padding:6px 8px;vertical-align:top}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700}.note{color:#64748B;font-size:11px}.empty{text-align:center;color:#94A3B8;padding:20px}@media print{.page{padding:8mm}thead{display:table-header-group}tr{page-break-inside:avoid}}`);
}

/** Odalara asılacak sade liste: doktor başına sayfa, saat + hasta + tedavi (iptal/gelmedi hariç). */
export function printRoomList(appointments: Appointment[], treatments: TreatmentOption[], meta: ExportMeta): boolean {
  const rows = toRows(appointments.filter((item) => item.status !== "IPTAL" && item.status !== "GELMEDI"), treatments);
  const byDoctor = new Map<string, Row[]>();
  for (const row of rows) byDoctor.set(row.doctor, [...(byDoctor.get(row.doctor) || []), row]);
  const sections = [...byDoctor.entries()].map(([doctor, list]) => `<section><h1>${esc(doctor)}</h1><p class="date">${esc(meta.clinicName)} · ${esc(meta.title)}</p>
<table>${list.map((row) => `<tr><td class="t">${esc(row.time)}</td><td class="p">${esc(row.patient)}</td><td class="r">${esc(row.treatment)}</td></tr>`).join("")}</table></section>`).join("");
  return openPrintWindow(`Oda listesi · ${meta.title}`, sections || `<section><p>Bu gün için randevu yok.</p></section>`, `section{padding:14mm 12mm;page-break-after:always}section:last-child{page-break-after:auto}h1{font-size:24px;font-weight:800}.date{font-size:13px;color:#475569;margin:2px 0 12px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #CBD5E1;padding:9px 6px;font-size:15px}.t{font-weight:700;width:70px}.p{font-weight:600}.r{text-align:right;color:#475569}`);
}
