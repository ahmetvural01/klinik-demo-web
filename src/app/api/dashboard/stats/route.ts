import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const [totalAppointments, totalExaminations, totalPatients, totalStaff, latestLogs] = await Promise.all([
    prisma.appointment.count(),
    prisma.examination.count(),
    prisma.patient.count(),
    prisma.user.count({ where: { isActive: true, role: { not: "SUPERADMIN" } } }),
    prisma.auditLog.findMany({
      where: { user: { role: { not: "SUPERADMIN" } } },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: true }
    })
  ]);

  return NextResponse.json({
    totalAppointments,
    totalExaminations,
    totalPatients,
    totalStaff,
    latestLogs
  });
}
