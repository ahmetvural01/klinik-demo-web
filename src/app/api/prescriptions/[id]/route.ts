import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("prescriptions:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const prescription = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
  });

  if (!prescription) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(prescription);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("prescriptions:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const existing = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }

  if (existing.status !== "VOID") {
    await prisma.prescription.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: auth.user.institutionId as string,
          branchId: branch.branchId,
        },
      },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: auth.user.id,
        voidReason: "Kullanıcı tarafından iptal edildi.",
      },
    });
  }
  await writeAudit(auth.user.id, "PRESCRIPTION_VOID", "Reçete iptal edildi; klinik geçmişi korundu.");
  return NextResponse.json({ ok: true, status: "VOID" });
}
