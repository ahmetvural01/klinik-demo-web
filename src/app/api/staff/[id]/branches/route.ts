import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireBranchManager } from "@/lib/branch-context";
import { ALL_PERMISSIONS } from "@/lib/role-permissions";
import { can } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

function rate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : undefined;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("branches:assign");
  if (auth.error) return auth.error;
  const managed = requireBranchManager(auth.user.branchContext);
  if (!managed.ok) return NextResponse.json({ message: managed.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const { id: userId } = await params;
  const body = await request.json().catch(() => null);
  const enabled = body?.enabled !== false;
  const staff = await prisma.user.findFirst({
    where: { id: userId, institutionId, role: { not: "SUPERADMIN" } },
    select: { id: true, fullName: true, role: true, isActive: true },
  });
  if (!staff) return NextResponse.json({ message: "Personel bulunamadı." }, { status: 404 });
  if (enabled && !staff.isActive) return NextResponse.json({ message: "Pasif personele şube erişimi verilemez." }, { status: 409 });

  const requestedCodes = body?.permissionCodes === null
    ? null
    : Array.isArray(body?.permissionCodes)
      ? Array.from(new Set<string>(body.permissionCodes.filter((code: unknown): code is string => typeof code === "string" && ALL_PERMISSIONS.includes(code))))
      : undefined;
  if (requestedCodes) {
    const ceiling = await Promise.all(requestedCodes.map(async (code) => ({ code, allowed: await can(staff.role, code) })));
    if (ceiling.some(({ allowed }) => !allowed)) {
      return NextResponse.json({ message: "Personelin rolünde bulunmayan bir yetki şube üzerinden verilemez." }, { status: 400 });
    }
  }

  const genelYuzde = rate(body?.genelYuzde);
  const kkYuzde = rate(body?.kkYuzde);
  const maasYuzde = rate(body?.maasYuzde);
  if ([genelYuzde, kkYuzde, maasYuzde].some((value) => value === undefined)) {
    return NextResponse.json({ message: "Hakediş oranları 0 ile 100 arasında olmalıdır." }, { status: 400 });
  }

  try {
    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.userBranch.findUnique({ where: { userId_branchId: { userId, branchId: managed.branchId } } });
      if (!enabled) {
        if (existing?.isBranchManager) throw new Error("MANAGER_CONTROL_PLANE");
        if (!existing) return null;
        await tx.userBranch.update({ where: { id: existing.id }, data: { isActive: false, isPrimary: false } });
        if (existing.isPrimary) {
          const fallback = await tx.userBranch.findFirst({ where: { userId, isActive: true, NOT: { id: existing.id } }, orderBy: { createdAt: "asc" } });
          if (fallback) await tx.userBranch.update({ where: { id: fallback.id }, data: { isPrimary: true } });
        }
        return null;
      }

      const hasPrimary = await tx.userBranch.count({ where: { userId, isActive: true, isPrimary: true } });
      const data = {
        isActive: true,
        ...(requestedCodes !== undefined && { permissionCodes: requestedCodes === null ? Prisma.DbNull : requestedCodes }),
        ...(genelYuzde !== undefined && { genelYuzde }),
        ...(kkYuzde !== undefined && { kkYuzde }),
        ...(maasYuzde !== undefined && { maasYuzde }),
      };
      const updated = await tx.userBranch.upsert({
        where: { userId_branchId: { userId, branchId: managed.branchId } },
        create: { institutionId, userId, branchId: managed.branchId, isPrimary: hasPrimary === 0, ...data },
        update: data,
      });
      if (staff.role === "DOKTOR" && genelYuzde !== undefined && kkYuzde !== undefined && maasYuzde !== undefined) {
        await tx.doctorRateHistory.create({
          data: { institutionId, branchId: managed.branchId, doctorId: userId, genelYuzde: genelYuzde ?? 0, kkYuzde: kkYuzde ?? 0, maasYuzde: maasYuzde ?? 0, effectiveFrom: new Date() },
        });
      }
      return updated;
    });
    await writeAudit(auth.user.id, enabled ? "STAFF_BRANCH_ACCESS_UPDATE" : "STAFF_BRANCH_ACCESS_REVOKE", `${staff.fullName}; Şube: ${managed.branchId}`);
    return NextResponse.json({ ok: true, membership });
  } catch (error) {
    if (error instanceof Error && error.message === "MANAGER_CONTROL_PLANE") {
      return NextResponse.json({ message: "Şube yöneticisi bağlantısı bu ekrandan kaldırılamaz." }, { status: 409 });
    }
    throw error;
  }
}
