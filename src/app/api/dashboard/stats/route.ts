import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const isSuperAdmin = auth.user.role === "SUPERADMIN";
  const institutionId = auth.user.institutionId;

  const [totalAppointments, totalExaminations, totalPatients, totalStaff, latestLogs] = await Promise.all([
    prisma.appointment.count({
      where: isSuperAdmin ? {} : { patient: { institutionId } },
    }),
    prisma.examination.count({
      where: isSuperAdmin ? {} : { patient: { institutionId } },
    }),
    prisma.patient.count({
      where: isSuperAdmin ? {} : { institutionId },
    }),
    prisma.user.count({
      where: {
        isActive: true,
        role: { not: "SUPERADMIN" },
        ...(isSuperAdmin ? {} : { institutionId }),
      },
    }),
    prisma.auditLog.findMany({
      where: {
        user: {
          role: { not: "SUPERADMIN" },
          ...(isSuperAdmin ? {} : { institutionId }),
        },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, fullName: true, role: true } } }
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
