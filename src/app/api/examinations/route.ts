import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examinationSchema } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";

export const GET = withApiTiming("examinations", async function GET(request: NextRequest) {
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
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = examinationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi" }, { status: 400 });
  }

  let patientInfo: { id: string; fullName: string } | null = null;
  let doctorInfo: { id: string; fullName: string } | null = null;
  if (auth.user.role !== "SUPERADMIN") {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: parsed.data.patientId, institutionId: auth.user.institutionId },
        select: { id: true, fullName: true },
      }),
      prisma.user.findFirst({
        where: { id: parsed.data.doctorId, institutionId: auth.user.institutionId, isActive: true },
        select: { id: true, fullName: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ message: "Doktor kurum kapsamı dışında" }, { status: 403 });
    patientInfo = patient;
    doctorInfo = doctor;
  } else {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findUnique({ where: { id: parsed.data.patientId }, select: { id: true, fullName: true } }),
      prisma.user.findUnique({ where: { id: parsed.data.doctorId }, select: { id: true, fullName: true } }),
    ]);
    patientInfo = patient;
    doctorInfo = doctor;
  }

  const examination = await prisma.examination.create({
    data: {
      ...parsed.data,
      diagnosedAt: new Date(parsed.data.diagnosedAt)
    }
  });

  await writeAudit(auth.user.id, "EXAM_CREATE", [
    `${auth.user.fullName || "Personel"} tarafından tedavi/muayene kaydı oluşturuldu.`,
    `Hasta: ${patientInfo?.fullName || parsed.data.patientId}`,
    `Doktor: ${doctorInfo?.fullName || parsed.data.doctorId}`,
    `Tedavi: ${parsed.data.treatmentName}`,
    `Diş/Alan: ${parsed.data.toothNo || "-"}`,
    `Tutar: ${parsed.data.amount} TL`,
    `Durum: ${parsed.data.status}`,
  ].join("\n"));
  return NextResponse.json(examination, { status: 201 });
}
