import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patientId = request.nextUrl.searchParams.get("patientId");

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: patientId || undefined },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(prescriptions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = prescriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz reçete verisi" }, { status: 400 });
  }

  const prescription = await prisma.prescription.create({
    data: {
      ...parsed.data,
      doctorId: parsed.data.doctorId || auth.user.id
    }
  });

  await writeAudit(auth.user.id, "PRESCRIPTION_CREATE", `Reçete oluşturuldu`);
  return NextResponse.json(prescription, { status: 201 });
}
