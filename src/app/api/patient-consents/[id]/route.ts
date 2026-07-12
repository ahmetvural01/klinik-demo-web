import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("documents:write");
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) {
      return NextResponse.json({ error: "İptal sebebi zorunlu." }, { status: 400 });
    }

    const existing = await (prisma as any).patientConsent.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      include: { patient: { select: { fullName: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Onam kaydı bulunamadı." }, { status: 404 });
    if (existing.status === "IPTAL") return NextResponse.json({ error: "Bu onam zaten iptal edilmiş." }, { status: 400 });

    const updated = await (prisma as any).patientConsent.update({
      where: { id: params.id },
      data: {
        status: "IPTAL",
        voidedAt: new Date(),
        voidReason: reason,
        voidedById: auth.user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });

    await writeAudit(auth.user.id, "PATIENT_CONSENT_VOID", `${existing.patient?.fullName || "Hasta"} için "${existing.title}" onamı iptal edildi. Sebep: ${reason}`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[patient-consents PATCH]", error);
    return NextResponse.json({ error: "Onam iptal edilemedi." }, { status: 503 });
  }
}
