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

function writeDataSheet(workbook: ExcelJS.Workbook, name: string, columns: readonly ColumnDef[], doctorNames: string[], maxRows: number) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell, colNumber) => {
    const col = columns[colNumber - 1];
    cell.font = { bold: true, color: { argb: col.required ? "FFFFFFFF" : "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? "FFB91C1C" : "FFE2E8F0" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  // Başlık satırı kayarken hep görünür kalsın — yüzlerce satırlık bir tabloda
  // hangi sütunun ne olduğunu unutmamak için önemli.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const doctorList = doctorNames.length > 0 ? doctorNames : ["(kayıtlı doktor yok)"];
  columns.forEach((col, idx) => {
    const colLetter = sheet.getColumn(idx + 1).letter;
    const list = col.doctorList ? doctorList : col.list ? (col.list as unknown as string[]) : null;
    for (let r = 2; r <= maxRows + 1; r += 1) {
      const cell = sheet.getCell(`${colLetter}${r}`);
      if (col.textFormat) cell.numFmt = "@";
      if (list) {
        cell.dataValidation = { type: "list", allowBlank: !col.required, formulae: [`"${list.join(",")}"`] };
      }
    }
  });

  return sheet;
}

// Şablonu, bu kurumun mevcut doktor listesiyle üretir — "Doktor Adı Soyadı"
// alanı böylece serbest metin yerine gerçek isimlerden seçilen bir açılır
// liste olur (yazım hatası riskini ortadan kaldırır).
export async function buildImportWorkbook(doctorNames: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Klinik Yönetim Paneli";
  workbook.created = new Date();

  const info = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  info.columns = [{ width: 6 }, { width: 100 }];
  let r = 1;
  const writeLine = (text: string, opts?: Partial<ExcelJS.Font>) => {
    const cell = info.getCell(r, 2);
    cell.value = text;
    if (opts) cell.font = opts;
    cell.alignment = { wrapText: true, vertical: "top" };
    r += 1;
  };
  writeLine("HASTA, ÖDEME, TEDAVİ VE REÇETE GEÇMİŞİ AKTARIM ŞABLONU", { bold: true, size: 14 });
  r += 1;
  writeLine("Bu dosyada 4 veri sayfası var: Hastalar, Odeme Gecmisi, Tedavi Gecmisi, Recete Gecmisi. Hepsini doldurmak zorunlu değil — sadece elinizde olan veriyi girin, kalanı boş bırakın.", { size: 11 });
  r += 1;
  writeLine("NASIL DOLDURULUR", { bold: true, size: 12 });
  writeLine("1) Kırmızı başlıklı sütunlar ZORUNLUDUR, gri başlıklı sütunlar isteğe bağlıdır — boş bırakılabilir.");
  writeLine("2) Açılır listesi (▾ ok işareti) olan hücrelerde SADECE listeden seçim yapın, serbest metin yazmayın.");
  writeLine("3) 'Odeme Gecmisi', 'Tedavi Gecmisi' ve 'Recete Gecmisi' sayfalarındaki 'Hasta TC Kimlik No' sütunu, 'Hastalar' sayfasında girdiğiniz bir TC ile birebir aynı olmalıdır.");
  writeLine("4) Tarih sütunlarını GG.AA.YYYY biçiminde girin (örnek: 15.03.2023).");
  writeLine("5) TC Kimlik No ve Telefon sütunları 'Metin' biçimindedir — başında 0 olan numaralar bu sayede kaybolmaz, farklı bir biçime çevirmeyin.");
  writeLine("6) Doldurduğunuz dosyayı süperadmine iletin veya Klinikler > İlgili Klinik > Toplu Veri Aktarımı ekranından yükleyin.");
  writeLine("7) Yükleme önce bir ÖNİZLEME gösterir — hiçbir kayıt yazılmadan önce kaç kayıt ekleneceğini ve varsa hataları görürsünüz. Hatalı satırlar olsa bile geçerli satırlar aktarılabilir.");
  r += 1;
  writeLine("ÖRNEK DOĞRU DOLDURULMUŞ SATIRLAR", { bold: true, size: 12 });
  writeLine("Hastalar: 12345678901 | Ayşe Yılmaz | 05551112233 | Kadın | 15.03.1985 | ... (kalan sütunlar boş bırakılabilir)");
  writeLine("Odeme Gecmisi: 12345678901 | 10.01.2024 | 1500 | Nakit | Dr. Mehmet Öz | Kanal tedavisi ödemesi");
  writeLine("Tedavi Gecmisi: 12345678901 | 10.01.2024 | Kanal Tedavisi | Dr. Mehmet Öz | 36 | 2500 | Tamamlandı | ");
  writeLine("Recete Gecmisi: 12345678901 | 10.01.2024 | Augmentin 1000mg 2x1 | Dr. Mehmet Öz | ");
  r += 1;
  writeLine("Not: Bu örnek satırlar sadece bilgi amaçlıdır, veri sayfalarına kopyalamanıza gerek yoktur.", { italic: true, color: { argb: "FF64748B" } });

  const MAX_ROWS = 500;
  const patientSheet = writeDataSheet(workbook, PATIENT_SHEET_NAME, PATIENT_COLUMNS, [], MAX_ROWS);
  const paymentSheet = writeDataSheet(workbook, PAYMENT_SHEET_NAME, PAYMENT_COLUMNS, doctorNames, MAX_ROWS);
  const treatmentSheet = writeDataSheet(workbook, TREATMENT_SHEET_NAME, TREATMENT_COLUMNS, doctorNames, MAX_ROWS);
  const prescriptionSheet = writeDataSheet(workbook, PRESCRIPTION_SHEET_NAME, PRESCRIPTION_COLUMNS, doctorNames, MAX_ROWS);
  void patientSheet; void paymentSheet; void treatmentSheet; void prescriptionSheet;

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
      if (rowNumber === 1) return; // başlık satırı
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
      if (rowNumber === 1) return;
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
      if (rowNumber === 1) return;
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
      if (rowNumber === 1) return;
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
