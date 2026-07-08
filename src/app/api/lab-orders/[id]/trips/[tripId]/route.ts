import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  const auth = await requireAuth("appointments:write");
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
    select: { id: true, labOrderId: true },
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

  const trip = await (prisma as any).labTrip.update({
    where: { id: params.tripId },
    data,
  });

  await writeAudit(auth.user.id, "LAB_TRIP_UPDATE", `Laboratuvar gidiş adımı güncellendi (${params.tripId})`);
  return NextResponse.json(trip);
}
