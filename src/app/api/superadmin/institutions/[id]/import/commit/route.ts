import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeTrKey, parseImportWorkbook } from "@/lib/patient-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// POST /api/superadmin/institutions/[id]/import/commit
// /preview ile aynı dosyayı tekrar ayrıştırır ve bu kez GERÇEKTEN YAZAR.
// Zaten var olan hastalar hedef şube içindeki aynı TC ile eşleştirilir.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      branches: { where: { isActive: true }, select: { id: true, isHeadquarters: true }, orderBy: [{ isHeadquarters: "desc" }, { createdAt: "asc" }] },
    },
  });
  if (!institution) return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
  const headquartersBranchId = institution.branches.find((b) => b.isHeadquarters)?.id || institution.branches[0]?.id;
  if (!headquartersBranchId) return NextResponse.json({ message: "Kurumun aktif merkez şubesi bulunamadı" }, { status: 409 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Dosya bulunamadı" }, { status: 400 });
  }
  const requestedBranchId = String(formData?.get("branchId") || "").trim();
  // İçe aktarılan veri her zaman merkez şubeye yazılmamalı — çok şubeli bir
  // kurumda bu, o kliniğin gerçek şubesinin hasta/ödeme/tedavi geçmişini
  // yanlışlıkla merkez şubeye karıştırırdı. Superadmin hedef şubeyi seçebilir,
  // seçilmezse (tek şubeli kurumlar için) merkez şubeye düşer.
  const branchId = requestedBranchId
    ? institution.branches.find((b) => b.id === requestedBranchId)?.id
    : headquartersBranchId;
  if (!branchId) {
    return NextResponse.json({ message: "Geçersiz hedef şube seçimi" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ message: "Dosya çok büyük (maks. 5MB)" }, { status: 400 });
  }

  let parsed;
  let importFingerprint = "";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    importFingerprint = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
    parsed = await parseImportWorkbook(buffer);
  } catch (error) {
    console.error("[import commit]", error);
    return NextResponse.json({ message: "Dosya okunamadı — geçerli bir .xlsx şablonu olduğundan emin olun" }, { status: 400 });
  }

  const validPatientRows = parsed.patients.filter((r) => r.data);
  const fileTcNos = validPatientRows.map((r) => r.data!.tcNo);

  const importResult = await prisma.$transaction(async (tx) => {
  const existingPatients = fileTcNos.length
    ? await tx.patient.findMany({
        where: { institutionId: params.id, homeBranchId: branchId, tcNo: { in: fileTcNos } },
        select: { id: true, tcNo: true },
      })
    : [];
  const tcToPatientId = new Map(existingPatients.map((p) => [p.tcNo, p.id]));

  let patientsCreated = 0;
  let patientsSkippedExisting = 0;
  const patientsFailed = 0;

  for (const row of validPatientRows) {
    const data = row.data!;
    if (tcToPatientId.has(data.tcNo)) {
      patientsSkippedExisting += 1;
      continue;
    }
    const created = await tx.patient.create({
        data: {
          institutionId: params.id,
          homeBranchId: branchId,
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
  }

  // branchMemberships filtresi kritik: aktarılan ödeme/tedavi/reçete kayıtları
  // hedef şubeye (branchId) yazılıyor — o şubede üyeliği olmayan bir doktor
  // eşleştirilirse kayıt oluşur ama sonradan effectiveDoctorWhere ile yapılan
  // her düzenleme "doktor kurum kapsamı dışında" hatasıyla reddedilirdi.
  const doctorRows = await tx.user.findMany({
    where: {
      institutionId: params.id,
      isActive: true,
      role: { in: ["DOKTOR", "YONETICI"] },
      branchMemberships: { some: { branchId, isActive: true } },
    },
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
    const requestKey = `import:${importFingerprint}:payment:${row.rowNumber}`;
    const description = data.description ? `${data.description} [Toplu aktarım]` : "[Toplu aktarım]";
    const createdAt = new Date(data.date);

    const duplicate = await tx.payment.findUnique({
      where: { branchId_requestKey: { branchId, requestKey } },
      select: { id: true },
    });
    if (duplicate) {
      paymentsDuplicate += 1;
      continue;
    }

    await tx.payment.create({
      data: {
        institutionId: params.id,
        branchId,
        requestKey,
        patientId,
        doctorId,
        method: data.method as never,
        amount: data.amount,
        description,
        createdAt,
      },
    });
    paymentsCreated += 1;
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

    const requestKey = `import:${importFingerprint}:treatment:${row.rowNumber}`;
    const createdAt = new Date(data.date);
    const note = data.note ? `${data.note} [Toplu aktarım]` : "[Toplu aktarım]";

    const duplicate = await tx.treatmentPlan.findUnique({
      where: { branchId_requestKey: { branchId, requestKey } },
      select: { id: true },
    });
    if (duplicate) { treatmentsDuplicate += 1; continue; }

    await tx.treatmentPlan.create({
      data: {
        institutionId: params.id,
        branchId,
        requestKey,
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
    const requestKey = `import:${importFingerprint}:prescription:${row.rowNumber}`;
    const createdAt = new Date(data.date);
    const note = data.note ? `${data.note} [Toplu aktarım]` : "[Toplu aktarım]";

    const duplicate = await tx.prescription.findUnique({
      where: { branchId_requestKey: { branchId, requestKey } },
      select: { id: true },
    });
    if (duplicate) { prescriptionsDuplicate += 1; continue; }

    await tx.prescription.create({
      data: { institutionId: params.id, branchId, requestKey, patientId, doctorId, drugs: data.drugs, note, createdAt },
    });
    prescriptionsCreated += 1;
  }

  return {
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
  };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 }).catch((error) => {
    console.error("[import commit] transaction rolled back", error);
    return null;
  });
  if (!importResult) {
    return NextResponse.json(
      { message: "Aktarım tamamlanamadı. Hiçbir kayıt değiştirilmedi; dosyayı yeniden deneyebilirsiniz." },
      { status: 409 },
    );
  }

  const {
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
  } = importResult;

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
