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

// ── Kurumsal görünüm ─────────────────────────────────────────────────────
// Bütün PDF'ler (hasta raporu, raporlar, gelir-gider, hakediş, aramalar) aynı
// tasarımla çıkar: üstte ince lacivert şerit; solda logo, klinik adı ve
// iletişim; sağda belge adı ve oluşturulma zamanı; altında belgenin kapsamı
// (dönem, kişi, süzgeç) açık gri kutuda. İstenirse özet kartları (Tahsilat,
// Kalan…), sonra bölümler: kısa vurgu çizgili başlık ve kayıt sayısı; tabloda
// lacivert başlık satırı, dönüşümlü satırlar, yalnız yatay ince ayraçlar, sağa
// hizalı tutarlar ve kalın "Toplam" satırı. Devam sayfalarında ince başlık; her
// sayfanın altında klinik bilgisi ve "Sayfa X / Y". Lacivert yazdırılan
// belgelerin antediyle (#1e3a5f), vurgu rengi uygulamanın ana rengiyle aynı.
type Rgb = [number, number, number];
const BRAND: Rgb = [30, 58, 95];
const ACCENT: Rgb = [13, 125, 111];
const INK: Rgb = [15, 23, 42];
const BODY: Rgb = [51, 65, 85];
const MUTED: Rgb = [100, 116, 139];
const HAIRLINE: Rgb = [226, 232, 240];
const ZEBRA: Rgb = [248, 250, 252];
const PANEL: Rgb = [241, 245, 249];
const POSITIVE: Rgb = [4, 120, 87];
const NEGATIVE: Rgb = [185, 28, 28];
const MARGIN = 14;
/** Devam sayfalarında içerik bu yükseklikten başlar (ince başlığın altı). */
const CONTINUE_TOP = 20;
const BOTTOM_MARGIN = 16;

type PdfLogo = { data: string; width: number; height: number };
type PdfLetterhead = { name: string; contact: string; logo: PdfLogo | null };

let letterhead: PdfLetterhead | null = null;
let letterheadPromise: Promise<void> | null = null;
const docTitles = new WeakMap<jsPDF, string>();
const decoratedDocs = new WeakSet<jsPDF>();

/** Logo PDF'e PNG olarak gömülür (WEBP/SVG de çizilip PNG'ye çevrilir). */
function logoToPng(src: string): Promise<PdfLogo | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const scale = Math.min(1, 360 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function loadLetterhead(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!letterheadPromise) {
    letterheadPromise = import("@/lib/print-letterhead")
      .then(async ({ loadPrintClinic, clinicContactLine }) => {
        const clinic = await loadPrintClinic();
        // Yazdırılan belgelerle aynı kural: yalnız https adresi ya da yüklenmiş resim.
        const logoUrl = /^https:\/\//i.test(clinic.logoUrl) || /^data:image\//i.test(clinic.logoUrl) ? clinic.logoUrl : "";
        const logo = logoUrl ? await logoToPng(logoUrl) : null;
        letterhead = { name: clinic.name, contact: clinicContactLine(clinic), logo };
      })
      .catch(() => {
        letterheadPromise = null;
      });
  }
  return letterheadPromise;
}

/**
 * Türkçe fontu ve kurumsal anteti (klinik adı, iletişim, logo) hazırlar;
 * `createPdfDoc`'tan önce beklenirse ilk belge de tam Türkçe harflerle ve
 * antetle yazılır. Font alınamazsa `false` döner (belge yine oluşur, harfler
 * yedekle dönüştürülür).
 */
export async function preparePdfFonts(): Promise<boolean> {
  const [fonts] = await Promise.all([loadFonts(), loadLetterhead()]);
  return Boolean(fonts);
}

/**
 * Metni PDF'e yazılabilir hale getirir. `doc` verilir ve belgede Türkçe font
 * kayıtlıysa metin olduğu gibi kalır; aksi halde ğ/ı/ş, ₺ ve eksi işareti
 * dönüştürülür.
 */
export function pdfSafeText(value: unknown, doc?: jsPDF): string {
  const text = String(value ?? "");
  if (doc && unicodeDocs.has(doc)) return text;
  return text
    .replace(/[ğĞıİşŞ]/g, (ch) => TR_FALLBACK[ch] || ch)
    .replace(/₺/g, "TL ")
    .replace(/−/g, "-");
}

