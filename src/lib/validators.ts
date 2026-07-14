import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);
const emptyToNull = (value: unknown) => (value === "" || value === undefined ? null : value);

const optionalTrimmed = (max = 500) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalNullableTrimmed = (max = 500) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const optionalDateString = z.preprocess(
  emptyToUndefined,
  z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Geçerli bir tarih girin").optional(),
);

const optionalNullableDateString = z.preprocess(
  emptyToNull,
  z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Geçerli bir tarih girin").nullable(),
);

export function formatZodError(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "veri";
    return `${path}: ${issue.message}`;
  });
}

export const loginSchema = z.object({
  institution: z.string().trim().min(2),
  identityNo: z.string().trim().min(5),
  password: z.string().min(6)
});

export const patientSchema = z.object({
  tcNo: z.string().min(11).max(11),
  fullName: z.string().min(3),
  phone: z.string().regex(/^0\d{10}$/, "Telefon 11 haneli olmalı ve 0 ile başlamalı"),
  address: z.string().optional(),
  profession: z.string().trim().max(120).optional(),
  gender: z.string().min(1),
  birthDate: z.string().optional(),
  insurance: z.string().optional(),
  referrer: z.string().optional(),
  discountRate: z.number().int().min(0).max(100).default(0),
  notes: z.string().optional(),
  surgeries: z.string().optional(),
  medications: z.string().optional(),
  otherDiseases: z.string().optional(),
  hasAllergy: z.boolean().default(false),
  hasHepatitis: z.boolean().default(false),
  hasKidney: z.boolean().default(false),
  hasDiabetes: z.boolean().default(false),
  hasHeart: z.boolean().default(false),
  hasBloodIssue: z.boolean().default(false),
  hasContagiousDisease: z.boolean().default(false),
  contagiousDiseaseNote: z.string().trim().max(200).optional(),
  bloodType: z.string().optional(),
  toothChart: z.string().optional()
});

export const appointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  colorCode: z.string().default("#2a9d8f"),
  note: z.string().optional(),
  type: z.enum(["STANDART", "KONTROL", "ACIL"]).default("STANDART"),
  status: z.string().default("BEKLIYOR"),
  smsInfo: z.boolean().default(true),
  smsReminder: z.boolean().default(false),
  smsSurvey: z.boolean().default(false)
});

export const prescriptionSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().optional(),
  drugs: z.string().min(1),
  note: z.string().optional()
});

export const examinationSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  treatmentName: z.string().min(2),
  toothNo: z.string().optional(),
  amount: z.number().min(0),
  status: z.string().min(1),
  diagnosedAt: z.string().datetime(),
  note: z.string().optional()
});

export const paymentSchema = z.object({
  patientId: optionalTrimmed(80),
  doctorId: optionalTrimmed(80),
  posId: optionalTrimmed(80),
  method: z.enum(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]).default("NAKIT"),
  amount: z.coerce.number().finite().positive("Tutar 0'dan büyük olmalı"),
  description: optionalTrimmed(500),
  createdAt: optionalNullableDateString,
}).refine((data) => Boolean(data.patientId || data.doctorId), {
  // Sahipsiz (ne hastaya ne doktora bağlı) bir ödeme kaydı hangi kaynaktan
  // geldiği izlenemeyen bir kasa hareketi yaratır (bkz. denetim raporu Tema 1).
  message: "Ödeme bir hastaya veya doktora bağlı olmalı",
  path: ["patientId"],
});

export const stockItemCreateSchema = z.object({
  name: z.string().trim().min(2, "İsim en az 2 karakter olmalı").max(160),
  category: optionalTrimmed(80),
  unit: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(30).default("adet")),
  quantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  minQuantity: z.coerce.number().int().min(0).max(1_000_000).default(5),
  unitPrice: z.preprocess(emptyToNull, z.coerce.number().min(0).max(100_000_000).nullable()),
  supplier: optionalNullableTrimmed(160),
  barcode: optionalNullableTrimmed(80),
  expiresAt: optionalNullableDateString,
  storageLocation: optionalNullableTrimmed(80),
});

export const stockItemUpdateSchema = stockItemCreateSchema.omit({ quantity: true }).extend({
  minQuantity: z.coerce.number().int().min(0).max(1_000_000),
});

