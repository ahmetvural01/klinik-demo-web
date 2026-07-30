import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const instId = auth.user.institutionId;
  const institutionScope = instId ? { patient: { institutionId: instId } } : {};

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

  const [totalPatients, totalAppointments, totalExaminations, totalStaff, weeklyAppts] = await Promise.all([
    prisma.patient.count({
      where: instId ? { institutionId: instId } : {},
    }),
    prisma.appointment.count({
      where: institutionScope,
    }),
    prisma.examination.count({
      where: institutionScope,
    }),
    prisma.user.count({
      where: { isActive: true, ...(instId ? { institutionId: instId } : {}) },
    }),
    // Son 7 günün randevularını tek sorguda al
    prisma.appointment.findMany({
      where: {
        startAt: { gte: weekAgo },
        ...institutionScope,
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