function nowText() {
  return new Date().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

/** Yazı tek satıra sığana dek küçülür (en az `min` punto). Seçili yazı tipiyle ölçer. */
function fitFontSize(doc: jsPDF, text: string, maxWidth: number, size: number, min: number) {
  let current = size;
  doc.setFontSize(current);
  while (current > min && doc.getTextWidth(text) > maxWidth) {
    current -= 0.5;
    doc.setFontSize(current);
  }
}

/** Sığmayan tek satırlık yazı "…" ile kısalır. */
function clipText(doc: jsPDF, text: string, maxWidth: number) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}…`) > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped.trimEnd()}…`;
}

/** Her sayfanın alt bilgisi ve devam sayfalarının ince başlığı (kaydetmeden hemen önce). */
function decoratePages(doc: jsPDF) {
  if (decoratedDocs.has(doc)) return;
  decoratedDocs.add(doc);
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const title = docTitles.get(doc) || "";
  const footer = [letterhead?.name, letterhead?.contact].filter(Boolean).join("  ·  ");
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, width, 1.2, "F");
      if (title) {
        setPdfTextFont(doc, "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...BRAND);
        doc.text(clipText(doc, pdfSafeText(`${title} (devam)`, doc), width / 2), MARGIN, 10);
      }
      if (letterhead?.name) {
        setPdfTextFont(doc);
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(clipText(doc, pdfSafeText(letterhead.name, doc), width / 2 - MARGIN * 2), width - MARGIN, 10, { align: "right" });
      }
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, 13.5, width - MARGIN, 13.5);
    }
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, height - 11, width - MARGIN, height - 11);
    setPdfTextFont(doc);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    if (footer) doc.text(clipText(doc, pdfSafeText(footer, doc), width - MARGIN * 2 - 30), MARGIN, height - 6.5);
    setPdfTextFont(doc, "bold");
    doc.setTextColor(...BODY);
    doc.text(pdfSafeText(`Sayfa ${page} / ${pages}`, doc), width - MARGIN, height - 6.5, { align: "right" });
  }
  doc.setTextColor(0);
}

/**
 * Bütün belgeler dikey A4'tür: dosyaya konur, yazdırılır, telefonda okunur.
 * Yatay sayfa bu işlerin hiçbirine yaramıyordu; çok sütunlu tablolar dikeye
 * sığacak biçimde kurulur (tarih ve tutar sütunu bölünmez, metin sarılır).
 */
export function createPdfDoc() {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
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
  doc.setProperties({ creator: "CepKlinik", author: letterhead?.name || "CepKlinik" });
  // Kaydetmeden hemen önce her sayfaya alt bilgi ve sayfa numarası eklenir:
  // çağıranlar yalnız doc.save() der.
  const save = doc.save.bind(doc) as (...args: unknown[]) => unknown;
  (doc as unknown as { save: (...args: unknown[]) => unknown }).save = (...args: unknown[]) => {
    decoratePages(doc);
    return save(...args);
  };
  return doc;
}

/**
 * Düz metin (doc.text) yazmadan önce yazı tipini seçer: tablo çizimi yazı
 * tipini değiştirebildiği için başlık ve alt bilgiden önce çağrılır.
 */
export function setPdfTextFont(doc: jsPDF, style: "normal" | "bold" = "normal") {
  doc.setFont(unicodeDocs.has(doc) ? PDF_FONT_FAMILY : "helvetica", style);
}

/**
 * İlk sayfanın kurumsal başlığı: üstte ince lacivert şerit; solda logo, klinik
 * adı ve iletişim; sağda belge adı ve oluşturulma zamanı; altında belgenin
 * kapsamı (`meta`: dönem, kişi, süzgeç) açık gri kutuda. İçeriğin başlayacağı
 * Y konumunu döner.
 */
