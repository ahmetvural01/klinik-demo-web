import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId
        ? { institutionId: auth.user.institutionId }
        : {}),
    },
    select: { id: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
  }

  const records = await prisma.patientAccessLog.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json(records);
}
