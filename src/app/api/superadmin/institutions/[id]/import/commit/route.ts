import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeTrKey, parseImportWorkbook } from "@/lib/patient-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// POST /api/superadmin/institutions/[id]/import/commit
// /preview ile aynı dosyayı tekrar ayrıştırır ve bu kez GERÇEKTEN YAZAR.
// Zaten var olan hastalar (aynı TC) tekrar oluşturulmaz — mevcut kaydı bulup
// ödeme geçmişini ona bağlar (bkz. Patient.@@unique([institutionId, tcNo])).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
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
    console.error("[import commit]", error);
    return NextResponse.json({ message: "Dosya okunamadı — geçerli bir .xlsx şablonu olduğundan emin olun" }, { status: 400 });
  }

  const validPatientRows = parsed.patients.filter((r) => r.data);
  const fileTcNos = validPatientRows.map((r) => r.data!.tcNo);

  const existingPatients = fileTcNos.length
    ? await prisma.patient.findMany({
        where: { institutionId: params.id, tcNo: { in: fileTcNos } },
        select: { id: true, tcNo: true },
      })
    : [];
  const tcToPatientId = new Map(existingPatients.map((p) => [p.tcNo, p.id]));

  let patientsCreated = 0;
  let patientsSkippedExisting = 0;
  let patientsFailed = 0;

  for (const row of validPatientRows) {
    const data = row.data!;
    if (tcToPatientId.has(data.tcNo)) {
      patientsSkippedExisting += 1;
      continue;
    }
    try {
      const created = await prisma.patient.create({
        data: {
          institutionId: params.id,
          tcNo: data.tcNo,
          fullName: data.fullName,
          phone: data.phone,
          gender: data.gender,
          birthDate: data.birthDate ? new Date(data.birthDate) : null,
          address: data.address,
          profession: data.profession,
          insurance: data.insurance,
          discountRate: data.discountRate,
          bloodType: data.bloodType,
          notes: data.notes,
          hasAllergy: data.hasAllergy,
          hasHepatitis: data.hasHepatitis,
          hasKidney: data.hasKidney,
          hasDiabetes: data.hasDiabetes,
          hasHeart: data.hasHeart,
          hasBloodIssue: data.hasBloodIssue,
          hasContagiousDisease: data.hasContagiousDisease,
          contagiousDiseaseNote: data.contagiousDiseaseNote,
          medications: data.medications,
          surgeries: data.surgeries,
          otherDiseases: data.otherDiseases,
          referrer: data.referrer,
        },
        select: { id: true, tcNo: true },
      });
      tcToPatientId.set(created.tcNo, created.id);
      patientsCreated += 1;
    } catch (error) {
      console.error("[import commit] patient create failed", row.rowNumber, error);
      patientsFailed += 1;
    }
  }

  const doctorRows = await prisma.user.findMany({
    where: { institutionId: params.id, isActive: true, role: { in: ["DOKTOR", "YONETICI"] } },
    select: { id: true, fullName: true },
  });
  const nameToDoctorId = new Map(doctorRows.map((d) => [normalizeTrKey(d.fullName), d.id]));

  let paymentsCreated = 0;
  let paymentsSkipped = 0;
  let paymentsDuplicate = 0;

  for (const row of parsed.payments) {
    const data = row.data;
    if (!data) { paymentsSkipped += 1; continue; }
    const patientId = tcToPatientId.get(data.patientTcNo);
    if (!patientId) { paymentsSkipped += 1; continue; }

    const doctorId = data.doctorName ? nameToDoctorId.get(normalizeTrKey(data.doctorName)) ?? null : null;
    const description = data.description ? `${data.description} [Toplu aktarım]` : "[Toplu aktarım]";
    const createdAt = new Date(data.date);

    try {
      // Aynı dosya yanlışlıkla iki kez yüklenirse (örn. bağlantı kopması sonrası
      // tekrar deneme) aynı ödemenin ikinci kez eklenmemesi için, bu hastada
      // aynı tutar/tarih/açıklamayla daha önce içe aktarılmış bir kayıt var mı
      // kontrol edilir.
      const duplicate = await prisma.payment.findFirst({
        where: { patientId, amount: data.amount, createdAt, description },
        select: { id: true },
      });
      if (duplicate) {
        paymentsDuplicate += 1;
        continue;
      }

      await prisma.payment.create({
        data: {
          patientId,
          doctorId,
          method: data.method as never,
          amount: data.amount,
          description,
          createdAt,
        },
      });
      paymentsCreated += 1;
    } catch (error) {
      console.error("[import commit] payment create failed", row.rowNumber, error);
      paymentsSkipped += 1;
    }
  }

  let treatmentsCreated = 0;
  let treatmentsSkipped = 0;
  let treatmentsDuplicate = 0;

  for (const row of parsed.treatments) {
    const data = row.data;
    if (!data) { treatmentsSkipped += 1; continue; }
    const patientId = tcToPatientId.get(data.patientTcNo);
    const doctorId = nameToDoctorId.get(normalizeTrKey(data.doctorName));
    // TreatmentPlan.doctorId zorunlu (nullable değil) — eşleşmeyen doktoru
    // boş bırakıp kaydetmek şemaya aykırı; bu satır atlanır (önizlemede zaten
    // "treatmentsUnresolvedDoctor" olarak işaretlenmişti).
    if (!patientId || !doctorId) { treatmentsSkipped += 1; continue; }

    const createdAt = new Date(data.date);
    const note = data.note ? `${data.note} [Toplu aktarım]` : "[Toplu aktarım]";

    try {
      const duplicate = await prisma.treatmentPlan.findFirst({
        where: { patientId, doctorId, title: data.treatmentName, createdAt },
        select: { id: true },
      });
      if (duplicate) { treatmentsDuplicate += 1; continue; }

      await prisma.treatmentPlan.create({
        data: {
          patientId,
          doctorId,
          title: data.treatmentName,
          status: data.status as never,
          totalCost: data.amount || null,
          notes: note,
          createdAt,
          steps: {
            create: [{
              order: 1,
              treatmentName: data.treatmentName,
              toothNo: data.toothNo,
              amount: data.amount,
              status: data.status === "TAMAMLANDI" ? "TAMAMLANDI" : "BEKLIYOR",
              doneAt: data.status === "TAMAMLANDI" ? createdAt : null,
              note: data.note,
            }],
          },
        },
      });
      treatmentsCreated += 1;
    } catch (error) {
      console.error("[import commit] treatment create failed", row.rowNumber, error);
      treatmentsSkipped += 1;
    }
  }

  let prescriptionsCreated = 0;
  let prescriptionsSkipped = 0;
  let prescriptionsDuplicate = 0;

  for (const row of parsed.prescriptions) {
    const data = row.data;
    if (!data) { prescriptionsSkipped += 1; continue; }
    const patientId = tcToPatientId.get(data.patientTcNo);
    if (!patientId) { prescriptionsSkipped += 1; continue; }

    const doctorId = data.doctorName ? nameToDoctorId.get(normalizeTrKey(data.doctorName)) ?? null : null;
    const createdAt = new Date(data.date);
    const note = data.note ? `${data.note} [Toplu aktarım]` : "[Toplu aktarım]";

    try {
      const duplicate = await prisma.prescription.findFirst({
        where: { patientId, drugs: data.drugs, createdAt },
        select: { id: true },
      });
      if (duplicate) { prescriptionsDuplicate += 1; continue; }

      await prisma.prescription.create({
        data: { patientId, doctorId, drugs: data.drugs, note, createdAt },
      });
      prescriptionsCreated += 1;
    } catch (error) {
      console.error("[import commit] prescription create failed", row.rowNumber, error);
      prescriptionsSkipped += 1;
    }
  }

  await writeAudit(
    auth.user.id,
    "SUPERADMIN_DATA_IMPORT",
    `${institution.name} kliniğine toplu veri aktarımı: ${patientsCreated} yeni hasta, ${patientsSkippedExisting} zaten kayıtlı, ${paymentsCreated} ödeme, ${treatmentsCreated} tedavi, ${prescriptionsCreated} reçete kaydı eklendi.`
  );

  return NextResponse.json({
    patientsCreated,
    patientsSkippedExisting,
    patientsFailed,
    paymentsCreated,
    paymentsSkipped,
    paymentsDuplicate,
    treatmentsCreated,
    treatmentsSkipped,
    treatmentsDuplicate,
    prescriptionsCreated,
    prescriptionsSkipped,
    prescriptionsDuplicate,
  });
}
