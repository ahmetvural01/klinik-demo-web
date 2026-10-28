"use client";

import { formatDateText } from "@/components/ui/Money";
import type {
  ExpensesReport,
  PatientReportRow,
  PatientsReport,
  SummaryReport,
  TreatmentReportRow,
  TreatmentsReport,
} from "@/lib/report-center-types";
import { PATIENT_FILTER_LABELS, count, csvAmount, doctorNames, money, patientDebt, treatmentText } from "./report-ui";

// Dışa aktarma ekrandakinin aynısıdır: aynı dönem, doktor, süzgeç ve sıra.
// Her rapor bölümlere (başlık + tablo) çevrilir; PDF bölümleri tablo olarak,
// Excel (CSV) tek tabloyu sütunlarıyla, çok bölümlü raporu "Bölüm; Kalem; Değer"
// satırları olarak yazar. Tutar ve adet hücresi biçime göre yazılır.

type Cell = string | { money: number } | { count: number };
type ExportSection = { title: string; headers: string[]; rows: Cell[][] };

export type ExportDocument = {
  fileName: string;
  /** PDF başlığı. */
  title: string;
  /** PDF başlık altı: dönem · doktor · süzgeç. */
  meta: string;
  orientation: "p" | "l";
  sections: ExportSection[];
};

export type ExportContext = {
  rangeLabel: string;
  /** Dosya adındaki dönem ("2026-10-01-2026-10-28"). */
  fileRange: string;
  /** Seçili doktorun adı; seçili değilse boş. */
  doctorName: string;
  doctorNameById: Map<string, string>;
};

const csvCell = (cell: Cell) => (typeof cell === "string" ? cell : "money" in cell ? csvAmount(cell.money) : String(cell.count));
const pdfCell = (cell: Cell) => (typeof cell === "string" ? cell : "money" in cell ? money(cell.money) : count(cell.count));
const moneyOrEmpty = (value: number): Cell => (Math.abs(value) >= 0.005 ? { money: value } : "");
const metaLine = (...parts: string[]) => parts.filter(Boolean).join(" · ");
const truncatedNote = (truncated: boolean, limit: number) => (truncated ? `İlk ${count(limit)} kayıt` : "");

export function summaryDocument(data: SummaryReport, context: ExportContext, includeDoctors: boolean): ExportDocument {
  const sections: ExportSection[] = [{
    title: "Özet",
    headers: ["Kalem", "Değer"],
    rows: [
      ["Dönem", context.rangeLabel],
      ...(context.doctorName ? [["Doktor", context.doctorName] as Cell[]] : []),
      ["Gelen hasta", { count: data.visitedPatients }],
      ["Yapılan tedavi", { count: data.treatmentCount }],
      ["Tedavi tutarı", { money: data.treatmentTotal }],
      ["Tahsilat", { money: data.collected }],
    ],
  }];
  if (includeDoctors && data.byDoctor.length > 0) {
    sections.push({
      title: "Doktorlar",
      headers: ["Doktor", "Hasta", "Tedavi", "Tedavi tutarı", "Tahsilat"],
      rows: data.byDoctor.map((row) => [
        (row.doctorId && context.doctorNameById.get(row.doctorId)) || row.fullName,
        row.patients > 0 ? { count: row.patients } : "",
        row.treatments > 0 ? { count: row.treatments } : "",
        moneyOrEmpty(row.treatmentTotal),
        moneyOrEmpty(row.collected),
      ]),
    });
  }
  if (data.topTreatments.length > 0) {
    sections.push({ title: "En çok yapılan tedaviler", headers: ["Tedavi", "Adet"], rows: data.topTreatments.map((row) => [row.name, { count: row.count }]) });
  }
  return {
    fileName: `rapor-ozet-${context.fileRange}`,
    title: "Rapor: Özet",
    meta: metaLine(context.rangeLabel, context.doctorName),
    orientation: "p",
    sections,
  };
}