export function addPdfTitle(doc: jsPDF, title: string, meta: string): number {
  docTitles.set(doc, title);
  doc.setProperties({ title: pdfSafeText(title, doc) });
  const width = doc.internal.pageSize.getWidth();
  const half = (width - MARGIN * 2) / 2;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, width, 2, "F");

  // Sol: logo, klinik adı, iletişim.
  let textX = MARGIN;
  let bottom = 19;
  const logo = letterhead?.logo;
  if (logo) {
    const ratio = Math.min(30 / logo.width, 13 / logo.height);
    const logoWidth = logo.width * ratio;
    const logoHeight = logo.height * ratio;
    try {
      doc.addImage(logo.data, "PNG", MARGIN, 7.5, logoWidth, logoHeight);
      textX = MARGIN + logoWidth + 4;
      bottom = Math.max(bottom, 7.5 + logoHeight);
    } catch {
      textX = MARGIN;
    }
  }
  const leftWidth = MARGIN + half - 8 - textX;
  if (letterhead?.name) {
    const name = pdfSafeText(letterhead.name, doc);
    setPdfTextFont(doc, "bold");
    fitFontSize(doc, name, leftWidth, 13, 9);
    doc.setTextColor(...INK);
    doc.text(clipText(doc, name, leftWidth), textX, 13);
  }
  if (letterhead?.contact) {
    setPdfTextFont(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const lines = (doc.splitTextToSize(pdfSafeText(letterhead.contact, doc), leftWidth) as string[]).slice(0, 2);
    doc.text(lines, textX, 18);
    bottom = Math.max(bottom, 18 + (lines.length - 1) * 3.3 + 1);
  }

  // Sağ: belge adı ve oluşturulma zamanı.
  const titleText = pdfSafeText(title, doc);
  setPdfTextFont(doc, "bold");
  fitFontSize(doc, titleText, half - 4, 15, 10);
  doc.setTextColor(...BRAND);
  doc.text(clipText(doc, titleText, half - 4), width - MARGIN, 13.5, { align: "right" });
  setPdfTextFont(doc);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafeText(`Oluşturma: ${nowText()}`, doc), width - MARGIN, 18.5, { align: "right" });

  let y = bottom + 4.5;
  if (meta) {
    setPdfTextFont(doc);
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(pdfSafeText(meta, doc), width - MARGIN * 2 - 10) as string[];
    const boxHeight = 8.4 + (lines.length - 1) * 3.6;
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN, y, width - MARGIN * 2, boxHeight, "F");
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 1.2, boxHeight, "F");
    doc.setTextColor(...BODY);
    doc.text(lines, MARGIN + 5, y + 5.4);
    y += boxHeight;
  } else {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, width - MARGIN, y);
  }
  doc.setTextColor(0);
  return y + 10;
}

export type PdfStat = { label: string; value: string; tone?: "positive" | "negative" };

/**
 * Özet kartları (ör. Tahsilat · Gider · Fark): belgeyi açan önce sonucu
 * görür. Bir sonraki bölümün başlayacağı Y konumunu döner.
 */
export function addPdfStats(doc: jsPDF, startY: number, stats: PdfStat[]): number {
  if (stats.length === 0) return startY;
  const width = doc.internal.pageSize.getWidth();
  const gap = 4;
  const fullWidth = (width - MARGIN * 2 - gap * (stats.length - 1)) / stats.length;
  // Bir-iki kart sayfa boyu gerilmez.
  const cardWidth = stats.length <= 2 ? Math.min(70, fullWidth) : fullWidth;
  const cardHeight = 16.5;
  const top = startY - 3.5;
  stats.forEach((stat, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    doc.setFillColor(...ZEBRA);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, top, cardWidth, cardHeight, 1.5, 1.5, "FD");
    setPdfTextFont(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(clipText(doc, pdfSafeText(stat.label, doc), cardWidth - 8), x + 4, top + 5.8);
    const value = pdfSafeText(stat.value, doc);
    setPdfTextFont(doc, "bold");
    fitFontSize(doc, value, cardWidth - 8, 13.5, 8);
    doc.setTextColor(...(stat.tone === "positive" ? POSITIVE : stat.tone === "negative" ? NEGATIVE : INK));
    doc.text(clipText(doc, value, cardWidth - 8), x + 4, top + 13);
  });
  doc.setTextColor(0);
  return top + cardHeight + 10.5;
}

/**
 * Bölüm başlığı (kısa vurgu çizgisi, varsa sağında soluk not); tablonun
 * başlayacağı Y'yi döner. Başlığın altında `needed` mm yer yoksa yeni sayfaya
 * geçer: başlık sayfanın dibinde tablosuz kalmaz.
 */