export const stockMovementSchema = z.object({
  type: z.enum(["GIRIS", "CIKIS"]),
  quantity: z.coerce.number().int().positive("Miktar pozitif olmalı").max(1_000_000),
  note: optionalTrimmed(500),
  supplier: optionalTrimmed(160),
  unitPrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100_000_000).optional()),
});

export const firmaCreateSchema = z.object({
  name: z.string().trim().min(2, "Firma adı en az 2 karakter olmalı").max(180),
  phone: optionalNullableTrimmed(40),
  iban: optionalNullableTrimmed(40),
  ibanName: optionalNullableTrimmed(120),
  notes: optionalNullableTrimmed(2000),
  kategori: z.enum(["TEDARICI", "HIZMET_SAGLAYICI", "LAB", "KONTRAKTOR", "BANK", "DIGER"]).default("TEDARICI"),
  paymentTerms: z.enum(["COD", "NET_15", "NET_30", "NET_60", "NET_90", "NET_120", "EOM", "CUSTOM"]).default("NET_30"),
  customPaymentDays: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(365).nullable()),
}).superRefine((data, ctx) => {
  if (data.paymentTerms === "CUSTOM" && data.customPaymentDays === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customPaymentDays"], message: "Özel vade için gün sayısı zorunlu" });
  }
});

export const firmaIslemCreateSchema = z.object({
  tarih: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Geçerli işlem tarihi girin"),
  islemTipi: z.enum(["ALIM", "HIZMET", "ODEME"]),
  urunHizmet: optionalNullableTrimmed(180),
  aciklama: optionalNullableTrimmed(1000),
  tutar: z.coerce.number().finite().positive("Tutar 0'dan büyük olmalı").max(100_000_000),
  faturaNo: optionalNullableTrimmed(80),
  yontem: z.preprocess(emptyToNull, z.enum(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]).nullable()),
  dueDate: optionalNullableDateString,
  kdvOrani: z.coerce.number().int().min(0).max(100).default(0),
  stockItemId: optionalNullableTrimmed(80),
  stockQuantity: z.preprocess(emptyToNull, z.coerce.number().int().positive().max(1_000_000).nullable()),
}).superRefine((data, ctx) => {
  if (data.islemTipi === "ODEME" && !data.yontem) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["yontem"], message: "Ödeme işlemlerinde yöntem zorunlu" });
  }
  if (data.islemTipi === "ALIM" && data.stockItemId && !data.stockQuantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stockQuantity"], message: "Stok kalemi seçildiyse miktar zorunlu" });
  }
});

const purchaseItemSchema = z.object({
  stockItemId: optionalNullableTrimmed(80),
  newProductName: optionalNullableTrimmed(180),
  category: optionalNullableTrimmed(60),
  unit: z.string().trim().max(20).default("adet"),
  quantity: z.coerce.number().int().positive("Miktar 0'dan büyük olmalı").max(1_000_000),
  unitPrice: z.coerce.number().finite().min(0).max(100_000_000),
}).superRefine((data, ctx) => {
  if (!data.stockItemId && !data.newProductName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stockItemId"], message: "Mevcut bir ürün seçin veya yeni ürün adı girin" });
  }
});

export const purchaseCreateSchema = z.object({
  firmaId: z.string().min(1, "Firma seçimi zorunlu"),
  tarih: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Geçerli işlem tarihi girin"),
  faturaNo: optionalNullableTrimmed(80),
  aciklama: optionalNullableTrimmed(1000),
  kdvOrani: z.coerce.number().int().min(0).max(100).default(0),
  items: z.array(purchaseItemSchema).min(1, "En az bir satır ekleyin").max(100),
  paidNow: z.boolean().default(false),
  paymentDate: optionalNullableDateString,
  paymentMethod: z.preprocess(emptyToNull, z.enum(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]).nullable()),
  paymentAmount: z.preprocess(emptyToNull, z.coerce.number().finite().positive("Ödeme tutarı 0'dan büyük olmalı").max(100_000_000).nullable()),
}).superRefine((data, ctx) => {
  const total = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!data.paidNow) return;
  if (!data.paymentMethod) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentMethod"], message: "Ödeme yapıldıysa ödeme yöntemi zorunlu" });
  }
  if (data.paymentAmount !== null && data.paymentAmount > total) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentAmount"], message: "Ödeme tutarı satın alma toplamını aşamaz" });
  }
});

