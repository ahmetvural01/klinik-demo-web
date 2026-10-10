import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireBranchManager } from "@/lib/branch-context";
import { ALL_PERMISSIONS } from "@/lib/role-permissions";
import { getPermissionMap } from "@/lib/role-permission-store";

export async function GET(request: NextRequest) {
  const manage = request.nextUrl.searchParams.get("manage") === "1";
  const auth = await requireAuth(manage ? "branches:assign" : undefined);
  if (auth.error) return auth.error;
  if (!manage) return NextResponse.json(auth.user.branchContext);

  const manager = requireBranchManager(auth.user.branchContext);
  if (!manager.ok) return NextResponse.json({ message: manager.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  // Hepsi tek turda (paralel). Önceden her personel için 80 iznin her biri ayrı
  // ayrı `can()` ile (her çağrı izin haritasını veritabanından okuyarak)
  // hesaplanıyordu: 15 personelde ~1.200 sorgu, ölçülen 5–7 sn ve diğer
  // kullanıcıları da yavaşlatan dolu bağlantı havuzu. İzin haritası artık bir
  // kez okunur, tavan bellekte hesaplanır (sonuç `can()` ile aynı). Şubenin
  // kullanılmayan randevu/hasta sayımları (_count) da kaldırıldı.
  const [branch, staff, homeMemberships, permissionMap] = await Promise.all([
    prisma.clinicBranch.findFirst({
      where: { id: manager.branchId, institutionId, isActive: true },
      select: { id: true, name: true, code: true, address: true, district: true, city: true, colorCode: true, isHeadquarters: true },
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
    // "Ana şube" bilgisi — bu ekranın "rol yetkisi değiştirme" değil "bu
    // personelin BAŞKA (misafir) bir şubedeki erişimini yönetme" ekranı olduğunu
    // netleştirmek için. Prisma tek bir sorguda aynı ilişkiyi iki farklı
    // filtreyle seçemediği için ayrı sorgulanır (kurumun tüm ana şube kayıtları).
    prisma.userBranch.findMany({
      where: { institutionId, isPrimary: true, isActive: true },
      select: { userId: true, branch: { select: { id: true, name: true } } },
    }),
    getPermissionMap(),
  ]);
  if (!branch) return NextResponse.json({ message: "Aktif şube bulunamadı." }, { status: 404 });

  const homeBranchByUserId = new Map(homeMemberships.map((row) => [row.userId, row.branch]));
  const ceilingByRole = new Map<string, string[]>();
  const ceilingFor = (role: Role) => {
    const cached = ceilingByRole.get(role);
    if (cached) return cached;
    const granted = permissionMap[role] ?? [];
    const allowed = granted.includes("*") ? [...ALL_PERMISSIONS] : ALL_PERMISSIONS.filter((code) => granted.includes(code));
    ceilingByRole.set(role, allowed);
    return allowed;
  };

  const staffWithPermissions = staff.map((member) => ({
    ...member,
    homeBranch: homeBranchByUserId.get(member.id) || null,
    allowedPermissionCodes: ceilingFor(member.role),
  }));
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
