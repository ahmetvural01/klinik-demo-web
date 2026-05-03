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
      patientId: patientId || undefined
    },
    include: { patient: true, doctor: true },
    orderBy: { diagnosedAt: "desc" }
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

  const examination = await prisma.examination.create({
    data: {
      ...parsed.data,
      diagnosedAt: new Date(parsed.data.diagnosedAt)
    }
  });

  await writeAudit(auth.user.id, "EXAM_CREATE", `${parsed.data.treatmentName} kaydi`);
  return NextResponse.json(examination, { status: 201 });
}
