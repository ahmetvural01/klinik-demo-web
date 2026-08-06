import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

function isLikelySignatureDataUrl(value: unknown) {
  return typeof value === "string"
    && value.length > 100
    && value.length <= 2_000_000
    && /^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(value);
}

const CONSENT_CATEGORIES = new Set([
  "KVKK", "ACIK_RIZA", "TEDAVI_ONAM", "CERRAHI_ONAM", "IMPLANT_ONAM",
  "ENDODONTI_ONAM", "PROTEZ_ONAM", "RONTGEN_ONAM", "DIGER",
]);

export async function GET(req: NextRequest) {
  const auth = await requireAuth("documents:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Klinik bağlamı olmadan hasta onamlarına erişilemez." }, { status: 403 });
  }

  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId zorunlu." }, { status: 400 });

  try {
    const patient = await (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        institutionId: auth.user.institutionId,
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı." }, { status: 404 });

    const consents = await (prisma as any).patientConsent.findMany({
      where: {
        patientId,
        institutionId: auth.user.institutionId,
      },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { signedAt: "desc" },
    });
    return NextResponse.json(consents);
  } catch (error) {
    console.error("[patient-consents GET]", error);
    return NextResponse.json({ message: "Hasta onam kayıtları yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("documents:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Klinik bağlamı olmadan hasta onamı oluşturulamaz." }, { status: 403 });
  }

  try {
    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }
    const { patientId, templateId, title, category, body, signerName, signerIdentityNo, signatureDataUrl } = input;
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedBody = typeof body === "string" ? body.trim() : "";
    const normalizedSigner = typeof signerName === "string" ? signerName.trim() : "";
    const normalizedCategory = String(category || "TEDAVI_ONAM");
    const normalizedIdentityNo = signerIdentityNo ? String(signerIdentityNo).trim() : null;
    if (typeof patientId !== "string" || !patientId || !normalizedTitle || !normalizedBody || !normalizedSigner || !isLikelySignatureDataUrl(signatureDataUrl)) {
      return NextResponse.json({ error: "Hasta, başlık, metin, imzalayan ve imza zorunlu." }, { status: 400 });
    }
    if (normalizedTitle.length > 200 || normalizedBody.length > 100_000 || normalizedSigner.length > 120) {
      return NextResponse.json({ error: "Onam alanlarından biri izin verilen uzunluğu aşıyor." }, { status: 400 });
    }
    if (!CONSENT_CATEGORIES.has(normalizedCategory)) {
      return NextResponse.json({ error: "Geçersiz onam kategorisi." }, { status: 400 });
    }
    if (normalizedIdentityNo && !/^\d{11}$/.test(normalizedIdentityNo)) {
      return NextResponse.json({ error: "İmzalayan kimlik numarası 11 haneli olmalıdır." }, { status: 400 });
    }

    const patient = await (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        institutionId: auth.user.institutionId,
      },
      select: { id: true, fullName: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı." }, { status: 404 });

    let template = null;
    if (templateId) {
      template = await (prisma as any).consentTemplate.findFirst({
        where: {
          id: templateId,
          isActive: true,
          institutionId: auth.user.institutionId,
        },
        select: { id: true, title: true, category: true, body: true },
      });
      if (!template) return NextResponse.json({ error: "Onam şablonu bulunamadı." }, { status: 404 });
    }

    const created = await (prisma as any).patientConsent.create({
      data: {
        institutionId: auth.user.institutionId,
        patientId,
        templateId: template?.id || null,
        title: template?.title || normalizedTitle,
        category: template?.category || normalizedCategory,
        body: template?.body || normalizedBody,
        signerName: normalizedSigner,
        signerIdentityNo: normalizedIdentityNo,
        signatureDataUrl,
        createdById: auth.user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });

    await writeAudit(auth.user.id, "PATIENT_CONSENT_CREATE", `${patient.fullName} için "${created.title}" imzalı onam kaydedildi`);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[patient-consents POST]", error);
    return NextResponse.json({ error: "İmzalı onam kaydedilemedi." }, { status: 503 });
  }
}
