import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireBranchManager } from "@/lib/branch-context";
import { ALL_PERMISSIONS } from "@/lib/role-permissions";
import { can } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const manage = request.nextUrl.searchParams.get("manage") === "1";
  const auth = await requireAuth(manage ? "branches:assign" : undefined);
  if (auth.error) return auth.error;
  if (!manage) return NextResponse.json(auth.user.branchContext);

  const manager = requireBranchManager(auth.user.branchContext);
  if (!manager.ok) return NextResponse.json({ message: manager.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const [branch, staff] = await Promise.all([
    prisma.clinicBranch.findFirst({
      where: { id: manager.branchId, institutionId, isActive: true },
      include: { _count: { select: { memberships: true, clinicUnits: true, appointments: true, homePatients: true } } },
    }),
    prisma.user.findMany({
      where: { institutionId, role: { not: "SUPERADMIN" } },
      select: {
        id: true,
        fullName: true,
        role: true,
        isActive: true,
        branchMemberships: {
          where: { branchId: manager.branchId },
          select: {
            isPrimary: true,
            isActive: true,
            isBranchManager: true,
            permissionCodes: true,
            genelYuzde: true,
            kkYuzde: true,
            maasYuzde: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    }),
  ]);
  if (!branch) return NextResponse.json({ message: "Aktif şube bulunamadı." }, { status: 404 });

  // "Ana şube" bilgisi — bu ekranın "rol yetkisi değiştirme" değil "bu
  // personelin BAŞKA (misafir) bir şubedeki erişimini yönetme" ekranı olduğunu
  // netleştirmek için: yönetilen şube personelin kendi ana şubesi değilse
  // arayüzde açık bir "misafir erişimi" uyarısı gösterilir. Prisma tek bir
  // sorguda aynı ilişkiyi iki farklı filtreyle seçemediği için ayrı sorgulanır.
  const homeMemberships = await prisma.userBranch.findMany({
    where: { userId: { in: staff.map((member) => member.id) }, isPrimary: true, isActive: true },
    select: { userId: true, branch: { select: { id: true, name: true } } },
  });
  const homeBranchByUserId = new Map(homeMemberships.map((row) => [row.userId, row.branch]));

  const staffWithPermissions = await Promise.all(staff.map(async (member) => ({
    ...member,
    homeBranch: homeBranchByUserId.get(member.id) || null,
    allowedPermissionCodes: (await Promise.all(ALL_PERMISSIONS.map(async (code) => ({ code, allowed: await can(member.role, code) }))))
      .filter(({ allowed }) => allowed)
      .map(({ code }) => code),
  })));
  return NextResponse.json({ branch, staff: staffWithPermissions, activeBranchId: manager.branchId });
}

// Şube yaşam döngüsü klinik panelinden yönetilemez. Oluşturma, düzenleme,
// bağlama ve pasife alma yalnızca /api/superadmin/institutions/:id/branches
// kontrol düzleminde yapılır.
export async function POST() {
  return NextResponse.json({ message: "Şube oluşturma bu ekrandan yapılamaz." }, { status: 403 });
}

export async function PATCH() {
  return NextResponse.json({ message: "Şube bilgileri bu ekrandan değiştirilemez." }, { status: 403 });
}
