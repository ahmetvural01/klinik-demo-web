import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const body = await req.json();

  const existing = await (prisma as any).labTrip.findFirst({
    where: {
      id: params.tripId,
      labOrderId: params.id,
      ...(auth.user.role !== "SUPERADMIN"
        ? { labOrder: { patient: { institutionId: auth.user.institutionId } } }
        : {}),
    },
    select: {
      id: true,
      labOrderId: true,
      order: true,
      description: true,
      labOrder: {
        select: {
          id: true,
          patientId: true,
          doctorId: true,
          labName: true,
          labType: true,
          patient: { select: { fullName: true } },
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Adım bulunamadı" }, { status: 404 });
  }

  const data: Record<string, any> = {};

  if ("description" in body) data.description = body.description;
  if ("sentAt" in body) data.sentAt = body.sentAt ? new Date(body.sentAt) : new Date();
  if ("sentNote" in body) data.sentNote = body.sentNote || null;
  if ("receivedAt" in body) data.receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;
  if ("receivedNote" in body) data.receivedNote = body.receivedNote || null;

  // Backward compatibility: legacy receive action sends only receivedAt/receivedNote.
  if (!Object.keys(data).length) {
    data.receivedAt = new Date();
    data.receivedNote = null;
  }

  const shouldCreateProvaFollowUp =
    Boolean(data.receivedAt) &&
    typeof data.receivedNote === "string" &&
    data.receivedNote.includes("RANDEVU_PROVA_GEREKLI");
  // Not metnindeki LAB_ORDER:/LAB_PROVA: satırları geriye dönük uyumluluk için
  // hâlâ yazılıyor (eski ekranlar/dışa aktarımlar okuyabilsin), ama artık
  // ilişkiyi kuran gerçek alan labOrderId/labTripId (bkz. denetim raporu Tema 3).
  const sourceToken = `LAB_PROVA:${params.tripId}`;
  const sourceOrderToken = `LAB_ORDER:${params.id}`;

  const updatedOrder = await (prisma as any).$transaction(async (tx: any) => {
    await tx.labTrip.update({
      where: { id: params.tripId },
      data,
    });

    if (existing.labOrder) {
      if (shouldCreateProvaFollowUp) {
        const alreadyOpen = await tx.patientFollowUp.findFirst({
          where: {
            patientId: existing.labOrder.patientId,
            status: "ACIK",
            labTripId: params.tripId,
          },
          select: { id: true },
        });

        if (!alreadyOpen) {
          await tx.patientFollowUp.updateMany({
            where: {
              patientId: existing.labOrder.patientId,
              status: "ACIK",
              labOrderId: params.id,
            },
            data: {
              status: "KAPALI",
              closedAt: new Date(),
              resolutionNote: "Aynı laboratuvar işinde daha yeni prova/randevu aksiyonu açıldığı için otomatik kapatıldı.",
            },
          });

          const receivedDate = data.receivedAt instanceof Date ? data.receivedAt : new Date();
          const actionDate = Number.isNaN(receivedDate.getTime()) ? new Date() : receivedDate;
          const receivedStep = String(existing.description || "").includes(" → ")
            ? String(existing.description || "").split(" → ")[1]
            : String(existing.description || "");
          await tx.patientFollowUp.create({
            data: {
              patientId: existing.labOrder.patientId,
              doctorId: existing.labOrder.doctorId,
              createdById: auth.user.id,
              type: "GERI_ARA",
              priority: 2,
              status: "ACIK",
              nextActionAt: actionDate,
              labOrderId: params.id,
              labTripId: params.tripId,
              note: [
                "Takip Tipi: Lab Prova Randevusu",
                sourceOrderToken,
                sourceToken,
                "Laboratuvardan gelen prova için hasta randevusu planlanacak.",
                `Hasta: ${existing.labOrder.patient.fullName}`,
                `İş: ${existing.labOrder.labType}`,
                `Laboratuvar: ${existing.labOrder.labName}`,
                `Gelen/Prova: ${receivedStep}`,
                `Lab adımı #${existing.order}: ${existing.description}`,
              ].join("\n"),
            },
          });
        }
      } else if ("receivedNote" in body) {
        await tx.patientFollowUp.updateMany({
          where: {
            patientId: existing.labOrder.patientId,
            status: "ACIK",
            labTripId: params.tripId,
          },
          data: {
            status: "KAPALI",
            closedAt: new Date(),
            resolutionNote: "Laboratuvar gelişindeki prova/randevu ihtiyacı kaldırıldı.",
          },
        });
      }
    }

    return tx.labOrder.findUnique({
      where: { id: params.id },
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
        trips: { orderBy: { order: "asc" } },
      },
    });
  });

  await writeAudit(auth.user.id, "LAB_TRIP_UPDATE", `Laboratuvar gidiş adımı güncellendi (${params.tripId})`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json(updatedOrder);
}
