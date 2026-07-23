import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseImportWorkbook } from "@/lib/patient-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — bu boyuttaki bir tablo binlerce satır alır, yeterli.

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

  const doctorRows = await prisma.user.findMany({
    where: { institutionId: params.id, isActive: true, role: { in: ["DOKTOR", "YONETICI"] } },
    select: { fullName: true },
  });
  const knownDoctorNames = new Set(doctorRows.map((d) => d.fullName.trim().toLocaleUpperCase("tr-TR")));

  const validPaymentRows = parsed.payments.filter((r) => r.data);
  const allKnownTc = new Set([...fileTcNos, ...existingTcSet]);

  const paymentWarnings: { rowNumber: number; message: string }[] = [];
  let paymentsWithUnmatchedPatient = 0;
  let paymentsWithUnmatchedDoctor = 0;
  for (const row of validPaymentRows) {
    if (!allKnownTc.has(row.data!.patientTcNo)) {
      paymentsWithUnmatchedPatient += 1;
      paymentWarnings.push({ rowNumber: row.rowNumber, message: `Hasta TC ${row.data!.patientTcNo} ne dosyada ne de kurum kayıtlarında bulunamadı — bu ödeme satırı atlanacak` });
    }
    if (row.data!.doctorName && !knownDoctorNames.has(row.data!.doctorName.trim().toLocaleUpperCase("tr-TR"))) {
      paymentsWithUnmatchedDoctor += 1;
    }
  }

  const patientErrorRows = parsed.patients.filter((r) => r.errors.length > 0).slice(0, 100);
  const paymentErrorRows = parsed.payments.filter((r) => r.errors.length > 0).slice(0, 100);

  // Ayrıştırıcının satır bazlı uyarıları (örn. "tarih tanınamadı", "ödeme yöntemi
  // tanınamadı") önceden hiç UI'ya taşınmıyordu — sessizce kayboluyordu.
  const patientRowWarnings = parsed.patients
    .filter((r) => r.warnings.length > 0)
    .slice(0, 100)
    .map((r) => ({ rowNumber: r.rowNumber, errors: r.warnings }));
  const paymentRowWarnings = parsed.payments
    .filter((r) => r.warnings.length > 0)
    .slice(0, 100)
    .map((r) => ({ rowNumber: r.rowNumber, errors: r.warnings }));

  return NextResponse.json({
    summary: {
      patientsTotal: parsed.patients.length,
      patientsNew: validPatientRows.filter((r) => !existingTcSet.has(r.data!.tcNo)).length,
      patientsExisting: validPatientRows.filter((r) => existingTcSet.has(r.data!.tcNo)).length,
      patientsInvalid: parsed.patients.length - validPatientRows.length,
      paymentsTotal: parsed.payments.length,
      paymentsValid: validPaymentRows.length - paymentsWithUnmatchedPatient,
      paymentsInvalid: parsed.payments.length - validPaymentRows.length,
      paymentsUnmatchedPatient: paymentsWithUnmatchedPatient,
      paymentsUnmatchedDoctor: paymentsWithUnmatchedDoctor,
    },
    patientErrors: patientErrorRows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    paymentErrors: paymentErrorRows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    patientRowWarnings,
    paymentRowWarnings,
    paymentWarnings: paymentWarnings.slice(0, 100),
  });
}
