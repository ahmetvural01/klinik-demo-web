import ExcelJS from "exceljs";

// Klinik geçmiş verilerini (hasta + ödeme + tedavi + reçete geçmişi) toplu
// aktarma şablonu ve ayrıştırıcısı. Süperadmin bu şablonu klinik için indirir,
// klinik doldurur, süperadmin panelden yükler — önce önizleme (hiçbir yazma
// yok), sonra onay ile gerçek kayıt. Bkz. src/app/api/superadmin/institutions/[id]/import/*.

export const PATIENT_SHEET_NAME = "Hastalar";
export const PAYMENT_SHEET_NAME = "Odeme Gecmisi";
export const TREATMENT_SHEET_NAME = "Tedavi Gecmisi";
export const PRESCRIPTION_SHEET_NAME = "Recete Gecmisi";
export const INSTRUCTIONS_SHEET_NAME = "Talimatlar";

// String.toLocaleUpperCase("tr-TR") tek başına güvenilir değil: "nakit" → "NAKİT"
// (noktalı İ) üretir, ASCII "NAKIT" anahtarıyla asla eşleşmez — sessizce yanlış
// eşleşmeye (örn. "Diğer"e düşme) yol açar. Bu yüzden noktalı/noktasız İ/ı/I
// farkını burada tek noktadan normalize ediyoruz.
export function normalizeTrKey(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

export const GENDER_OPTIONS = ["Erkek", "Kadın"] as const;
const GENDER_MAP: Record<string, string> = { ERKEK: "ERKEK", KADIN: "KADIN" };

export const YES_NO_OPTIONS = ["Evet", "Hayır"] as const;

export const PAYMENT_METHOD_OPTIONS = ["Nakit", "Kredi Kartı", "Havale/EFT", "Diğer"] as const;
const PAYMENT_METHOD_MAP: Record<string, string> = {
  "NAKIT": "NAKIT",
  "KREDI KARTI": "KREDI_KARTI",
  "HAVALE/EFT": "HAVALE_EFT",
  "HAVALE": "HAVALE_EFT",
  "EFT": "HAVALE_EFT",
  "DIGER": "DIGER",
};

export const TREATMENT_STATUS_OPTIONS = ["Tamamlandı", "Devam Ediyor", "Planlandı", "İptal"] as const;
const TREATMENT_STATUS_MAP: Record<string, string> = {
  "TAMAMLANDI": "TAMAMLANDI",
  "DEVAM EDIYOR": "DEVAM_EDIYOR",
  "PLANLANDI": "PLANLANDI",
  "IPTAL": "IPTAL",
};

// Sütun sırası şablon ile ayrıştırıcı arasında birebir aynı olmalı — sıra
// değişirse mevcut doldurulmuş dosyalar yanlış sütuna eşlenir.
// `textFormat: true` olan sütunlar Excel'de "Metin" hücre biçimiyle üretilir —
// aksi halde TC kimlik no ve telefon gibi rakamla başlayan ama başında SIFIR
// olan değerler, kullanıcı hücreye yazdığı anda Excel tarafından sayıya
// çevrilip baştaki 0 sessizce silinir (çok bilinen, sık karşılaşılan bir
// Excel veri kaybı hatası — şablonda önceden engellenmezse fark edilmeden
// telefon/TC verisi bozulur).
export const PATIENT_COLUMNS = [
  { key: "tcNo", header: "TC Kimlik No*", required: true, width: 16, textFormat: true },
  { key: "fullName", header: "Ad Soyad*", required: true, width: 24 },
  { key: "phone", header: "Telefon* (0XXXXXXXXXX)", required: true, width: 18, textFormat: true },
  { key: "gender", header: "Cinsiyet*", required: true, width: 12, list: GENDER_OPTIONS as unknown as string[] },
  { key: "birthDate", header: "Doğum Tarihi (GG.AA.YYYY)", required: false, width: 16 },
  { key: "address", header: "Adres", required: false, width: 28 },
  { key: "profession", header: "Meslek", required: false, width: 16 },
  { key: "insurance", header: "Sigorta", required: false, width: 16 },
  { key: "discountRate", header: "İskonto Oranı (%)", required: false, width: 12 },
  { key: "bloodType", header: "Kan Grubu", required: false, width: 10 },
  { key: "notes", header: "Notlar", required: false, width: 28 },
  { key: "hasAllergy", header: "Alerji Var mı", required: false, width: 12, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasHepatitis", header: "Hepatit", required: false, width: 10, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasKidney", header: "Böbrek Hastalığı", required: false, width: 14, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasDiabetes", header: "Diyabet", required: false, width: 10, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasHeart", header: "Kalp Hastalığı", required: false, width: 14, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasBloodIssue", header: "Kan Hastalığı", required: false, width: 14, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "hasContagiousDisease", header: "Bulaşıcı Hastalık", required: false, width: 14, list: YES_NO_OPTIONS as unknown as string[] },
  { key: "contagiousDiseaseNote", header: "Bulaşıcı Hastalık Notu", required: false, width: 22 },
  { key: "medications", header: "Kullandığı İlaçlar", required: false, width: 22 },
  { key: "surgeries", header: "Geçirdiği Ameliyatlar", required: false, width: 22 },
  { key: "otherDiseases", header: "Diğer Hastalıklar", required: false, width: 22 },
  { key: "referrer", header: "Yönlendiren", required: false, width: 16 },
] as const;

export const PAYMENT_COLUMNS = [
  { key: "patientTcNo", header: "Hasta TC Kimlik No*", required: true, width: 16, textFormat: true },
  { key: "date", header: "Tarih* (GG.AA.YYYY)", required: true, width: 16 },
  { key: "amount", header: "Tutar*", required: true, width: 12 },
  { key: "method", header: "Ödeme Yöntemi", required: false, width: 16, list: PAYMENT_METHOD_OPTIONS as unknown as string[] },
  { key: "doctorName", header: "Doktor Adı Soyadı", required: false, width: 22, doctorList: true },
  { key: "description", header: "Açıklama", required: false, width: 26 },
] as const;

export const TREATMENT_COLUMNS = [
  { key: "patientTcNo", header: "Hasta TC Kimlik No*", required: true, width: 16, textFormat: true },
  { key: "date", header: "Tarih* (GG.AA.YYYY)", required: true, width: 16 },
  { key: "treatmentName", header: "Tedavi Adı*", required: true, width: 24 },
  { key: "doctorName", header: "Doktor Adı Soyadı*", required: true, width: 22, doctorList: true },
  { key: "toothNo", header: "Diş No", required: false, width: 10, textFormat: true },
  { key: "amount", header: "Tutar", required: false, width: 12 },
  { key: "status", header: "Durum", required: false, width: 14, list: TREATMENT_STATUS_OPTIONS as unknown as string[] },
  { key: "note", header: "Not", required: false, width: 26 },
] as const;

export const PRESCRIPTION_COLUMNS = [
  { key: "patientTcNo", header: "Hasta TC Kimlik No*", required: true, width: 16, textFormat: true },
  { key: "date", header: "Tarih* (GG.AA.YYYY)", required: true, width: 16 },
  { key: "drugs", header: "İlaçlar*", required: true, width: 32 },
  { key: "doctorName", header: "Doktor Adı Soyadı", required: false, width: 22, doctorList: true },
  { key: "note", header: "Not", required: false, width: 26 },
] as const;

export type PatientImportData = {
  tcNo: string;
  fullName: string;
  phone: string;
  gender: string;
  birthDate: string | null;
  address: string | null;
  profession: string | null;
  insurance: string | null;
  discountRate: number;
  bloodType: string | null;
  notes: string | null;
  hasAllergy: boolean;
  hasHepatitis: boolean;
  hasKidney: boolean;
  hasDiabetes: boolean;
  hasHeart: boolean;
  hasBloodIssue: boolean;
  hasContagiousDisease: boolean;
  contagiousDiseaseNote: string | null;
  medications: string | null;
  surgeries: string | null;
  otherDiseases: string | null;
  referrer: string | null;
};

export type PaymentImportData = {
  patientTcNo: string;
  date: string; // ISO
  amount: number;
  method: string;
  doctorName: string | null;
  description: string | null;
};

export type TreatmentImportData = {
  patientTcNo: string;
  date: string; // ISO
  treatmentName: string;
  doctorName: string;
  toothNo: string | null;
  amount: number;
  status: string;
  note: string | null;
};

export type PrescriptionImportData = {
  patientTcNo: string;
  date: string; // ISO
  drugs: string;
  doctorName: string | null;
  note: string | null;
};

export type ParsedRow<T> = { rowNumber: number; data: T | null; errors: string[]; warnings: string[] };

export type ImportParseResult = {
  patients: ParsedRow<PatientImportData>[];
  payments: ParsedRow<PaymentImportData>[];
  treatments: ParsedRow<TreatmentImportData>[];
  prescriptions: ParsedRow<PrescriptionImportData>[];
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text;
    if ("result" in value) return String((value as { result?: unknown }).result ?? "");
    return "";
  }
  return String(value).trim();
}

function parseTurkishDate(raw: ExcelJS.CellValue): Date | null {
  if (raw instanceof Date) return raw;
  const text = cellText(raw);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function yesNoToBoolean(raw: ExcelJS.CellValue): boolean {
  const text = normalizeTrKey(cellText(raw));
  return text === "EVET" || text === "TRUE" || text === "1" || text === "X";
}

type ColumnDef = { key: string; header: string; required: boolean; width: number; list?: readonly string[]; doctorList?: boolean; textFormat?: boolean };

// Porselen Klinik marka paletiyle (src/lib/theme-packages.ts) hizalı — her veri
// sayfasının kendi rengi var, bu renk sayfanın gezinme çubuğunda, İçindekiler
// kartında ve talimat sayfasındaki örnek tabloda tutarlı şekilde tekrarlanır.
export const SHEET_COLOR = {
  [PATIENT_SHEET_NAME]: "FF0E6B63",
  [PAYMENT_SHEET_NAME]: "FFB1562F",
  [TREATMENT_SHEET_NAME]: "FF1E40AF",
  [PRESCRIPTION_SHEET_NAME]: "FF7C3AED",
} as const;
const BANNER_DARK = "FF0A4F49";
const PAGE_BG = "FFF6F4EF";
const TEXT_DARK = "FF23231F";
const TEXT_MUTED = "FF64748B";

function writeDataSheet(workbook: ExcelJS.Workbook, name: string, icon: string, columns: readonly ColumnDef[], doctorNames: string[], maxRows: number) {
  const sheet = workbook.addWorksheet(name);
  const color = SHEET_COLOR[name as keyof typeof SHEET_COLOR];
  // `header` burada kasıtlı olarak verilmiyor: exceljs `columns` ataması header
  // metnini otomatik olarak 1. satıra yazar — ama 1. satırı gezinme çubuğu için
  // ayırdığımızdan, sütun başlıkları aşağıda elle 2. satıra yazılıyor.
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const totalCols = columns.length;

  // 1. satır: her sayfada aynı yerde duran, Talimatlar sayfasına dönüş linki
  // içeren renkli gezinme çubuğu — kullanıcı sayfalar arasında kaybolmasın.
  sheet.mergeCells(1, 1, 1, totalCols);
  const navCell = sheet.getCell(1, 1);
  navCell.value = { text: `◀  Talimatlar'a Dön          ${icon}  ${name.toLocaleUpperCase("tr-TR")}`, hyperlink: `#'${INSTRUCTIONS_SHEET_NAME}'!A1` };
  navCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" }, underline: false };
  navCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  navCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 26;

  // 2. satır: gerçek sütun başlıkları — zorunlu olanlar koyu kırmızı, isteğe
  // bağlı olanlar açık gri dolgulu, böylece hangi alanın zorunlu olduğu tek
  // bakışta (yıldız okumadan) görülür.
  const headerRow = sheet.getRow(2);
  headerRow.height = 32;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 11, color: { argb: col.required ? "FFFFFFFF" : "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? "FFB91C1C" : "FFE2E8F0" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  // Gezinme çubuğu + başlık satırı kayarken hep görünür kalsın.
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const doctorList = doctorNames.length > 0 ? doctorNames : ["(kayıtlı doktor yok)"];
  columns.forEach((col, idx) => {
    const colLetter = sheet.getColumn(idx + 1).letter;
    const list = col.doctorList ? doctorList : col.list ? (col.list as unknown as string[]) : null;
    for (let r = 3; r <= maxRows + 2; r += 1) {
      const cell = sheet.getCell(`${colLetter}${r}`);
      if (col.textFormat) cell.numFmt = "@";
      if (list) {
        cell.dataValidation = { type: "list", allowBlank: !col.required, formulae: [`"${list.join(",")}"`] };
      }
      if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF9" } };
    }
  });

  return sheet;
}

const SHEET_META = [
  { name: PATIENT_SHEET_NAME, icon: "🧑‍⚕️", title: "Hastalar", desc: "Hasta kimlik, iletişim ve hastalık bilgileri" },
  { name: PAYMENT_SHEET_NAME, icon: "💳", title: "Ödeme Geçmişi", desc: "Geçmiş tahsilat kayıtları" },
  { name: TREATMENT_SHEET_NAME, icon: "🦷", title: "Tedavi Geçmişi", desc: "Yapılmış / planlanmış tedaviler" },
  { name: PRESCRIPTION_SHEET_NAME, icon: "💊", title: "Reçete Geçmişi", desc: "Yazılmış reçeteler" },
] as const;

// Talimatlar sayfasında her veri sayfası için gösterilen, gerçek sütun
// sayısıyla eşleşen küçük "doğru doldurulmuş satır" örneği — düz metin yerine
// gerçek bir mini tablo olarak (kendi rengiyle), okunması çok daha kolay.
const EXAMPLE_ROWS: Record<string, string[]> = {
  [PATIENT_SHEET_NAME]: ["12345678901", "Ayşe Yılmaz", "05551112233", "Kadın", "15.03.1985", "İzmir Mah. No:4", "Öğretmen", "", "0", "A Rh+", "", "Hayır", "Hayır", "Hayır", "Hayır", "Hayır", "Hayır", "Hayır", "", "", "", "", ""],
  [PAYMENT_SHEET_NAME]: ["12345678901", "10.01.2024", "1500", "Nakit", "Dr. Mehmet Öz", "Kanal tedavisi ödemesi"],
  [TREATMENT_SHEET_NAME]: ["12345678901", "10.01.2024", "Kanal Tedavisi", "Dr. Mehmet Öz", "36", "2500", "Tamamlandı", ""],
  [PRESCRIPTION_SHEET_NAME]: ["12345678901", "10.01.2024", "Augmentin 1000mg 2x1", "Dr. Mehmet Öz", "Ağrı için"],
};

// Şablonu, bu kurumun mevcut doktor listesiyle üretir — "Doktor Adı Soyadı"
// alanı böylece serbest metin yerine gerçek isimlerden seçilen bir açılır
// liste olur (yazım hatası riskini ortadan kaldırır).
export async function buildImportWorkbook(doctorNames: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Klinik Yönetim Paneli";
  workbook.created = new Date();

  const COLS = 8;
  const info = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  info.columns = Array.from({ length: COLS }, () => ({ width: 15 }));
  info.properties.showGridLines = false;

  let r = 1;
  const merge = (fromCol: number, toCol: number, rowSpan = 1) => {
    if (rowSpan > 1) info.mergeCells(r, fromCol, r + rowSpan - 1, toCol);
    else info.mergeCells(r, fromCol, r, toCol);
    return info.getCell(r, fromCol);
  };
  const fillRow = (rowNum: number, argb: string) => {
    for (let c = 1; c <= COLS; c += 1) {
      info.getCell(rowNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    }
  };

  // Başlık banner'ı
  info.getRow(r).height = 40;
  fillRow(r, BANNER_DARK);
  const title = merge(1, COLS);
  title.value = "HASTA, ÖDEME, TEDAVİ VE REÇETE GEÇMİŞİ AKTARIM ŞABLONU";
  title.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  r += 1;

  info.getRow(r).height = 26;
  fillRow(r, SHEET_COLOR[PATIENT_SHEET_NAME]);
  const subtitle = merge(1, COLS);
  subtitle.value = "Bu dosyada 4 veri sayfası var — hepsini doldurmak zorunlu değil, sadece elinizde olan veriyi girin.";
  subtitle.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  subtitle.alignment = { vertical: "middle", horizontal: "center" };
  r += 2;

  // İçindekiler — her sayfaya tıklanabilir renkli kart
  const tocHeader = merge(1, COLS);
  tocHeader.value = "İÇİNDEKİLER  —  Doğrudan bir sayfaya gitmek için karta tıklayın";
  tocHeader.font = { bold: true, size: 12, color: { argb: TEXT_DARK } };
  r += 1;

  for (const meta of SHEET_META) {
    info.getRow(r).height = 30;
    const card = merge(1, COLS);
    card.value = { text: `${meta.icon}   ${meta.title}   —   ${meta.desc}   ▸`, hyperlink: `#'${meta.name}'!A1` };
    card.font = { bold: true, size: 11.5, color: { argb: "FFFFFFFF" }, underline: false };
    card.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SHEET_COLOR[meta.name as keyof typeof SHEET_COLOR] } };
    card.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    r += 1;
  }
  r += 1;

  // Nasıl doldurulur — numaralı, alternatif tonlu satırlar
  const howHeader = merge(1, COLS);
  howHeader.value = "NASIL DOLDURULUR";
  howHeader.font = { bold: true, size: 12, color: { argb: TEXT_DARK } };
  r += 1;

  const steps = [
    "Kırmızı dolgulu sütun başlıkları ZORUNLUDUR, gri dolgulu sütunlar isteğe bağlıdır — boş bırakılabilir.",
    "Açılır listesi (▾ ok işareti) olan hücrelerde SADECE listeden seçim yapın, serbest metin yazmayın.",
    "'Ödeme', 'Tedavi' ve 'Reçete' sayfalarındaki 'Hasta TC Kimlik No' sütunu, 'Hastalar' sayfasında girdiğiniz bir TC ile birebir aynı olmalıdır.",
    "Tarih sütunlarını GG.AA.YYYY biçiminde girin (örnek: 15.03.2023).",
    "TC Kimlik No ve Telefon sütunları 'Metin' biçimindedir — başında 0 olan numaralar bu sayede kaybolmaz, farklı bir biçime çevirmeyin.",
    "Doldurduğunuz dosyayı süperadmine iletin veya Klinikler > İlgili Klinik > Toplu Veri Aktarımı ekranından yükleyin.",
    "Yükleme önce bir ÖNİZLEME gösterir — hiçbir kayıt yazılmadan önce kaç kayıt ekleneceğini ve varsa hataları görürsünüz. Hatalı satırlar olsa bile geçerli satırlar aktarılabilir.",
  ];
  steps.forEach((step, i) => {
    info.getRow(r).height = 18;
    if (i % 2 === 0) fillRow(r, PAGE_BG);
    const num = info.getCell(r, 1);
    num.value = i + 1;
    num.font = { bold: true, color: { argb: SHEET_COLOR[PATIENT_SHEET_NAME] } };
    num.alignment = { horizontal: "center", vertical: "top" };
    const textCell = merge(2, COLS);
    textCell.value = step;
    textCell.alignment = { wrapText: true, vertical: "top" };
    r += 1;
  });
  r += 1;

  // Örnek doğru doldurulmuş satırlar — her sayfa için gerçek başlıklarıyla
  // birlikte küçük, kendi rengiyle boyanmış bir örnek tablo.
  const exHeader = merge(1, COLS);
  exHeader.value = "ÖRNEK DOĞRU DOLDURULMUŞ SATIRLAR (bilgi amaçlıdır, veri sayfalarına kopyalamanıza gerek yok)";
  exHeader.font = { bold: true, size: 12, color: { argb: TEXT_DARK } };
  r += 1;

  const COLUMN_SETS: Record<string, readonly ColumnDef[]> = {
    [PATIENT_SHEET_NAME]: PATIENT_COLUMNS,
    [PAYMENT_SHEET_NAME]: PAYMENT_COLUMNS,
    [TREATMENT_SHEET_NAME]: TREATMENT_COLUMNS,
    [PRESCRIPTION_SHEET_NAME]: PRESCRIPTION_COLUMNS,
  };

  for (const meta of SHEET_META) {
    const color = SHEET_COLOR[meta.name as keyof typeof SHEET_COLOR];
    const label = merge(1, COLS);
    label.value = `${meta.icon}  ${meta.title}`;
    label.font = { bold: true, size: 11, color: { argb: color } };
    r += 1;

    const cols = COLUMN_SETS[meta.name];
    const example = EXAMPLE_ROWS[meta.name];
    // Talimatlar sayfası sadece 8 sütun genişliğinde — hasta sayfası 23 sütun
    // olduğu için ilk birkaç anahtar alanı gösterip kalanını "..." ile özetliyoruz.
    const shown = Math.min(cols.length, COLS);
    for (let c = 0; c < shown; c += 1) {
      const headerCell = info.getCell(r, c + 1);
      headerCell.value = cols[c].header.replace("*", "");
      headerCell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      headerCell.alignment = { horizontal: "center", wrapText: true };
    }
    r += 1;
    for (let c = 0; c < shown; c += 1) {
      const valueCell = info.getCell(r, c + 1);
      valueCell.value = c === shown - 1 && cols.length > COLS ? `${example[c]} ...` : example[c];
      valueCell.font = { size: 10 };
      valueCell.alignment = { horizontal: "center" };
      valueCell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    }
    r += 2;
  }

  const note = merge(1, COLS);
  note.value = "Sorularınız için süperadmin ile iletişime geçebilirsiniz.";
  note.font = { italic: true, size: 10, color: { argb: TEXT_MUTED } };

  const MAX_ROWS = 500;
  writeDataSheet(workbook, PATIENT_SHEET_NAME, "🧑‍⚕️", PATIENT_COLUMNS, [], MAX_ROWS);
  writeDataSheet(workbook, PAYMENT_SHEET_NAME, "💳", PAYMENT_COLUMNS, doctorNames, MAX_ROWS);
  writeDataSheet(workbook, TREATMENT_SHEET_NAME, "🦷", TREATMENT_COLUMNS, doctorNames, MAX_ROWS);
  writeDataSheet(workbook, PRESCRIPTION_SHEET_NAME, "💊", PRESCRIPTION_COLUMNS, doctorNames, MAX_ROWS);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function getByKey<C extends readonly ColumnDef[]>(row: ExcelJS.Row, columns: C, key: string): ExcelJS.CellValue {
  const idx = columns.findIndex((c) => c.key === key) + 1;
  return row.getCell(idx).value;
}

export async function parseImportWorkbook(buffer: Buffer): Promise<ImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const patientSheet = workbook.getWorksheet(PATIENT_SHEET_NAME);
  const paymentSheet = workbook.getWorksheet(PAYMENT_SHEET_NAME);
  const treatmentSheet = workbook.getWorksheet(TREATMENT_SHEET_NAME);
  const prescriptionSheet = workbook.getWorksheet(PRESCRIPTION_SHEET_NAME);

  const patients: ParsedRow<PatientImportData>[] = [];
  const seenTc = new Set<string>();

  if (patientSheet) {
    patientSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // gezinme çubuğu + başlık satırı
      const get = (key: string) => getByKey(row, PATIENT_COLUMNS, key);

      const tcNo = cellText(get("tcNo"));
      const fullName = cellText(get("fullName"));
      const phone = cellText(get("phone"));
      if (!tcNo && !fullName && !phone) return; // tamamen boş satır — atla

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!/^\d{11}$/.test(tcNo)) errors.push("TC Kimlik No 11 haneli sayı olmalı");
      if (fullName.length < 3) errors.push("Ad Soyad zorunlu (en az 3 karakter)");
      const normalizedPhone = phone.replace(/\s+/g, "");
      if (!/^0\d{10}$/.test(normalizedPhone)) errors.push("Telefon 0XXXXXXXXXX formatında olmalı");

      const genderRaw = normalizeTrKey(cellText(get("gender")));
      const gender = GENDER_MAP[genderRaw] || "";
      if (!gender) errors.push("Cinsiyet 'Erkek' veya 'Kadın' olmalı");

      if (tcNo) {
        if (seenTc.has(tcNo)) errors.push("Bu TC Kimlik No dosyada birden fazla kez geçiyor");
        seenTc.add(tcNo);
      }

      const birthDateParsed = parseTurkishDate(get("birthDate"));
      if (get("birthDate") && cellText(get("birthDate")) && !birthDateParsed) {
        warnings.push("Doğum tarihi tanınamadı (GG.AA.YYYY bekleniyor), boş bırakıldı");
      }

      const discountRaw = get("discountRate");
      let discountRate = 0;
      if (discountRaw !== null && discountRaw !== undefined && cellText(discountRaw) !== "") {
        const n = Number(cellText(discountRaw));
        if (Number.isFinite(n) && n >= 0 && n <= 100) discountRate = Math.round(n);
        else warnings.push("İskonto oranı 0-100 arası olmalı, 0 kabul edildi");
      }

      const data: PatientImportData = {
        tcNo,
        fullName,
        phone: normalizedPhone,
        gender: gender || "ERKEK",
        birthDate: birthDateParsed ? birthDateParsed.toISOString() : null,
        address: cellText(get("address")) || null,
        profession: cellText(get("profession")) || null,
        insurance: cellText(get("insurance")) || null,
        discountRate,
        bloodType: cellText(get("bloodType")) || null,
        notes: cellText(get("notes")) || null,
        hasAllergy: yesNoToBoolean(get("hasAllergy")),
        hasHepatitis: yesNoToBoolean(get("hasHepatitis")),
        hasKidney: yesNoToBoolean(get("hasKidney")),
        hasDiabetes: yesNoToBoolean(get("hasDiabetes")),
        hasHeart: yesNoToBoolean(get("hasHeart")),
        hasBloodIssue: yesNoToBoolean(get("hasBloodIssue")),
        hasContagiousDisease: yesNoToBoolean(get("hasContagiousDisease")),
        contagiousDiseaseNote: cellText(get("contagiousDiseaseNote")) || null,
        medications: cellText(get("medications")) || null,
        surgeries: cellText(get("surgeries")) || null,
        otherDiseases: cellText(get("otherDiseases")) || null,
        referrer: cellText(get("referrer")) || null,
      };

      patients.push({ rowNumber, data: errors.length === 0 ? data : null, errors, warnings });
    });
  }

  const payments: ParsedRow<PaymentImportData>[] = [];
  if (paymentSheet) {
    paymentSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // gezinme çubuğu + başlık satırı
      const get = (key: string) => getByKey(row, PAYMENT_COLUMNS, key);

      const patientTcNo = cellText(get("patientTcNo"));
      const dateRaw = get("date");
      const amountRaw = get("amount");
      if (!patientTcNo && !cellText(dateRaw) && !cellText(amountRaw)) return; // boş satır

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!/^\d{11}$/.test(patientTcNo)) errors.push("Hasta TC Kimlik No 11 haneli olmalı");

      const date = parseTurkishDate(dateRaw);
      if (!date) errors.push("Tarih GG.AA.YYYY formatında olmalı");

      const amount = Number(cellText(amountRaw).replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) errors.push("Tutar geçerli bir pozitif sayı olmalı");

      const methodRaw = normalizeTrKey(cellText(get("method")));
      const method = methodRaw ? (PAYMENT_METHOD_MAP[methodRaw] || null) : "NAKIT";
      if (methodRaw && !method) warnings.push(`Ödeme yöntemi "${cellText(get("method"))}" tanınamadı, "Diğer" kabul edildi`);

      const doctorName = cellText(get("doctorName")) || null;

      const data: PaymentImportData = {
        patientTcNo,
        date: date ? date.toISOString() : "",
        amount: Number.isFinite(amount) ? amount : 0,
        method: method || "DIGER",
        doctorName,
        description: cellText(get("description")) || null,
      };

      payments.push({ rowNumber, data: errors.length === 0 ? data : null, errors, warnings });
    });
  }

  const treatments: ParsedRow<TreatmentImportData>[] = [];
  if (treatmentSheet) {
    treatmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // gezinme çubuğu + başlık satırı
      const get = (key: string) => getByKey(row, TREATMENT_COLUMNS, key);

      const patientTcNo = cellText(get("patientTcNo"));
      const treatmentName = cellText(get("treatmentName"));
      const dateRaw = get("date");
      if (!patientTcNo && !treatmentName && !cellText(dateRaw)) return; // boş satır

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!/^\d{11}$/.test(patientTcNo)) errors.push("Hasta TC Kimlik No 11 haneli olmalı");

      const date = parseTurkishDate(dateRaw);
      if (!date) errors.push("Tarih GG.AA.YYYY formatında olmalı");

      if (treatmentName.length < 2) errors.push("Tedavi Adı zorunlu");

      const doctorName = cellText(get("doctorName"));
      if (!doctorName) errors.push("Doktor Adı Soyadı zorunlu (tedavi kaydı bir doktora bağlı olmalı)");

      const amountRaw = get("amount");
      let amount = 0;
      if (cellText(amountRaw) !== "") {
        const n = Number(cellText(amountRaw).replace(",", "."));
        if (Number.isFinite(n) && n >= 0) amount = n;
        else warnings.push("Tutar tanınamadı, 0 kabul edildi");
      }

      const statusRaw = normalizeTrKey(cellText(get("status")));
      const status = statusRaw ? (TREATMENT_STATUS_MAP[statusRaw] || null) : "TAMAMLANDI";
      if (statusRaw && !status) warnings.push(`Durum "${cellText(get("status"))}" tanınamadı, "Tamamlandı" kabul edildi`);

      const data: TreatmentImportData = {
        patientTcNo,
        date: date ? date.toISOString() : "",
        treatmentName,
        doctorName,
        toothNo: cellText(get("toothNo")) || null,
        amount,
        status: status || "TAMAMLANDI",
        note: cellText(get("note")) || null,
      };

      treatments.push({ rowNumber, data: errors.length === 0 ? data : null, errors, warnings });
    });
  }

  const prescriptions: ParsedRow<PrescriptionImportData>[] = [];
  if (prescriptionSheet) {
    prescriptionSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // gezinme çubuğu + başlık satırı
      const get = (key: string) => getByKey(row, PRESCRIPTION_COLUMNS, key);

      const patientTcNo = cellText(get("patientTcNo"));
      const drugs = cellText(get("drugs"));
      const dateRaw = get("date");
      if (!patientTcNo && !drugs && !cellText(dateRaw)) return; // boş satır

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!/^\d{11}$/.test(patientTcNo)) errors.push("Hasta TC Kimlik No 11 haneli olmalı");

      const date = parseTurkishDate(dateRaw);
      if (!date) errors.push("Tarih GG.AA.YYYY formatında olmalı");

      if (drugs.length < 2) errors.push("İlaçlar zorunlu");

      const data: PrescriptionImportData = {
        patientTcNo,
        date: date ? date.toISOString() : "",
        drugs,
        doctorName: cellText(get("doctorName")) || null,
        note: cellText(get("note")) || null,
      };

      prescriptions.push({ rowNumber, data: errors.length === 0 ? data : null, errors, warnings });
    });
  }

  return { patients, payments, treatments, prescriptions };
}
