import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth("dashboard:stats");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const branchId = branch.branchId;

  // requireAuth, SUPERADMIN olmayan oturumlarda institutionId'yi zorunlu kılar
  // (bkz. src/lib/api.ts) — bu dalda değer her zaman gerçek bir string'tir.
  const institutionId = auth.user.institutionId as string;

  const [totalAppointments, totalExaminations, totalPatients, totalStaff, latestLogs] = await Promise.all([
    prisma.appointment.count({
      where: { institutionId, branchId },
    }),
    prisma.examination.count({
      where: { institutionId, branchId },
    }),
    prisma.patient.count({
      where: {
        archivedAt: null,
        institutionId,
        homeBranchId: branchId,
      },
    }),
    prisma.user.count({
      where: {
        isActive: true,
        role: { not: "SUPERADMIN" },
        institutionId,
        branchMemberships: { some: { branchId, isActive: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        branchId,
        user: {
          role: { not: "SUPERADMIN" },
          institutionId,
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