function addSectionHeading(doc: jsPDF, startY: number, title: string, note = "", needed = 40): number {
  const height = doc.internal.pageSize.getHeight();
  let y = Math.max(startY, CONTINUE_TOP);
  if (y > height - needed) {
    doc.addPage();
    y = CONTINUE_TOP;
  }
  const text = pdfSafeText(title, doc);
  setPdfTextFont(doc, "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(text, MARGIN, y);
  if (note) {
    const noteX = MARGIN + doc.getTextWidth(text) + 2.5;
    setPdfTextFont(doc);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafeText(note, doc), noteX, y);
  }
  doc.setFillColor(...ACCENT);
  doc.rect(MARGIN, y + 1.8, 9, 0.7, "F");
  doc.setTextColor(0);
  return y + 5;
}

/** Kesinti/eksi tutar ("−₺120,00"): kırmızı yazılır. */
const NEGATIVE_AMOUNT = /^[−-]\s*(₺|TL)?\s*\d/;
/** Tarih hücresi (sağa hizalanmaz). */
const DATE_CELL = /^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$/;
/** Tarih ya da tarih-saat hücresi ("28.10.2026", "28.10.2026 16:10"): sütun bölünmez. */
const DATE_TIME_CELL = /^\d{1,2}\.\d{1,2}\.\d{4}( \d{1,2}:\d{2})?$/;
/** Tutar, adet ya da yüzde hücresi (sütun sağa hizalanır). */
const AMOUNT_CELL = /^[-−+]?\s*(₺|TL)?\s*%?\s*\d[\d.]*(,\d+)?\s*(₺|TL|%)?$/i;
/** Tablonun son satırı toplamsa kalın yazılır. */
const TOTAL_LABEL = /^(genel )?toplam\b/i;

const lastTableEnd = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * Bir tablo bölümü ekler, bir sonraki bölümün başlayacağı Y konumunu döner.
 * Değerlerinin çoğu tutar/sayı olan sütun sağa hizalanır; son satır "Toplam"
 * ile başlıyorsa toplam satırı olarak kalın yazılır. Kayıt yoksa tablo yerine
 * kısa bir not yazılır.
 */
