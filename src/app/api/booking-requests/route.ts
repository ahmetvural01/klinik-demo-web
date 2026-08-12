import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const validStatuses = new Set(["BEKLIYOR", "ONAYLANDI", "REDDEDILDI", "IPTAL"]);
  if (status && !validStatuses.has(status)) {
    return NextResponse.json({ error: "Geçersiz randevu talebi durumu" }, { status: 400 });
  }

  try {
    const requests = await prisma.bookingRequest.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
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