export function patientsDocument(data: PatientsReport, rows: PatientReportRow[], context: ExportContext): ExportDocument {
  const patientCount = data.filter === "yeni" ? data.counts.new : data.filter === "borclu" ? data.counts.debtors : data.counts.all;
  return {
    fileName: `rapor-hastalar-${context.fileRange}`,
    title: "Rapor: Hastalar",
    meta: metaLine(context.rangeLabel, context.doctorName, data.filter === "tumu" ? "" : PATIENT_FILTER_LABELS[data.filter], truncatedNote(data.truncated, data.limit)),
    orientation: "p",
    sections: [{
      title: data.filter === "tumu" ? "Gelen hastalar" : PATIENT_FILTER_LABELS[data.filter],
      headers: ["Hasta", "Doktor", "Tedavi tutarı", "Tahsilat", "Kalan borç"],
      rows: [
        ...rows.map((row): Cell[] => [
          row.isNew ? `${row.fullName} (yeni)` : row.fullName,
          doctorNames(row.doctorIds, context.doctorNameById).join(", "),
          moneyOrEmpty(row.treatmentTotal),
          moneyOrEmpty(row.collected),
          moneyOrEmpty(patientDebt(row)),
        ]),
        [`Toplam (${count(patientCount)} hasta)`, "", { money: data.totals.treatmentTotal }, { money: data.totals.collected }, { money: data.totals.debt }],
      ],
    }],
  };
}

export function treatmentsDocument(data: TreatmentsReport, rows: TreatmentReportRow[], context: ExportContext): ExportDocument {
  return {
    fileName: `rapor-tedaviler-${context.fileRange}`,
    title: "Rapor: Tedaviler",
    meta: metaLine(context.rangeLabel, context.doctorName, truncatedNote(data.truncated, data.limit)),
    orientation: "p",
    sections: [{
      title: "Yapılan tedaviler",
      headers: ["Tarih", "Hasta", "Doktor", "Tedavi", "Ücret"],
      rows: [
        ...rows.map((row): Cell[] => [
          formatDateText(row.date),
          row.patientName,
          context.doctorNameById.get(row.doctorId) || "",
          treatmentText(row),
          { money: row.amount },
        ]),
        [`Toplam (${count(data.totals.count)} tedavi)`, "", "", "", { money: data.totals.amount }],
      ],
    }],
  };
}

export function expensesDocument(data: ExpensesReport, context: ExportContext): ExportDocument {
  return {
    fileName: `rapor-giderler-${context.fileRange}`,
    title: "Rapor: Giderler",
    meta: context.rangeLabel,
    orientation: "p",
    sections: [
      {
        title: "Gider türleri",
        headers: ["Gider türü", "Tutar"],
        rows: [...data.expenseByCategory.map((row): Cell[] => [row.name, { money: row.amount }]), ["Toplam", { money: data.expenseTotal }]],
      },
      {
        title: "Tedarikçi alımları",
        headers: ["Tedarikçi", "Tutar"],
        rows: [...data.purchasesBySupplier.map((row): Cell[] => [row.name, { money: row.amount }]), ["Toplam", { money: data.purchaseTotal }]],
      },
    ],
  };
}

export async function downloadReportCsv(file: ExportDocument) {
  const { downloadCsv } = await import("@/lib/csv-export");
  const rows: Record<string, string>[] = [];
  if (file.sections.length === 1) {
    const [section] = file.sections;
    for (const row of section.rows) {
      rows.push(Object.fromEntries(section.headers.map((header, index) => [header, csvCell(row[index] ?? "")])));
    }
  } else {
    for (const section of file.sections) {
      for (const row of section.rows) {
        if (section.headers.length <= 2) {
          rows.push({ Bölüm: section.title, Kalem: csvCell(row[0] ?? ""), Değer: csvCell(row[1] ?? "") });
          continue;
        }
        // Çok sütunlu bölüm (doktorlara göre): her dolu hücre ayrı satır ("Dr. Ayşe — Tahsilat").
        for (let index = 1; index < section.headers.length; index += 1) {
          const value = csvCell(row[index] ?? "");
          if (value) rows.push({ Bölüm: section.title, Kalem: `${csvCell(row[0] ?? "")} — ${section.headers[index]}`, Değer: value });
        }
      }
    }
  }
  downloadCsv(file.fileName, rows);
}

export async function downloadReportPdf(file: ExportDocument) {
  const { addPdfSection, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
  // Türkçe yazı tipi oturumun ilk PDF'inde de yüklü olsun (yoksa harfler dönüştürülür).
  await preparePdfFonts();
  const doc = createPdfDoc(file.orientation);
  addPdfTitle(doc, file.title, file.meta);
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 30;
  for (const section of file.sections) {
    // Uzun tablodan sonra bölüm başlığı sayfa dışına düşmesin.
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    y = addPdfSection(doc, y, section.title, section.headers, section.rows.map((row) => row.map(pdfCell)));
  }
  doc.save(`${file.fileName}.pdf`);
}
