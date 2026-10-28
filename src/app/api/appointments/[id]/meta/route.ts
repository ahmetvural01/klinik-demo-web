import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

type Params = { params: Promise<{ id: string }> };

/** Randevu penceresinin alt satırı: kim oluşturdu, en son kim ne zaman değiştirdi. */
export async function GET(_request: NextRequest, props: Params) {
  const { id } = await props.params;
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });

  const appointment = await prisma.appointment.findFirst({
    where: { id, institutionId: auth.user.institutionId, branchId: branch.branchId },
    select: { createdAt: true, updatedAt: true, createdById: true, updatedById: true },
  });
  if (!appointment) return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });

  const ids = [appointment.createdById, appointment.updatedById].filter((value): value is string => Boolean(value));
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids }, institutionId: auth.user.institutionId }, select: { id: true, fullName: true } })
    : [];
  const nameOf = (userId: string | null) => (userId ? users.find((user) => user.id === userId)?.fullName || null : null);
  return NextResponse.json({
    createdAt: appointment.createdAt,
    createdBy: nameOf(appointment.createdById),
    updatedAt: appointment.updatedById ? appointment.updatedAt : null,
    updatedBy: nameOf(appointment.updatedById),
  });
}
