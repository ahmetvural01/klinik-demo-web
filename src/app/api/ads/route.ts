import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const INTENSITY_LIMIT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 3,
  HIGH: 6,
};

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ ads: [] });
  }

  const institution = await prisma.institution.findUnique({
    where: { id: auth.user.institutionId },
    select: { id: true, adsEnabled: true, adIntensity: true },
  });

  if (!institution?.adsEnabled) {
    return NextResponse.json({ ads: [] });
  }

  const now = new Date();
  const limit = INTENSITY_LIMIT[institution.adIntensity] || 3;

  const assigned = await prisma.institutionAdAssignment.findMany({
    where: {
      institutionId: institution.id,
      isActive: true,
      advertisement: {
        isActive: true,
        OR: [
          { startAt: null },
          { startAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: now } },
            ],
          },
        ],
      },
    },
    include: { advertisement: true },
    orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  const ads = assigned.map((a) => a.advertisement);
  return NextResponse.json({ ads });
}
