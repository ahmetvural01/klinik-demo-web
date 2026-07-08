import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examinationSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("examinations:read");
  if (auth.error) return auth.error;

  const patientId = request.nextUrl.searchParams.get("patientId");
  const institutionDoctors = auth.user.institutionId
    ? await prisma.user.findMany({
        where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
        select: { id: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);

  const examinations = await prisma.examination.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(doctorIds.length > 0 ? { doctorId: { in: doctorIds } } : {}),
    },
    include: { patient: true, doctor: true },
    orderBy: { diagnosedAt: "desc" }
  });

  return NextResponse.json(examinations);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;

  const institutionDoctors = auth.user.institutionId
    ? await prisma.user.findMany({
        where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
        select: { id: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);

  const body = await request.json();
  const parsed = examinationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi" }, { status: 400 });
  }

  if (auth.user.institutionId && doctorIds.length > 0 && !doctorIds.includes(parsed.data.doctorId)) {
    return NextResponse.json({ message: "Doktor kurum kapsamı disinda" }, { status: 403 });
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
