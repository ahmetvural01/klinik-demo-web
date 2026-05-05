import { z } from "zod";

export const loginSchema = z.object({
  institution: z.string().min(2),
  identityNo: z.string().min(5),
  password: z.string().min(6)
});

export const patientSchema = z.object({
  tcNo: z.string().min(11).max(11),
  fullName: z.string().min(3),
  phone: z.string().regex(/^0\d{10}$/, "Telefon 11 haneli olmalı ve 0 ile başlamalı"),
  address: z.string().optional(),
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
  patientId: z.string().min(1).optional(),
  doctorId: z.string().optional(),
  posId: z.string().optional(),
  method: z.enum(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]).default("NAKIT"),
  amount: z.number().min(0),
  description: z.string().optional()
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
