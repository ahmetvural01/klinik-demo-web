import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// jsPDF'in standart fontları (Helvetica/WinAnsi) ğ/ı/ş harflerini ve ₺ işaretini
// içermez. Bu yüzden belge Türkçe harfleri tam içeren Noto Sans (SIL Open Font
// License, public/fonts/NotoSans-OFL.txt) ile yazılır. Font yalnız dışa
// aktarırken indirilir (sayfa açılışını yavaşlatmaz) ve oturum boyunca bellekte
// kalır. İndirilemezse eski yedek kullanılır: ğ/ı/ş en yakın okunabilir
// karşılığına çevrilir, ç/ö/ü gibi WinAnsi'de olan harflere dokunulmaz.
const TR_FALLBACK: Record<string, string> = { ğ: "g", Ğ: "G", ı: "i", İ: "I", ş: "s", Ş: "S" };

const PDF_FONT_FAMILY = "NotoSans";
const PDF_FONT_FILES = [
  { file: "NotoSans-Regular.ttf", url: "/fonts/NotoSans-Regular.ttf", style: "normal" },
  { file: "NotoSans-Bold.ttf", url: "/fonts/NotoSans-Bold.ttf", style: "bold" },
] as const;

type LoadedFont = { file: string; style: string; base64: string };

let fontPromise: Promise<LoadedFont[] | null> | null = null;
let loadedFonts: LoadedFont[] | null = null;
/** Türkçe fontu kayıtlı belgeler: bunlarda harf dönüştürmesi yapılmaz. */
const unicodeDocs = new WeakSet<jsPDF>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function loadFonts(): Promise<LoadedFont[] | null> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return Promise.resolve(null);
  if (!fontPromise) {
    fontPromise = Promise.all(PDF_FONT_FILES.map(async (font) => {
      const response = await fetch(font.url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`font ${response.status}`);
      return { file: font.file, style: font.style, base64: bytesToBase64(new Uint8Array(await response.arrayBuffer())) };
    }))
      .then((fonts) => {
        loadedFonts = fonts;
        return fonts;
      })
      .catch(() => {
        // Bir sonraki dışa aktarmada yeniden denensin; bu belge yedekle yazılır.
        fontPromise = null;
        return null;
      });
  }
  return fontPromise;
}

// Modül (dışa aktarma anında) yüklenince font da indirilmeye başlar.
void loadFonts();

/**
 * Türkçe fontu hazırlar; `createPdfDoc`'tan önce beklenirse ilk belge de
 * tam Türkçe harflerle yazılır. Font alınamazsa `false` döner (belge yine
 * oluşur, harfler yedekle dönüştürülür).
 */
export async function preparePdfFonts(): Promise<boolean> {
  return Boolean(await loadFonts());
}

/**
 * Metni PDF'e yazılabilir hale getirir. `doc` verilir ve belgede Türkçe font
 * kayıtlıysa metin olduğu gibi kalır; aksi halde ğ/ı/ş ve ₺ dönüştürülür.
 */
export function pdfSafeText(value: unknown, doc?: jsPDF): string {
  const text = String(value ?? "");
  if (doc && unicodeDocs.has(doc)) return text;
  return text
    .replace(/[ğĞıİşŞ]/g, (ch) => TR_FALLBACK[ch] || ch)
    .replace(/₺/g, "TL ");
}

export function createPdfDoc(orientation: "p" | "l" = "p") {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  if (loadedFonts) {
    try {
      for (const font of loadedFonts) {
        doc.addFileToVFS(font.file, font.base64);
        doc.addFont(font.file, PDF_FONT_FAMILY, font.style);
      }
      doc.setFont(PDF_FONT_FAMILY, "normal");
      unicodeDocs.add(doc);
    } catch {
      // Font kaydedilemezse belge standart fontla (yedek dönüştürmeyle) yazılır.
      doc.setFont("helvetica", "normal");
    }
  }
  return doc;
}

/**
 * Düz metin (doc.text) yazmadan önce yazı tipini seçer: tablo çizimi yazı
 * tipini değiştirebildiği için başlık ve alt bilgiden önce çağrılır.
 */
export function setPdfTextFont(doc: jsPDF, style: "normal" | "bold" = "normal") {
  doc.setFont(unicodeDocs.has(doc) ? PDF_FONT_FAMILY : "helvetica", style);
}

export function addPdfTitle(doc: jsPDF, title: string, meta: string) {
  setPdfTextFont(doc);
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(pdfSafeText(title, doc), 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(pdfSafeText(meta, doc), 14, 22);
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
  const safe = (value: unknown) => pdfSafeText(value, doc);
  const font = unicodeDocs.has(doc) ? PDF_FONT_FAMILY : undefined;
  setPdfTextFont(doc);
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(safe(title), 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [headers.map(safe)],
    body:
      rows.length === 0
        ? [[{ content: safe("Kayıt yok"), colSpan: headers.length, styles: { halign: "center" as const, textColor: 150 } }]]
        : rows.map((r) => r.map(safe)),
    theme: "grid",
    styles: {
      ...(font ? { font } : {}),
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
