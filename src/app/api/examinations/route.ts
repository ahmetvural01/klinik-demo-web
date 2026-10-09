import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { examinationSchema } from "@/lib/validators";
import { EXAM_STATUS_DIAGNOSIS, EXAM_STATUS_DONE } from "@/lib/examination-status";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { requireActiveBranch } from "@/lib/branch-context";

// Hasta dosyası yeni kaydı ya muayene listesine ("Diagnoz (Ön Teşhis)" —
// ücrete yansımaz) ya da doğrudan yapılan tedavi olarak (TAMAMLANDI) açar.
// Ortak şemadaki enum ön teşhis değerini kabul etmediği için hasta
// dosyasından hiçbir muayene kaydı oluşturulamıyordu (400). Bkz.
// src/lib/examination-status.ts.
const examinationCreateSchema = examinationSchema.extend({
  status: z.enum([EXAM_STATUS_DIAGNOSIS, EXAM_STATUS_DONE, "PLANLANDI", "DEVAM"]),
});

export const GET = withApiTiming("examinations", async function GET(request: NextRequest) {
  const auth = await requireAuth("examinations:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const patientId = request.nextUrl.searchParams.get("patientId");

  const examinations = await prisma.examination.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
    // Hastanın tam kaydı (TC, telefon, şifreli sağlık alanları) burada
    // gerekmez; yalnız kim olduğu döner. Telefonu/TC'yi göremeyen roller bu
    // liste üzerinden de göremez.
    include: { patient: { select: { id: true, fullName: true } }, doctor: { select: { id: true, fullName: true } } },
    orderBy: { diagnosedAt: "desc" },
    take: 500,
  });

  return NextResponse.json(examinations);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

  const body = await request.json();
  const parsed = examinationCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi", errors: parsed.error.errors }, { status: 400 });
  }

  const [patientInfo, doctorInfo] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: parsed.data.patientId, institutionId: auth.user.institutionId, homeBranchId: branch.branchId, archivedAt: null },
      select: { id: true, fullName: true },
    }),
    prisma.user.findFirst({
      where: { id: parsed.data.doctorId, ...effectiveDoctorWhere(auth.user.institutionId, branch.branchId) },
      select: { id: true, fullName: true },
    }),
  ]);
  if (!patientInfo) return NextResponse.json({ message: "Hasta bu şubede bulunamadı" }, { status: 404 });
  if (!doctorInfo) return NextResponse.json({ message: "Doktor bu şubenin kapsamı dışında" }, { status: 403 });

  const examination = await prisma.examination.create({
    data: {
      ...parsed.data,
      institutionId: auth.user.institutionId,
      branchId: branch.branchId,
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
