import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { receivedAt, receivedNote } = body;

  const trip = await (prisma as any).labTrip.update({
    where: { id: params.tripId },
    data: {
      receivedAt:   receivedAt   ? new Date(receivedAt) : new Date(),
      receivedNote: receivedNote || null,
    },
  });

  return NextResponse.json(trip);
}
