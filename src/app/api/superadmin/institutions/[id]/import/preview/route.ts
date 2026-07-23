import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeTrKey, parseImportWorkbook, type ParsedRow } from "@/lib/patient-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — bu boyuttaki bir tablo binlerce satır alır, yeterli.

type RowWithPatientDoctor = { patientTcNo: string; doctorName?: string | null };

function crossCheck<T extends RowWithPatientDoctor>(
  rows: ParsedRow<T>[],
  allKnownTc: Set<string>,
  knownDoctorNames: Set<string>,
  unmatchedPatientMessage: (tc: string) => string
) {
  const warnings: { rowNumber: number; message: string }[] = [];
  let unmatchedPatient = 0;
  let unmatchedDoctor = 0;
  for (const row of rows) {
    if (!row.data) continue;
    if (!allKnownTc.has(row.data.patientTcNo)) {
      unmatchedPatient += 1;
      warnings.push({ rowNumber: row.rowNumber, message: unmatchedPatientMessage(row.data.patientTcNo) });
    }
    if (row.data.doctorName && !knownDoctorNames.has(normalizeTrKey(row.data.doctorName))) {
      unmatchedDoctor += 1;
    }
  }
  return { warnings, unmatchedPatient, unmatchedDoctor };
}

function rowWarnings<T>(rows: ParsedRow<T>[]) {
  return rows.filter((r) => r.warnings.length > 0).slice(0, 100).map((r) => ({ rowNumber: r.rowNumber, errors: r.warnings }));
}

function rowErrors<T>(rows: ParsedRow<T>[]) {
  return rows.filter((r) => r.errors.length > 0).slice(0, 100).map((r) => ({ rowNumber: r.rowNumber, errors: r.errors }));
}

// POST /api/superadmin/institutions/[id]/import/preview
// Yüklenen dosyayı ayrıştırır ve DOĞRULAR ama HİÇBİR ŞEY YAZMAZ — süperadmin
// "Onayla" demeden önce kaç kayıt ekleneceğini, kaçının zaten var olduğunu ve
// hangi satırlarda hata olduğunu görür.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!institution) return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Dosya bulunamadı" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ message: "Dosya çok büyük (maks. 5MB)" }, { status: 400 });
  }

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = await parseImportWorkbook(buffer);
  } catch (error) {
    console.error("[import preview]", error);
    return NextResponse.json({ message: "Dosya okunamadı — geçerli bir .xlsx şablonu olduğundan emin olun" }, { status: 400 });
  }

  const validPatientRows = parsed.patients.filter((r) => r.data);
  const fileTcNos = validPatientRows.map((r) => r.data!.tcNo);

  const existingPatients = fileTcNos.length
    ? await prisma.patient.findMany({
        where: { institutionId: params.id, tcNo: { in: fileTcNos } },
        select: { tcNo: true },
      })
    : [];
  const existingTcSet = new Set(existingPatients.map((p) => p.tcNo));
  const allKnownTc = new Set([...fileTcNos, ...existingTcSet]);

  const doctorRows = await prisma.user.findMany({
    where: { institutionId: params.id, isActive: true, role: { in: ["DOKTOR", "YONETICI"] } },
    select: { fullName: true },
  });
  const knownDoctorNames = new Set(doctorRows.map((d) => normalizeTrKey(d.fullName)));

  const validPaymentRows = parsed.payments.filter((r) => r.data);
  const validTreatmentRows = parsed.treatments.filter((r) => r.data);
  const validPrescriptionRows = parsed.prescriptions.filter((r) => r.data);

  const paymentCheck = crossCheck(parsed.payments, allKnownTc, knownDoctorNames, (tc) => `Hasta TC ${tc} ne dosyada ne de kurum kayıtlarında bulunamadı — bu ödeme satırı atlanacak`);
  const treatmentCheck = crossCheck(parsed.treatments, allKnownTc, knownDoctorNames, (tc) => `Hasta TC ${tc} ne dosyada ne de kurum kayıtlarında bulunamadı — bu tedavi satırı atlanacak`);
  const prescriptionCheck = crossCheck(parsed.prescriptions, allKnownTc, knownDoctorNames, (tc) => `Hasta TC ${tc} ne dosyada ne de kurum kayıtlarında bulunamadı — bu reçete satırı atlanacak`);

  // Tedavi kaydı doktora ZORUNLU bağlıdır (TreatmentPlan.doctorId nullable değil) —
  // dosyada yazılan doktor adı kurum personeliyle eşleşmezse satır aktarılamaz,
  // bu yüzden "eşleşmeyen doktor" burada uyarı değil gerçek bir hata sayılır.
  let treatmentsUnresolvedDoctor = 0;
  for (const row of validTreatmentRows) {
    if (!knownDoctorNames.has(normalizeTrKey(row.data!.doctorName))) treatmentsUnresolvedDoctor += 1;
  }

  return NextResponse.json({
    summary: {
      patientsTotal: parsed.patients.length,
      patientsNew: validPatientRows.filter((r) => !existingTcSet.has(r.data!.tcNo)).length,
      patientsExisting: validPatientRows.filter((r) => existingTcSet.has(r.data!.tcNo)).length,
      patientsInvalid: parsed.patients.length - validPatientRows.length,

      paymentsTotal: parsed.payments.length,
      paymentsValid: validPaymentRows.length - paymentCheck.unmatchedPatient,
      paymentsInvalid: parsed.payments.length - validPaymentRows.length,
      paymentsUnmatchedPatient: paymentCheck.unmatchedPatient,
      paymentsUnmatchedDoctor: paymentCheck.unmatchedDoctor,

      treatmentsTotal: parsed.treatments.length,
      treatmentsValid: validTreatmentRows.length - treatmentCheck.unmatchedPatient - treatmentsUnresolvedDoctor,
      treatmentsInvalid: parsed.treatments.length - validTreatmentRows.length,
      treatmentsUnmatchedPatient: treatmentCheck.unmatchedPatient,
      treatmentsUnresolvedDoctor: treatmentsUnresolvedDoctor,

      prescriptionsTotal: parsed.prescriptions.length,
      prescriptionsValid: validPrescriptionRows.length - prescriptionCheck.unmatchedPatient,
      prescriptionsInvalid: parsed.prescriptions.length - validPrescriptionRows.length,
      prescriptionsUnmatchedPatient: prescriptionCheck.unmatchedPatient,
    },
    patientErrors: rowErrors(parsed.patients),
    paymentErrors: rowErrors(parsed.payments),
    treatmentErrors: rowErrors(parsed.treatments),
    prescriptionErrors: rowErrors(parsed.prescriptions),
    patientRowWarnings: rowWarnings(parsed.patients),
    paymentRowWarnings: rowWarnings(parsed.payments),
    treatmentRowWarnings: rowWarnings(parsed.treatments),
    prescriptionRowWarnings: rowWarnings(parsed.prescriptions),
    paymentWarnings: paymentCheck.warnings.slice(0, 100),
    treatmentWarnings: treatmentCheck.warnings.slice(0, 100),
    prescriptionWarnings: prescriptionCheck.warnings.slice(0, 100),
  });
}
