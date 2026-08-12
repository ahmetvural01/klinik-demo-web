import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok || !auth.user.institutionId) {
    return NextResponse.json({ message: activeBranch.ok ? "Kurum bilgisi bulunamadı." : activeBranch.message }, { status: 403 });
  }

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
      branchId: activeBranch.branchId,
      patient: {
        institutionId: auth.user.institutionId,
        homeBranchId: activeBranch.branchId,
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

  const hidePhone = await shouldHidePatientPhoneForRole(auth.user.role);
  const result = hidePhone
    ? appointments.map((a) => ({
        ...a,
        patient: a.patient ? { ...a.patient, phone: null, tcNo: a.patient.tcNo ? "***" : a.patient.tcNo } : a.patient,
      }))
    : appointments;

  return NextResponse.json({ appointments: result });
}
