import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  const instId = auth.user.institutionId;
  const institutionScope = instId ? { doctor: { institutionId: instId } } : {};

  // Haftalık tarih aralığı (son 7 gün)
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const [totalAppointments, totalExaminations, appointmentPatients, examinationPatients, totalStaff, weeklyAppts] = await Promise.all([
    prisma.appointment.count({
      where: institutionScope,
    }),
    prisma.examination.count({
      where: institutionScope,
    }),
    prisma.appointment.findMany({
      where: institutionScope,
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.examination.findMany({
      where: institutionScope,
      select: { patientId: true },
      distinct: ["patientId"],
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

  const totalPatients = new Set([
    ...appointmentPatients.map((row) => row.patientId),
    ...examinationPatients.map((row) => row.patientId),
  ]).size;

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
