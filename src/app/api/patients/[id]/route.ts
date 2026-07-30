import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { patientSchema } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";
import { turkeyTodayStartUtc } from "@/lib/tz";

type Params = { params: Promise<{ id: string }> };

const FIELD_LABELS: Record<string, string> = {
  fullName: "Ad Soyad",
  phone: "Telefon",
  preferredContactChannel: "İletişim Tercihi",
  whatsappOptInAt: "WhatsApp İzni",
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

export const GET = withApiTiming("patients-detail", async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: {
      id: true,
      institutionId: true,
      tcNo: true,
      isForeigner: true,
      phoneCountryCode: true,
      fullName: true,
      phone: true,
      preferredContactChannel: true,
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
      communicationConsentSource: true,
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
      smsPreference: {
        select: {
          status: true,
          firstConsentAt: true,
          lastRejectionAt: true,
          lastRequestSentAt: true,
          lastRequestAttemptAt: true,
          lastRequestError: true,
        },
      },
      smsConsentTokens: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { purpose: true, expiresAt: true, usedAt: true, resultStatus: true },
      },
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
        where: { status: "ACTIVE" },
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

  // Vadesi geçmiş BEKLIYOR taksitler yalnızca /api/taksit-plani/mark-gecikti
  // tarandıktan SONRA DB'de gerçekten GECIKTI olur (bkz. o route'taki aynı not
  // ve /api/taksit-plani/route.ts) — hasta kartındaki taksit listesi de aynı
  // canlı türetilmiş durumu göstermeli, aksi halde iki ekran aynı taksit için
  // farklı durum gösterebilir.
  const todayStart = turkeyTodayStartUtc();
  (patient as any).taksitPlanlari = ((patient as any).taksitPlanlari || []).map((plan: any) => ({
    ...plan,
    taksitler: (plan.taksitler || []).map((t: any) =>
      t.status === "BEKLIYOR" && new Date(t.vadeDate).getTime() < todayStart.getTime()
        ? { ...t, status: "GECIKTI" }
        : t
    ),
  }));

  if (
    patient.institutionId
    && auth.user.role !== "SUPERADMIN"
    && !auth.user.ghost
    && request.headers.get("x-silent-refresh") !== "1"
  ) {
    await prisma.patientAccessLog.create({
      data: {
        institutionId: patient.institutionId,
        patientId: patient.id,
        userId: auth.user.id,
        action: "DOSYA_GORUNTULEME",
        purpose: request.headers.get("x-access-purpose")?.slice(0, 250) || "Klinik hizmet sunumu",
        route: request.nextUrl.pathname,
        ip: (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "")
          .split(",")[0]
          .trim()
          .slice(0, 100) || null,
      },
    });
  }

  // DOKTOR ve ASISTAN telefon numaralarını göremez
  if (shouldHidePatientPhone(auth.user.role)) {
    return NextResponse.json({ ...patient, phone: "***" });
  }

  return NextResponse.json(patient);
});

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.patient.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
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
    tcNo: body.tcNo === null ? null : (typeof body.tcNo === "string" ? body.tcNo : existing.tcNo),
    isForeigner: typeof body.isForeigner === "boolean" ? body.isForeigner : existing.isForeigner,
    phoneCountryCode: typeof body.phoneCountryCode === "string" ? body.phoneCountryCode : existing.phoneCountryCode,
    fullName: typeof body.fullName === "string" ? body.fullName : existing.fullName,
    phone: typeof body.phone === "string" ? body.phone : existing.phone,
    preferredContactChannel: typeof body.preferredContactChannel === "string"
      ? body.preferredContactChannel
      : existing.preferredContactChannel,
    whatsappConsent: typeof body.whatsappConsent === "boolean"
      ? body.whatsappConsent
      : Boolean(existing.whatsappOptInAt && !existing.whatsappOptOutAt),
    communicationConsentSource: normalizeOptional(
      body.communicationConsentSource,
      existing.communicationConsentSource,
    ),
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
  // POST'ta zaten yakalanan P2002 (mükerrer TC No) burada hiç yakalanmıyordu —
  // bir kaydı düzenlerken TC no yanlışlıkla başka bir hastayla çakışırsa ham
  // Prisma hatası kullanıcıya sızıyordu (bkz. denetim raporu).
  let patient;
  try {
    const { whatsappConsent, ...patientData } = parsed.data;
    const consentChanged = whatsappConsent !== Boolean(existing.whatsappOptInAt && !existing.whatsappOptOutAt);
    patient = await prisma.patient.update({
      where: { id: params.id },
      data: {
        ...patientData,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
        ...(consentChanged && whatsappConsent
          ? {
              whatsappOptInAt: new Date(),
              whatsappOptOutAt: null,
              communicationConsentSource: parsed.data.communicationConsentSource || "Hasta düzenleme formu",
            }
          : {}),
        ...(consentChanged && !whatsappConsent
          ? {
              whatsappOptOutAt: new Date(),
              preferredContactChannel: parsed.data.preferredContactChannel === "WHATSAPP"
                ? "SMS"
                : parsed.data.preferredContactChannel,
            }
          : {}),
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik numarasıyla kayıtlı bir hasta zaten var." }, { status: 409 });
    }
    throw error;
  }

  const auditDetail = buildPatientUpdateAuditDetail(
    auth.user.fullName || "Personel",
    patient.fullName,
    existing as unknown as Record<string, unknown>,
    {
      ...existing,
      ...parsed.data,
      whatsappOptInAt: patient.whatsappOptInAt,
      birthDate: parsed.data.birthDate ?? (existing.birthDate ? existing.birthDate.toISOString() : undefined),
    } as Record<string, unknown>
  );

  await writeAudit(auth.user.id, "PATIENT_UPDATE", auditDetail);
  return NextResponse.json(patient);
}

export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:delete");
  if (auth.error) return auth.error;

  const existing = await prisma.patient.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true, fullName: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  const reason = request.headers.get("x-archive-reason")?.trim().slice(0, 500)
    || "Kullanıcı talebiyle hasta kartı arşivlendi.";
  const archivedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: {
        patientId: params.id,
        startAt: { gte: archivedAt },
        status: { notIn: ["IPTAL", "TAMAMLANDI"] },
      },
      data: { status: "IPTAL", note: "Hasta kartı arşivlendiği için iptal edildi." },
    });
    await tx.reminder.updateMany({
      where: { patientId: params.id, status: { in: ["AKTIF", "GONDERILIYOR"] } },
      data: {
        status: "TAMAMLANDI",
        nextAttemptAt: null,
        lastError: "Hasta kartı arşivlendiği için bildirim iptal edildi.",
      },
    });
    await tx.patient.update({
      where: { id: params.id },
      data: {
        archivedAt,
        archivedById: auth.user.id,
        archiveReason: reason,
        whatsappOptOutAt: archivedAt,
      },
    });
  });

  await writeAudit(auth.user.id, "PATIENT_ARCHIVE", `${existing.fullName} arşivlendi. Gerekçe: ${reason}`);
  return NextResponse.json({ ok: true, archived: true });
}
