import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const prescription = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
  });

  if (!prescription) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(prescription);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const existing = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }

  await prisma.prescription.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "PRESCRIPTION_DELETE", `Reçete silindi`);
  return NextResponse.json({ ok: true });
}
