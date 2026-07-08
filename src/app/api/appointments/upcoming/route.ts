import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const take = Math.min(Math.max(Number(request.nextUrl.searchParams.get("take") || 20), 1), 50);

  if (q.length < 2) {
    return NextResponse.json({ appointments: [] });
  }

  const now = new Date();

  const appointments = await prisma.appointment.findMany({
    where: {
      startAt: { gte: now },
      status: { not: "IPTAL" },
      patient: {
        ...(auth.user.role !== "SUPERADMIN" ? { institutionId: auth.user.institutionId } : {}),
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { tcNo: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      patient: { select: { id: true, fullName: true, phone: true, tcNo: true } },
      doctor: { select: { id: true, fullName: true } },
    },
    orderBy: { startAt: "asc" },
    take,
  });

  const hidePhone = auth.user.role === "DOKTOR" || auth.user.role === "ASISTAN";
  const result = hidePhone
    ? appointments.map((a) => ({
        ...a,
        patient: a.patient ? { ...a.patient, phone: null } : a.patient,
      }))
    : appointments;

  return NextResponse.json({ appointments: result });
}
