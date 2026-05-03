import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const instId = auth.user.institutionId;

  // Kurum bazlı sorgular — tüm tabloyu taramaz
  const [totalAppointments, totalExaminations, totalPatients, totalStaff] = await Promise.all([
    prisma.appointment.count({
      where: instId ? { doctor: { institutionId: instId } } : {},
    }),
    prisma.examination.count({
      where: instId ? { doctor: { institutionId: instId } } : {},
    }),
    prisma.patient.count(),
    prisma.user.count({
      where: { isActive: true, ...(instId ? { institutionId: instId } : {}) },
    }),
  ]);

  return NextResponse.json({ totalAppointments, totalExaminations, totalPatients, totalStaff });
}
