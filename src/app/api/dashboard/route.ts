import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const instId = auth.user.institutionId;

  // Haftalık tarih aralığı (son 7 gün)
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const [totalAppointments, totalExaminations, totalPatients, totalStaff, weeklyAppts] = await Promise.all([
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
    // Son 7 günün randevularını tek sorguda al
    prisma.appointment.findMany({
      where: {
        startAt: { gte: weekAgo },
        ...(instId ? { doctor: { institutionId: instId } } : {}),
      },
      select: { startAt: true },
    }),
  ]);

  // Günlük gruplama JS tarafında yap (DB round-trip yerine)
  const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const count = weeklyAppts.filter(a => a.startAt.toISOString().split("T")[0] === dateStr).length;
    return { label: DAY_NAMES[d.getDay()], count };
  });

  return NextResponse.json({ totalAppointments, totalExaminations, totalPatients, totalStaff, weekData });
}
