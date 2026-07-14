import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// jsPDF'in standart fontları (Helvetica/WinAnsi) ğ/ı/ş harflerini ve ₺ işaretini
// içermez — bunları en yakın okunabilir karşılıklarına çevirir, ç/ö/ü gibi
// WinAnsi'de zaten var olan Türkçe karakterlere dokunmaz.
const TR_FALLBACK: Record<string, string> = { ğ: "g", Ğ: "G", ı: "i", İ: "I", ş: "s", Ş: "S" };
export function pdfSafeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[ğĞıİşŞ]/g, (ch) => TR_FALLBACK[ch] || ch)
    .replace(/₺/g, "TL ");
}

export function createPdfDoc(orientation: "p" | "l" = "p") {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

export function addPdfTitle(doc: jsPDF, title: string, meta: string) {
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(pdfSafeText(title), 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(pdfSafeText(meta), 14, 22);
  doc.setTextColor(0);
}

/** Bir tablo bölümü ekler, bir sonraki bölümün başlayacağı Y konumunu döner. */
export function addPdfSection(
  doc: jsPDF,
  startY: number,
  title: string,
  headers: string[],
  rows: (string | number)[][]
): number {
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(pdfSafeText(title), 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [headers.map(pdfSafeText)],
    body:
      rows.length === 0
        ? [[{ content: "Kayıt yok", colSpan: headers.length, styles: { halign: "center" as const, textColor: 150 } }]]
        : rows.map((r) => r.map(pdfSafeText)),
    theme: "grid",
    styles: {
      fontSize: 7.8,
      cellPadding: { top: 2.1, right: 2.4, bottom: 2.1, left: 2.4 },
      overflow: "linebreak",
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.12,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { valign: "middle" },
    margin: { left: 14, right: 14 },
  });
  // jspdf-autotable, son tablonun bittiği Y konumunu doc üzerine ekler.
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}
