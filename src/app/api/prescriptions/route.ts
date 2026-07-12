import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validators";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";

export const GET = withApiTiming("prescriptions", async function GET(request: NextRequest) {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patientId = request.nextUrl.searchParams.get("patientId");

  const prescriptions = await prisma.prescription.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // patientId verilmeden (kurum geneli) çağrılırsa tek istek tüm reçete
    // geçmişini döndürmesin diye güvenlik sınırı.
    take: patientId ? undefined : 500,
  });

  return NextResponse.json(prescriptions);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = prescriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz reçete verisi" }, { status: 400 });
  }

  if (auth.user.role !== "SUPERADMIN") {
    const patient = await prisma.patient.findFirst({
      where: { id: parsed.data.patientId, institutionId: auth.user.institutionId },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    }
  }

  const resolvedDoctorId = parsed.data.doctorId || auth.user.id;
  if (auth.user.role !== "SUPERADMIN") {
    const doctor = await prisma.user.findFirst({
      where: { id: resolvedDoctorId, institutionId: auth.user.institutionId },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ message: "Doktor kurum kapsamı dışında" }, { status: 403 });
    }
  }

  const prescription = await prisma.prescription.create({
    data: {
      ...parsed.data,
      doctorId: resolvedDoctorId
    }
  });

  await writeAudit(auth.user.id, "PRESCRIPTION_CREATE", `Reçete oluşturuldu`);
  return NextResponse.json(prescription, { status: 201 });
}
