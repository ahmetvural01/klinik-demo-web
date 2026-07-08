import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const [institution, allAds, assignments] = await Promise.all([
    prisma.institution.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, adsEnabled: true, adIntensity: true },
    }),
    prisma.advertisement.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    prisma.institutionAdAssignment.findMany({ where: { institutionId: params.id } }),
  ]);

  if (!institution) return NextResponse.json({ message: "Klinik bulunamadi" }, { status: 404 });

  return NextResponse.json({ institution, allAds, assignments });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as {
    adsEnabled?: boolean;
    adIntensity?: "LOW" | "MEDIUM" | "HIGH";
    assignments?: Array<{ advertisementId: string; isActive: boolean; weight?: number }>;
  };

  if (body.adIntensity && !["LOW", "MEDIUM", "HIGH"].includes(body.adIntensity)) {
    return NextResponse.json({ message: "Geçersiz reklam yoğunluğu" }, { status: 400 });
  }

  const institution = await prisma.institution.findUnique({ where: { id: params.id } });
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadi" }, { status: 404 });

  const normalizedAssignments = Array.isArray(body.assignments)
    ? Array.from(
        new Map(
          body.assignments
            .filter((a) => Boolean(a.advertisementId))
            .map((a) => [
              a.advertisementId,
              {
                advertisementId: a.advertisementId,
                isActive: Boolean(a.isActive),
                weight: Math.max(1, Math.min(1000, Number(a.weight) || 100)),
              },
            ]),
        ).values(),
      )
    : [];

  if (normalizedAssignments.length > 0) {
    const existingAds = await prisma.advertisement.findMany({
      where: { id: { in: normalizedAssignments.map((a) => a.advertisementId) } },
      select: { id: true },
    });
    const existingSet = new Set(existingAds.map((a) => a.id));
    const invalid = normalizedAssignments.find((a) => !existingSet.has(a.advertisementId));
    if (invalid) {
      return NextResponse.json({ message: "Geçersiz kampanya seçimi var" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.institution.update({
      where: { id: params.id },
      data: {
        ...(body.adsEnabled !== undefined && { adsEnabled: body.adsEnabled }),
        ...(body.adIntensity !== undefined && { adIntensity: body.adIntensity }),
      },
    });

    for (const a of normalizedAssignments) {
      await tx.institutionAdAssignment.upsert({
        where: {
          institutionId_advertisementId: {
            institutionId: params.id,
            advertisementId: a.advertisementId,
          },
        },
        update: {
          isActive: a.isActive,
          weight: a.weight,
        },
        create: {
          institutionId: params.id,
          advertisementId: a.advertisementId,
          isActive: a.isActive,
          weight: a.weight,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
