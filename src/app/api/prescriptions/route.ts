import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validators";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { requireActiveBranch } from "@/lib/branch-context";

export const GET = withApiTiming("prescriptions", async function GET(request: NextRequest) {
  const auth = await requireAuth("prescriptions:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const patientId = request.nextUrl.searchParams.get("patientId");

  const prescriptions = await prisma.prescription.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
    orderBy: { createdAt: "desc" },
    // patientId verilmeden (kurum geneli) çağrılırsa tek istek tüm reçete
    // geçmişini döndürmesin diye güvenlik sınırı.
    take: patientId ? undefined : 500,
  });

  return NextResponse.json(prescriptions);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("prescriptions:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

  const body = await request.json();
  const parsed = prescriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz reçete verisi" }, { status: 400 });
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, institutionId: auth.user.institutionId, homeBranchId: branch.branchId, archivedAt: null },
    select: { id: true },
  });
  if (!patient) {
    return NextResponse.json({ message: "Hasta bu şubede bulunamadı" }, { status: 404 });
  }

  const resolvedDoctorId = parsed.data.doctorId || auth.user.id;
  const doctor = await prisma.user.findFirst({
    where: { id: resolvedDoctorId, ...effectiveDoctorWhere(auth.user.institutionId, branch.branchId) },
    select: { id: true },
  });
  if (!doctor) {
    return NextResponse.json({ message: "Doktor bu şubenin kapsamı dışında" }, { status: 403 });
  }

  const prescription = await prisma.prescription.create({
    data: {
      ...parsed.data,
      institutionId: auth.user.institutionId,
      branchId: branch.branchId,
      doctorId: resolvedDoctorId
    }
  });

  await writeAudit(auth.user.id, "PRESCRIPTION_CREATE", `Reçete oluşturuldu`);
  return NextResponse.json(prescription, { status: 201 });
}
