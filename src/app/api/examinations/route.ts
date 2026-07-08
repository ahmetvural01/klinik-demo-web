import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examinationSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("examinations:read");
  if (auth.error) return auth.error;

  const patientId = request.nextUrl.searchParams.get("patientId");

  const examinations = await prisma.examination.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    include: { patient: true, doctor: true },
    orderBy: { diagnosedAt: "desc" },
    take: 500,
  });

  return NextResponse.json(examinations);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = examinationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi" }, { status: 400 });
  }

  if (auth.user.role !== "SUPERADMIN") {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: parsed.data.patientId, institutionId: auth.user.institutionId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: parsed.data.doctorId, institutionId: auth.user.institutionId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ message: "Doktor kurum kapsamı dışında" }, { status: 403 });
  }

  const examination = await prisma.examination.create({
    data: {
      ...parsed.data,
      diagnosedAt: new Date(parsed.data.diagnosedAt)
    }
  });

  await writeAudit(auth.user.id, "EXAM_CREATE", `${parsed.data.treatmentName} kaydı`);
  return NextResponse.json(examination, { status: 201 });
}