export function addPdfSection(
  doc: jsPDF,
  startY: number,
  title: string,
  headers: string[],
  rows: (string | number)[][]
): number {
  const safe = (value: unknown) => pdfSafeText(value, doc);
  const font = unicodeDocs.has(doc) ? PDF_FONT_FAMILY : undefined;
  const hasTotal = rows.length > 1 && TOTAL_LABEL.test(String(rows[rows.length - 1]?.[0] ?? "").trim());
  const recordCount = rows.length - (hasTotal ? 1 : 0);
  // Boş bölüm yalnız tek satırlık not kadar yer ister.
  const tableTop = addSectionHeading(doc, startY, title, rows.length > 0 ? `${recordCount} kayıt` : "", rows.length > 0 ? 40 : 28);
  if (rows.length === 0) {
    setPdfTextFont(doc);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(safe("Bu bölümde kayıt yok."), MARGIN, tableTop + 3.5);
    doc.setTextColor(0);
    return tableTop + 13;
  }
  // Değerlerinin çoğu tutar/sayı olan sütun sağa hizalanır (başlığıyla birlikte);
  // tutar ve tarih sütunu içeriği kadar genişler, hiç bölünmez ("₺1.500,\n00"
  // olmaz). Kalan genişlik metin sütunlarına kalır, onlar satır sarar.
  const numericColumns = new Set<number>();
  const compactColumns = new Set<number>();
  headers.forEach((_, column) => {
    const values = rows.map((row) => String(row[column] ?? "").trim()).filter(Boolean);
    if (values.length === 0) return;
    const amounts = values.filter((value) => AMOUNT_CELL.test(value) && !DATE_CELL.test(value));
    const dates = values.filter((value) => DATE_TIME_CELL.test(value));
    if (amounts.length / values.length >= 0.6) {
      numericColumns.add(column);
      compactColumns.add(column);
    } else if (dates.length / values.length >= 0.6) {
      compactColumns.add(column);
    }
  });

  // Kısa metin sütunu (ad, neden, yöntem, durum) içeriği kadar genişler ve
  // bölünmez; uzun metin (açıklama, not) kalan genişliği paylaşır. Önceden
  // genişlik içerik uzunluğuyla orantılı dağıtıldığından dikey sayfada
  // "Demo / Can / Erdem" gibi adlar kelime kelime alt alta düşüyordu.
  const available = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const naturalWidth = headers.map((header, column) => {
    setPdfTextFont(doc, "bold");
    doc.setFontSize(7.8);
    const headWidth = doc.getTextWidth(safe(header));
    setPdfTextFont(doc);
    doc.setFontSize(8.2);
    const lines = rows.flatMap((row) => safe(row[column] ?? "").split("\n"));
    const bodyWidth = lines.reduce((widest, line) => Math.max(widest, doc.getTextWidth(line)), 0);
    return Math.max(headWidth, bodyWidth) + 6.6;
  });
  const fixedWidths = new Map<number, number>();
  let used = [...compactColumns].reduce((sum, column) => sum + naturalWidth[column], 0);
  const textColumns = headers.map((_, column) => column).filter((column) => !compactColumns.has(column))
    .sort((a, b) => naturalWidth[a] - naturalWidth[b]);
  // En geniş metin sütunu serbest kalır: tablo sayfa genişliğini o doldurur.
  for (let index = 0; index < textColumns.length - 1; index += 1) {
    const column = textColumns[index];
    const width = naturalWidth[column];
    const flexibleLeft = textColumns.length - index - 1;
    if (width > 46 || used + width + flexibleLeft * 34 > available) break;
    fixedWidths.set(column, width);
    used += width;
  }

  autoTable(doc, {
    startY: tableTop,
    head: [headers.map(safe)],
    body: rows.map((row) => row.map(safe)),
    theme: "plain",
    styles: {
      ...(font ? { font } : {}),
      fontSize: 8.2,
      cellPadding: { top: 2.6, right: 3, bottom: 2.6, left: 3 },
      overflow: "linebreak",
      textColor: BODY,
      lineColor: HAIRLINE,
      lineWidth: { bottom: 0.2 },
      valign: "middle",
    },
    headStyles: {
      fillColor: BRAND,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.8,
      // Hücre kenarı da lacivert: yan yana hücreler arasında ince beyaz çizgi görünmez.
      lineColor: BRAND,
      lineWidth: 0.35,
      cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: Object.fromEntries([
      ...[...compactColumns].map((column) => [
        column,
        numericColumns.has(column) ? { halign: "right" as const, cellWidth: "wrap" as const } : { cellWidth: "wrap" as const },
      ]),
      ...[...fixedWidths].map(([column, width]) => [column, { cellWidth: width }]),
    ]),
    didParseCell: (data) => {
      if (numericColumns.has(data.column.index)) {
        data.cell.styles.halign = "right";
        if (data.section === "body") data.cell.styles.textColor = INK;
      }
      // Toplam satırı: kalın, üstünde lacivert çizgi (zemin rengi yok: hücre aralarında ek görünmez).
      if (hasTotal && data.section === "body" && data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = INK;
        data.cell.styles.fillColor = false;
        data.cell.styles.lineColor = BRAND;
        data.cell.styles.lineWidth = { top: 0.4 };
      }
    },
    margin: { left: MARGIN, right: MARGIN, top: CONTINUE_TOP, bottom: BOTTOM_MARGIN },
  });
  return lastTableEnd(doc) + 10;
}

/**
 * Bilgi listesi (etiket — değer). `columns` > 1 ise yan yana çiftler (hasta
 * bilgileri gibi); tek sütunda değer sağa hizalanır ve `width` ile daraltılır
 * (hesap dökümü gibi). `emphasize`: sonuç satırları (sıra numarası) kalın ve üst
 * çizgili.
 * Eksi tutar kırmızı yazılır. Sonraki bölümün başlayacağı Y konumunu döner.
 */
export function addPdfFacts(
  doc: jsPDF,
  startY: number,
  title: string,
  facts: [string, string | number][],
  options: { columns?: number; emphasize?: number[]; width?: number } = {}
): number {
  const safe = (value: unknown) => pdfSafeText(value, doc);
  const font = unicodeDocs.has(doc) ? PDF_FONT_FAMILY : undefined;
  const columns = Math.max(1, Math.floor(options.columns ?? 1));
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = Math.min(options.width ?? pageWidth, pageWidth - MARGIN * 2);
  const tableTop = addSectionHeading(doc, startY, title);
  const body: string[][] = [];
  for (let index = 0; index < facts.length; index += columns) {
    const row: string[] = [];
    for (let column = 0; column < columns; column += 1) {
      const fact = facts[index + column];
      row.push(fact ? safe(fact[0]) : "", fact ? safe(fact[1]) : "");
    }
    body.push(row);
  }
  const emphasized = new Set(options.emphasize ?? []);
  const single = columns === 1;
  const labelWidth = Math.min(46, (tableWidth / columns) * 0.36);
  const columnStyles = single
    ? { 0: { textColor: BODY }, 1: { cellWidth: 46, halign: "right" as const, textColor: INK } }
    : Object.fromEntries(Array.from({ length: columns * 2 }, (_, column) => [
      column,
      column % 2 === 0 ? { cellWidth: labelWidth, textColor: MUTED, fontSize: 7.8 } : { textColor: INK },
    ]));

  autoTable(doc, {
    startY: tableTop,
    body,
    theme: "plain",
    tableWidth,
    styles: {
      ...(font ? { font } : {}),
      fontSize: 8.4,
      cellPadding: { top: 2.4, right: 3, bottom: 2.4, left: 3 },
      overflow: "linebreak",
      lineColor: HAIRLINE,
      lineWidth: { bottom: 0.2 },
      valign: "top",
    },
    columnStyles,
    didParseCell: (data) => {
      const isValue = single ? data.column.index === 1 : data.column.index % 2 === 1;
      if (isValue && NEGATIVE_AMOUNT.test(String(data.cell.raw ?? "").trim())) data.cell.styles.textColor = NEGATIVE;
      if (emphasized.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = false;
        data.cell.styles.textColor = isValue ? BRAND : INK;
        data.cell.styles.lineColor = BRAND;
        data.cell.styles.lineWidth = { top: 0.4 };
      }
    },
    margin: { left: MARGIN, right: MARGIN, top: CONTINUE_TOP, bottom: BOTTOM_MARGIN },
  });
  return lastTableEnd(doc) + 10;
}

/** Soluk not paragrafı (ör. "Bu ay laboratuvar gideri yok."). Sonraki bölümün Y konumunu döner. */
export function addPdfNote(doc: jsPDF, startY: number, text: string): number {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = Math.max(startY, CONTINUE_TOP);
  setPdfTextFont(doc);
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(pdfSafeText(text, doc), width - MARGIN * 2) as string[];
  if (y + (lines.length - 1) * 3.6 > height - BOTTOM_MARGIN - 4) {
    doc.addPage();
    y = CONTINUE_TOP;
  }
  doc.setTextColor(...MUTED);
  doc.text(lines, MARGIN, y);
  doc.setTextColor(0);
  return y + (lines.length - 1) * 3.6 + 10;
}

/**
 * İmza alanları (ör. Hazırlayan · Hekim): iki tarafın imzaladığı döküm,
 * sonradan çıkan itirazda kanıttır. Ad biliniyorsa çizginin altına yazılır.
 * Sonraki bölümün Y konumunu döner.
 */
export function addPdfSignatures(doc: jsPDF, startY: number, signers: { title: string; name?: string }[]): number {
  if (signers.length === 0) return startY;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const blockHeight = 24;
  let top = Math.max(startY, CONTINUE_TOP) - 3;
  if (top + blockHeight > height - BOTTOM_MARGIN) {
    doc.addPage();
    top = CONTINUE_TOP - 3;
  }
  const gap = 12;
  const boxWidth = Math.min(78, (width - MARGIN * 2 - gap * (signers.length - 1)) / signers.length);
  signers.forEach((signer, index) => {
    const x = MARGIN + index * (boxWidth + gap);
    setPdfTextFont(doc, "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(pdfSafeText(signer.title, doc), x, top + 3.5);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(x, top + 17, x + boxWidth, top + 17);
    setPdfTextFont(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const caption = signer.name ? `${signer.name} · imza, tarih` : "Ad soyad · imza, tarih";
    doc.text(clipText(doc, pdfSafeText(caption, doc), boxWidth), x, top + 21);
  });
  doc.setTextColor(0);
  return top + blockHeight + 8;
}
