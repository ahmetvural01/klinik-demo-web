import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { patientSchema } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { reverseLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

type Params = { params: { id: string } };

const FIELD_LABELS: Record<string, string> = {
  fullName: "Ad Soyad",
  phone: "Telefon",
  profession: "Meslek",
  birthDate: "Doğum Tarihi",
  address: "Adres",
  insurance: "Sigorta",
  referrer: "Yönlendiren",
  notes: "Not",
  surgeries: "Ameliyat",
  medications: "İlaç",
  otherDiseases: "Diğer Hastalık",
  bloodType: "Kan Grubu",
  discountRate: "İndirim Oranı",
  gender: "Cinsiyet",
  hasAllergy: "Alerji",
  hasHepatitis: "Hepatit",
  hasKidney: "Böbrek Rahatsızlığı",
  hasDiabetes: "Diyabet",
  hasHeart: "Kalp Rahatsızlığı",
  hasBloodIssue: "Kan Hastalığı",
  hasContagiousDisease: "Bulaşıcı Hastalık",
  contagiousDiseaseNote: "Bulaşıcı Hastalık Notu",
};

const TOOTH_STATUS_LABELS: Record<string, string> = {
  saglikli: "Sağlıklı",
  cukur: "Çürük",
  dolgu: "Dolgu",
  cekilen: "Çekilen",
  kaplik: "Kaplık",
  kanal: "Kanal",
  eksik: "Eksik",
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Var" : "Yok";
  if (typeof value === "number") return String(value);
  return String(value);
}

function formatFieldValue(fieldKey: string, value: unknown): string {
  if (fieldKey === "birthDate") {
    if (!value) return "-";
    if (value instanceof Date) return value.toLocaleDateString("tr-TR");
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("tr-TR");
  }
  return normalizeValue(value);
}

function summarizeToothChart(chart: string | null | undefined): string {
  if (!chart) return "Diş şeması kaydı yok";
  try {
    const parsed = JSON.parse(chart) as Record<string, string>;
    const counts: Record<string, number> = {};
    Object.values(parsed || {}).forEach((status) => {
      if (!status) return;
      counts[status] = (counts[status] || 0) + 1;
    });

    const ordered = Object.keys(TOOTH_STATUS_LABELS)
      .filter((key) => (counts[key] || 0) > 0)
      .map((key) => `${TOOTH_STATUS_LABELS[key]}: ${counts[key]}`);

    return ordered.length > 0 ? ordered.join(", ") : "İşaretli diş kaydı yok";
  } catch {
    return "Diş şeması okunamadı";
  }
}

function buildPatientUpdateAuditDetail(
  actorName: string,
  patientName: string,
  existing: Record<string, unknown>,
  updated: Record<string, unknown>
): string {
  const beforeParts: string[] = [];
  const afterParts: string[] = [];

  Object.keys(FIELD_LABELS).forEach((key) => {
    const before = formatFieldValue(key, existing[key]);
    const after = formatFieldValue(key, updated[key]);
    if (before !== after) {
      beforeParts.push(`${FIELD_LABELS[key]}: ${before}`);
      afterParts.push(`${FIELD_LABELS[key]}: ${after}`);
    }
  });

  const toothBefore = summarizeToothChart(existing.toothChart as string | null | undefined);
  const toothAfter = summarizeToothChart(updated.toothChart as string | null | undefined);
  if (toothBefore !== toothAfter) {
    beforeParts.push(`Diş şeması: ${toothBefore}`);
    afterParts.push(`Diş şeması: ${toothAfter}`);
  }

  const beforeText = beforeParts.length > 0 ? beforeParts.join(" | ") : "Belirgin alan değişikliği yok";
  const afterText = afterParts.length > 0 ? afterParts.join(" | ") : "Belirgin alan değişikliği yok";

  return [
    `${actorName} tarafından ${patientName} hastası güncellendi.`,
    `Değişiklik öncesi: ${beforeText}`,
    `Değişiklik sonrası: ${afterText}`,
  ].join("\n");
}

export const GET = withApiTiming("patients-detail", async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: {
      id: true,
      institutionId: true,
      tcNo: true,
      fullName: true,
      phone: true,
      profession: true,
      address: true,
      gender: true,
      birthDate: true,
      insurance: true,
      referrer: true,
      discountRate: true,
      notes: true,
      surgeries: true,
      medications: true,
      otherDiseases: true,
      hasAllergy: true,
      hasHepatitis: true,
      hasKidney: true,
      hasDiabetes: true,
      hasHeart: true,
      hasBloodIssue: true,
      hasContagiousDisease: true,
      contagiousDiseaseNote: true,
      bloodType: true,
      toothChart: true,
      createdAt: true,
      updatedAt: true,
      appointments: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          type: true,
          status: true,
          doctor: { select: { fullName: true } },
        },
        orderBy: { startAt: "desc" },
      },
      examinations: {
        select: {
          id: true,
          treatmentName: true,
          toothNo: true,
          amount: true,
          status: true,
          diagnosedAt: true,
          doctorId: true,
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { diagnosedAt: "desc" },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          method: true,
          description: true,
          createdAt: true,
          doctorId: true,
          posId: true,
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      prescriptions: {
        select: { id: true, drugs: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      labOrders: {
        select: {
          id: true,
          labName: true,
          labType: true,
          teeth: true,
          notes: true,
          status: true,
          price: true,
          invoiceNo: true,
          createdAt: true,
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" }
      },
      taksitPlanlari: {
        select: {
          id: true,
          baslik: true,
          toplamBorc: true,
          pesnat: true,
          taksitSayisi: true,
          period: true,
          startDate: true,
          notes: true,
          status: true,
          createdAt: true,
          doctor: { select: { id: true, fullName: true } },
          taksitler: {
            select: { id: true, siraNo: true, vadeDate: true, tutar: true, odenen: true, kalan: true, status: true },
            orderBy: { vadeDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // DOKTOR ve ASISTAN telefon numaralarını göremez
  if (shouldHidePatientPhone(auth.user.role)) {
    return NextResponse.json({ ...patient, phone: "***" });
  }

  return NextResponse.json(patient);
});

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  const normalizeOptional = (value: unknown, fallback: string | null | undefined) => {
    if (value === null) return undefined;
    return typeof value === "string" ? value : (fallback ?? undefined);
  };

  const parsed = patientSchema.safeParse({
    tcNo: typeof body.tcNo === "string" ? body.tcNo : existing.tcNo,
    fullName: typeof body.fullName === "string" ? body.fullName : existing.fullName,
    phone: typeof body.phone === "string" ? body.phone : existing.phone,
    profession: normalizeOptional(body.profession, existing.profession),
    address: normalizeOptional(body.address, existing.address),
    gender: typeof body.gender === "string" ? body.gender : existing.gender,
    birthDate: body.birthDate === null ? undefined : (typeof body.birthDate === "string" ? body.birthDate : (existing.birthDate ? existing.birthDate.toISOString() : undefined)),
    insurance: normalizeOptional(body.insurance, existing.insurance),
    referrer: normalizeOptional(body.referrer, existing.referrer),
    discountRate: typeof body.discountRate === "number" ? body.discountRate : existing.discountRate,
    notes: normalizeOptional(body.notes, existing.notes),
    surgeries: normalizeOptional(body.surgeries, existing.surgeries),
    medications: normalizeOptional(body.medications, existing.medications),
    otherDiseases: normalizeOptional(body.otherDiseases, existing.otherDiseases),
    hasAllergy: typeof body.hasAllergy === "boolean" ? body.hasAllergy : existing.hasAllergy,
    hasHepatitis: typeof body.hasHepatitis === "boolean" ? body.hasHepatitis : existing.hasHepatitis,
    hasKidney: typeof body.hasKidney === "boolean" ? body.hasKidney : existing.hasKidney,
    hasDiabetes: typeof body.hasDiabetes === "boolean" ? body.hasDiabetes : existing.hasDiabetes,
    hasHeart: typeof body.hasHeart === "boolean" ? body.hasHeart : existing.hasHeart,
    hasBloodIssue: typeof body.hasBloodIssue === "boolean" ? body.hasBloodIssue : existing.hasBloodIssue,
    hasContagiousDisease: typeof body.hasContagiousDisease === "boolean" ? body.hasContagiousDisease : existing.hasContagiousDisease,
    contagiousDiseaseNote: normalizeOptional(body.contagiousDiseaseNote, existing.contagiousDiseaseNote),
    bloodType: normalizeOptional(body.bloodType, existing.bloodType),
    toothChart: normalizeOptional(body.toothChart, existing.toothChart),
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz hasta verisi", errors: parsed.error.errors }, { status: 400 });
  }

  const patient = await prisma.patient.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null
    }
  });

  const auditDetail = buildPatientUpdateAuditDetail(
    auth.user.fullName || "Personel",
    patient.fullName,
    existing as unknown as Record<string, unknown>,
    {
      ...existing,
      ...parsed.data,
      birthDate: parsed.data.birthDate ?? (existing.birthDate ? existing.birthDate.toISOString() : undefined),
    } as Record<string, unknown>
  );

  await writeAudit(auth.user.id, "PATIENT_UPDATE", auditDetail);
  return NextResponse.json(patient);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:delete");
  if (auth.error) return auth.error;

  const existing = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true, fullName: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  let deleted: { fullName: string };
  try {
    deleted = await prisma.$transaction(async (tx) => {
    // Önce taksit planlarının ID'lerini al (reminder silimi için)
    const planIds = (await tx.taksitPlan.findMany({
      where: { patientId: params.id },
      select: { id: true }
    })).map(p => p.id);

    // Hatırlatıcıları sil (hem hastaya hem plan'a bağlı olanlar)
    await tx.reminder.deleteMany({
      where: {
        OR: [
          { patientId: params.id },
          ...(planIds.length > 0 ? [{ planId: { in: planIds } }] : [])
        ]
      }
    });

    // Taksit planlarını sil (Taksit ve TaksitOdeme cascade ile silinir)
    await tx.taksitPlan.deleteMany({ where: { patientId: params.id } });

    const labOrders = await tx.labOrder.findMany({
      where: { patientId: params.id },
      select: {
        id: true,
        labType: true,
        invoiceNo: true,
        price: true,
        invoices: { select: { id: true, item: true, amount: true, invoiceNo: true } },
      },
    });

    for (const order of labOrders) {
      if (order.invoices.length > 0) {
        for (const invoice of order.invoices) {
          await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
            labInvoiceId: invoice.id,
            labOrderId: order.id,
            invoiceNo: invoice.invoiceNo || null,
            item: invoice.item || null,
            amount: Number(invoice.amount || 0),
          });
        }
      } else if (order.invoiceNo || order.price) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          labOrderId: order.id,
          invoiceNo: order.invoiceNo || null,
          item: order.labType,
          amount: Number(order.price || 0),
        });
      }
    }

    // Lab siparişlerini sil (LabTrip ve LabOrderInvoice cascade ile silinir)
    await tx.labOrder.deleteMany({ where: { patientId: params.id } });

    // Hasta takip kayıtlarını sil (PatientFollowUp/Event, ON DELETE RESTRICT
    // olduğu için silinmeden hasta.delete() FK ihlaliyle çöker — events önce,
    // sonra follow-up'lar).
    const followUpIds = (await tx.patientFollowUp.findMany({
      where: { patientId: params.id },
      select: { id: true },
    })).map((f) => f.id);
    await tx.patientFollowUpEvent.deleteMany({
      where: {
        OR: [
          { patientId: params.id },
          ...(followUpIds.length > 0 ? [{ followUpId: { in: followUpIds } }] : []),
        ],
      },
    });
    await tx.patientFollowUp.deleteMany({ where: { patientId: params.id } });

    // Reçeteleri sil
    await tx.prescription.deleteMany({ where: { patientId: params.id } });

    // Tedavi planlarını sil (TreatmentStep cascade ile silinir)
    await tx.treatmentPlan.deleteMany({ where: { patientId: params.id } });

    await tx.appointment.deleteMany({ where: { patientId: params.id } });
    await tx.examination.deleteMany({ where: { patientId: params.id } });
    await tx.payment.deleteMany({ where: { patientId: params.id } });
      return tx.patient.delete({ where: { id: params.id } });
    });
  } catch {
    return NextResponse.json(
      { message: "Hasta silinemedi: bağlı kayıtlar tam temizlenemedi. Lütfen tekrar deneyin veya destek ekibiyle iletişime geçin." },
      { status: 409 }
    );
  }

  await writeAudit(auth.user.id, "PATIENT_DELETE", `${deleted.fullName || existing.fullName} kalıcı olarak silindi`);

  return NextResponse.json({ ok: true });
}
