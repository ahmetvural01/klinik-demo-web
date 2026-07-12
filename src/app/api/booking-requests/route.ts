import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    const requests = await prisma.bookingRequest.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        ...(status ? { status: status as BookingRequestStatus } : { status: "BEKLIYOR" as BookingRequestStatus }),
      },
      orderBy: { createdAt: "desc" },
      include: { doctor: { select: { id: true, fullName: true } } },
    });
    return NextResponse.json(requests);
  } catch (error) {
    console.error("[booking-requests GET]", error);
    return NextResponse.json({ message: "Online randevu talepleri yüklenemedi." }, { status: 503 });
  }
}
