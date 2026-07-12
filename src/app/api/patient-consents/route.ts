import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

function isLikelySignatureDataUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") && value.length > 100;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("documents:read");
  if (auth.error) return auth.error;

  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId zorunlu." }, { status: 400 });

  try {
    const patient = await (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı." }, { status: 404 });

    const consents = await (prisma as any).patientConsent.findMany({
      where: {
        patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
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

  try {
    const { patientId, templateId, title, category, body, signerName, signerIdentityNo, signatureDataUrl } = await req.json();
    if (!patientId || !title?.trim() || !body?.trim() || !signerName?.trim() || !isLikelySignatureDataUrl(signatureDataUrl)) {
      return NextResponse.json({ error: "Hasta, başlık, metin, imzalayan ve imza zorunlu." }, { status: 400 });
    }

    const patient = await (prisma as any).patient.findFirst({
      where: {
        id: patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
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
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
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
        title: template?.title || title.trim(),
        category: template?.category || String(category || "TEDAVI_ONAM"),
        body: template?.body || body.trim(),
        signerName: signerName.trim(),
        signerIdentityNo: signerIdentityNo ? String(signerIdentityNo).trim() : null,
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
