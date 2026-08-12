import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const instId = auth.user.institutionId;
  const operationScope = { ...(instId ? { institutionId: instId } : {}), branchId: branch.branchId };

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

  const [totalPatients, totalAppointments, totalExaminations, totalStaff, weeklyAppts] = await Promise.all([
    prisma.patient.count({
      where: { ...(instId ? { institutionId: instId } : {}), homeBranchId: branch.branchId },
    }),
    prisma.appointment.count({
      where: operationScope,
    }),
    prisma.examination.count({
      where: operationScope,
    }),
    prisma.user.count({
      where: { isActive: true, ...(instId ? { institutionId: instId } : {}), branchMemberships: { some: { branchId: branch.branchId, isActive: true } } },
    }),
    // Son 7 günün randevularını tek sorguda al
    prisma.appointment.findMany({
      where: {
        startAt: { gte: weekAgo },
        ...operationScope,
      },
      select: { startAt: true },
    }),
  ]);

    const dayNames = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    const weekData = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - index));
      const dateKey = date.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
      const count = weeklyAppts.filter(
        (appointment) => appointment.startAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }) === dateKey,
      ).length;
      return { label: dayNames[date.getDay()], count };
    });

  return NextResponse.json({ totalAppointments, totalExaminations, totalPatients, totalStaff, weekData });
}
