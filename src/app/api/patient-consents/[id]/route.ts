import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("documents:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Klinik bağlamı olmadan hasta onamı iptal edilemez." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (reason.length < 3 || reason.length > 500) {
      return NextResponse.json({ error: "İptal sebebi 3-500 karakter olmalıdır." }, { status: 400 });
    }

    const existing = await (prisma as any).patientConsent.findFirst({
      where: {
        id: params.id,
        institutionId: auth.user.institutionId,
      },
      include: { patient: { select: { fullName: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Onam kaydı bulunamadı." }, { status: 404 });
    if (existing.status === "IPTAL") return NextResponse.json({ error: "Bu onam zaten iptal edilmiş." }, { status: 400 });

    const result = await (prisma as any).patientConsent.updateMany({
      where: { id: params.id, institutionId: auth.user.institutionId, status: { not: "IPTAL" } },
      data: {
        status: "IPTAL",
        voidedAt: new Date(),
        voidReason: reason,
        voidedById: auth.user.id,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: "Bu onam başka bir işlem tarafından iptal edilmiş." }, { status: 409 });
    }
    const updated = await (prisma as any).patientConsent.findUnique({
      where: { id: params.id },
      include: { createdBy: { select: { fullName: true } } },
    });

    await writeAudit(auth.user.id, "PATIENT_CONSENT_VOID", `${existing.patient?.fullName || "Hasta"} için "${existing.title}" onamı iptal edildi. Sebep: ${reason}`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[patient-consents PATCH]", error);
    return NextResponse.json({ error: "Onam iptal edilemedi." }, { status: 503 });
  }
}