export const purchaseUpdateSchema = z.object({
  tarih: optionalDateString,
  faturaNo: optionalNullableTrimmed(80),
  aciklama: optionalNullableTrimmed(1000),
  kdvOrani: z.coerce.number().int().min(0).max(100).optional(),
  items: z.array(z.object({
    id: optionalNullableTrimmed(80), // mevcut satır için PurchaseItem.id; yeni satırda boş
    stockItemId: optionalNullableTrimmed(80),
    newProductName: optionalNullableTrimmed(180),
    category: optionalNullableTrimmed(60),
    unit: z.string().trim().max(20).default("adet"),
    quantity: z.coerce.number().int().positive("Miktar 0'dan büyük olmalı").max(1_000_000),
    unitPrice: z.coerce.number().finite().min(0).max(100_000_000),
  })).min(1, "En az bir satır olmalı").max(100),
});

export const patientFollowUpCreateSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  doctorId: z.string().optional(),
  type: z.enum(["GERI_ARA", "ULASILAMADI", "DONUS_BEKLENIYOR", "DIGER"]),
  priority: z.number().int().min(1).max(3).default(2),
  note: z.string().max(2000).optional(),
  nextActionAt: z.string().datetime().optional(),
});

export const patientFollowUpUpdateSchema = z.object({
  type: z.enum(["GERI_ARA", "ULASILAMADI", "DONUS_BEKLENIYOR", "DIGER"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  status: z.enum(["ACIK", "KAPALI"]).optional(),
  note: z.string().max(2000).optional(),
  resolutionNote: z.string().max(2000).optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  lastContactAt: z.string().datetime().nullable().optional(),
  close: z.boolean().optional(),
});

export const patientFollowUpEventCreateSchema = z.object({
  occurredAt: z.string().datetime(),
  channel: z.string().max(60).optional(),
  summary: z.string().min(2).max(300),
  detail: z.string().max(3000).optional(),
  patientResponse: z.string().max(2000).optional(),
  nextStep: z.string().max(1000).optional(),
});

export const patientFollowUpEventUpdateSchema = z.object({
  occurredAt: z.string().datetime().optional(),
  channel: z.string().max(60).nullable().optional(),
  summary: z.string().min(2).max(300).optional(),
  detail: z.string().max(3000).nullable().optional(),
  patientResponse: z.string().max(2000).nullable().optional(),
  nextStep: z.string().max(1000).nullable().optional(),
});

export const clinicTaskCreateSchema = z.object({
  patientId: z.string().optional(),
  title: z.string().min(2).max(180),
  details: z.string().max(3000).optional(),
  vendorName: z.string().max(180).optional(),
  type: z.enum(["PARCA_SIPARIS", "LAB", "ARAMA", "EVRAK", "DIGER"]).default("DIGER"),
  priority: z.number().int().min(1).max(3).default(2),
  status: z.enum(["ACIK", "BEKLEMEDE", "TAMAMLANDI", "IPTAL"]).default("ACIK"),
  dueAt: z.string().datetime().optional(),
  remindAt: z.string().datetime().optional(),
  assignedToId: z.string().optional(),
  assignedToIds: z.array(z.string()).max(20).optional(),
});

export const publicBookingSchema = z.object({
  kurum: z.string().trim().min(1, "Kurum belirtilmedi"),
  fullName: z.string().trim().min(3, "Ad soyad zorunlu"),
  phone: z.string().trim().regex(/^0\d{10}$/, "Telefon 11 haneli olmalı ve 0 ile başlamalı"),
  tcNo: z.preprocess(emptyToNull, z.string().regex(/^\d{11}$/, "TC kimlik 11 haneli olmalı").nullable()),
  doctorId: z.preprocess(emptyToNull, z.string().nullable()),
  preferredFrom: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Geçersiz tarih"),
  note: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
});

export const clinicTaskUpdateSchema = z.object({
  title: z.string().min(2).max(180).optional(),
  details: z.string().max(3000).nullable().optional(),
  vendorName: z.string().max(180).nullable().optional(),
  type: z.enum(["PARCA_SIPARIS", "LAB", "ARAMA", "EVRAK", "DIGER"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  status: z.enum(["ACIK", "BEKLEMEDE", "TAMAMLANDI", "IPTAL"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  assignedToIds: z.array(z.string()).max(20).optional(),
  completedAt: z.string().datetime().nullable().optional(),
});
