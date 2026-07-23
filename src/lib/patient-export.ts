import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import {
  PATIENT_SHEET_NAME,
  PAYMENT_SHEET_NAME,
  TREATMENT_SHEET_NAME,
  PRESCRIPTION_SHEET_NAME,
  PATIENT_COLUMNS,
  PAYMENT_COLUMNS,
  TREATMENT_COLUMNS,
  PRESCRIPTION_COLUMNS,
  SHEET_COLOR,
} from "@/lib/patient-import";

// Toplu içe aktarımın (patient-import.ts) tam tersi: bir kliniğin kendi
// verisini (hasta + ödeme + tedavi + reçete geçmişi) aynı sütun şemasıyla
// Excel olarak dışa aktarır. Aynı sütun tanımlarını yeniden kullanmak,
// import ile export'un zamanla birbirinden sapmasını (biri güncellenip
// diğerinin unutulması) engeller — ve dışa aktarılan dosya, istenirse aynı
// şablona tekrar yüklenebilir (round-trip uyumlu).

function fmtDate(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

const YES_NO = (b: boolean) => (b ? "Evet" : "Hayır");
const GENDER_LABEL: Record<string, string> = { ERKEK: "Erkek", KADIN: "Kadın" };
const METHOD_LABEL: Record<string, string> = { NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE_EFT: "Havale/EFT", DIGER: "Diğer", MAIL_ORDER: "Diğer" };
const STATUS_LABEL: Record<string, string> = { TAMAMLANDI: "Tamamlandı", DEVAM_EDIYOR: "Devam Ediyor", PLANLANDI: "Planlandı", IPTAL: "İptal" };

function writeSheet(workbook: ExcelJS.Workbook, name: string, columns: readonly { header: string; width: number }[], rows: unknown[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ width: c.width }));
  const color = SHEET_COLOR[name as keyof typeof SHEET_COLOR];

  const headerRow = sheet.getRow(1);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header.replace("*", "");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 26;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((row) => sheet.addRow(row));
  return sheet;
}

export async function buildExportWorkbook(institutionId: string): Promise<{ buffer: Buffer; institutionName: string } | null> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true, name: true } });
  if (!institution) return null;

  const [patients, doctors] = await Promise.all([
    prisma.patient.findMany({ where: { institutionId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { institutionId }, select: { id: true, fullName: true } }),
  ]);
  const doctorNameById = new Map(doctors.map((d) => [d.id, d.fullName]));
  const patientIds = patients.map((p) => p.id);

  const [payments, treatmentSteps, prescriptions] = await Promise.all([
    patientIds.length
      ? prisma.payment.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "asc" } })
      : [],
    patientIds.length
      ? prisma.treatmentStep.findMany({
          where: { plan: { patientId: { in: patientIds } } },
          include: { plan: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    patientIds.length
      ? prisma.prescription.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "asc" } })
      : [],
  ]);

  const patientById = new Map(patients.map((p) => [p.id, p]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Klinik Yönetim Paneli";
  workbook.created = new Date();

  writeSheet(
    workbook,
    PATIENT_SHEET_NAME,
    PATIENT_COLUMNS,
    patients.map((p) => [
      p.tcNo,
      p.fullName,
      p.phone,
      GENDER_LABEL[p.gender] || p.gender,
      fmtDate(p.birthDate),
      p.address || "",
      p.profession || "",
      p.insurance || "",
      p.discountRate,
      p.bloodType || "",
      p.notes || "",
      YES_NO(p.hasAllergy),
      YES_NO(p.hasHepatitis),
      YES_NO(p.hasKidney),
      YES_NO(p.hasDiabetes),
      YES_NO(p.hasHeart),
      YES_NO(p.hasBloodIssue),
      YES_NO(p.hasContagiousDisease),
      p.contagiousDiseaseNote || "",
      p.medications || "",
      p.surgeries || "",
      p.otherDiseases || "",
      p.referrer || "",
    ])
  );

  writeSheet(
    workbook,
    PAYMENT_SHEET_NAME,
    PAYMENT_COLUMNS,
    payments
      .filter((pay) => pay.patientId && patientById.has(pay.patientId))
      .map((pay) => [
        patientById.get(pay.patientId!)!.tcNo,
        fmtDate(pay.createdAt),
        Number(pay.amount),
        METHOD_LABEL[pay.method] || pay.method,
        pay.doctorId ? doctorNameById.get(pay.doctorId) || "" : "",
        pay.description || "",
      ])
  );

  writeSheet(
    workbook,
    TREATMENT_SHEET_NAME,
    TREATMENT_COLUMNS,
    treatmentSteps
      .filter((step) => patientById.has(step.plan.patientId))
      .map((step) => [
        patientById.get(step.plan.patientId)!.tcNo,
        fmtDate(step.createdAt),
        step.treatmentName,
        doctorNameById.get(step.plan.doctorId) || "",
        step.toothNo || "",
        Number(step.amount),
        STATUS_LABEL[step.plan.status] || step.plan.status,
        step.note || "",
      ])
  );

  writeSheet(
    workbook,
    PRESCRIPTION_SHEET_NAME,
    PRESCRIPTION_COLUMNS,
    prescriptions.map((rx) => [
      patientById.get(rx.patientId)?.tcNo || "",
      fmtDate(rx.createdAt),
      rx.drugs,
      rx.doctorId ? doctorNameById.get(rx.doctorId) || "" : "",
      rx.note || "",
    ])
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), institutionName: institution.name };
}
