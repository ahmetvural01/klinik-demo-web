import ExcelJS from "exceljs";

// Klinik geçmiş verilerini (hasta + ödeme geçmişi) toplu aktarma şablonu ve
// ayrıştırıcısı. Süperadmin bu şablonu klinik için indirir, klinik doldurur,
// süperadmin panelden yükler — önce önizleme (hiçbir yazma yok), sonra onay
// ile gerçek kayıt. Bkz. src/app/api/superadmin/institutions/[id]/import/*.

export const PATIENT_SHEET_NAME = "Hastalar";
export const PAYMENT_SHEET_NAME = "Odeme Gecmisi";
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

// Sütun sırası şablon ile ayrıştırıcı arasında birebir aynı olmalı — sıra
// değişirse mevcut doldurulmuş dosyalar yanlış sütuna eşlenir.
export const PATIENT_COLUMNS = [
  { key: "tcNo", header: "TC Kimlik No*", required: true, width: 16 },
  { key: "fullName", header: "Ad Soyad*", required: true, width: 24 },
  { key: "phone", header: "Telefon* (0XXXXXXXXXX)", required: true, width: 18 },
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
  { key: "patientTcNo", header: "Hasta TC Kimlik No*", required: true, width: 16 },
  { key: "date", header: "Tarih* (GG.AA.YYYY)", required: true, width: 16 },
  { key: "amount", header: "Tutar*", required: true, width: 12 },
  { key: "method", header: "Ödeme Yöntemi", required: false, width: 16, list: PAYMENT_METHOD_OPTIONS as unknown as string[] },
  { key: "doctorName", header: "Doktor Adı Soyadı", required: false, width: 22 },
  { key: "description", header: "Açıklama", required: false, width: 26 },
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

export type ParsedRow<T> = { rowNumber: number; data: T | null; errors: string[]; warnings: string[] };

export type ImportParseResult = {
  patients: ParsedRow<PatientImportData>[];
  payments: ParsedRow<PaymentImportData>[];
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

// Şablonu, bu kurumun mevcut doktor listesiyle üretir — "Doktor Adı Soyadı"
// alanı böylece serbest metin yerine gerçek isimlerden seçilen bir açılır
// liste olur (yazım hatası riskini ortadan kaldırır).
export async function buildImportWorkbook(doctorNames: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Klinik Yönetim Paneli";
  workbook.created = new Date();

  const info = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  info.columns = [{ width: 100 }];
  const lines = [
    "HASTA VE ÖDEME GEÇMİŞİ AKTARIM ŞABLONU",
    "",
    "1) 'Hastalar' sayfasına mevcut hastalarınızın bilgilerini girin. Yıldızlı (*) alanlar zorunludur, diğerleri boş bırakılabilir.",
    "2) 'Odeme Gecmisi' sayfasına (varsa) geçmiş ödeme kayıtlarını girin. Hasta TC Kimlik No, 'Hastalar' sayfasındaki bir TC ile eşleşmelidir.",
    "3) Dropdown (açılır liste) olan sütunlarda sadece listeden seçim yapın — serbest metin yazmayın.",
    "4) Bilmediğiniz/elinizde olmayan bilgileri boş bırakabilirsiniz, sistemde o alan boş olarak kalır.",
    "5) Doldurduğunuz dosyayı süperadmine iletin veya doğrudan Klinikler > İlgili Klinik > Toplu Veri Aktarımı ekranından yükleyin.",
    "6) Yükleme önce bir ÖNİZLEME gösterir — hiçbir şey kaydedilmeden önce kaç kayıt ekleneceğini ve varsa hataları görürsünüz.",
  ];
  lines.forEach((line, i) => { info.getCell(i + 1, 1).value = line; });
  info.getCell(1, 1).font = { bold: true, size: 13 };

  const patientSheet = workbook.addWorksheet(PATIENT_SHEET_NAME);
  patientSheet.columns = PATIENT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  patientSheet.getRow(1).font = { bold: true };
  patientSheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  const paymentSheet = workbook.addWorksheet(PAYMENT_SHEET_NAME);
  paymentSheet.columns = PAYMENT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  paymentSheet.getRow(1).font = { bold: true };
  paymentSheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  // Açılır liste (dropdown) doğrulamaları — 500 satıra kadar, gerçekçi bir üst sınır.
  const MAX_ROWS = 500;
  PATIENT_COLUMNS.forEach((col, idx) => {
    if (!("list" in col) || !col.list) return;
    const colLetter = patientSheet.getColumn(idx + 1).letter;
    for (let r = 2; r <= MAX_ROWS + 1; r += 1) {
      patientSheet.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: !col.required,
        formulae: [`"${(col.list as unknown as string[]).join(",")}"`],
      };
    }
  });

  const doctorList = doctorNames.length > 0 ? doctorNames : ["(kayıtlı doktor yok)"];
  PAYMENT_COLUMNS.forEach((col, idx) => {
    const colLetter = paymentSheet.getColumn(idx + 1).letter;
    const list = col.key === "doctorName" ? doctorList : ("list" in col ? (col.list as unknown as string[]) : null);
    if (!list) return;
    for (let r = 2; r <= MAX_ROWS + 1; r += 1) {
      paymentSheet.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${list.join(",")}"`],
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseImportWorkbook(buffer: Buffer): Promise<ImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const patientSheet = workbook.getWorksheet(PATIENT_SHEET_NAME);
  const paymentSheet = workbook.getWorksheet(PAYMENT_SHEET_NAME);

  const patients: ParsedRow<PatientImportData>[] = [];
  const seenTc = new Set<string>();

  if (patientSheet) {
    patientSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // başlık satırı
      const get = (key: (typeof PATIENT_COLUMNS)[number]["key"]) => {
        const idx = PATIENT_COLUMNS.findIndex((c) => c.key === key) + 1;
        return row.getCell(idx).value;
      };

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
      const get = (key: (typeof PAYMENT_COLUMNS)[number]["key"]) => {
        const idx = PAYMENT_COLUMNS.findIndex((c) => c.key === key) + 1;
        return row.getCell(idx).value;
      };

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

  return { patients, payments };
}
