import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ACTIVE_BRANCH_COOKIE = "klinik_active_branch";

export type BranchSummary = {
  id: string;
  name: string;
  code: string | null;
  colorCode: string;
  isHeadquarters: boolean;
  isPrimary: boolean;
  isBranchManager: boolean;
  permissionCodes: string[] | null;
};

export type BranchContext = {
  institutionId: string | null;
  activeBranchId: string | null;
  activeBranch: BranchSummary | null;
  branches: BranchSummary[];
};

type BranchContextUser = {
  id: string;
  role: string;
  institutionId: string | null;
  ghost?: boolean;
};

export async function resolveBranchContext(user: BranchContextUser): Promise<BranchContext> {
  if (!user.institutionId) {
    return {
      institutionId: null,
      activeBranchId: null,
      activeBranch: null,
      branches: [],
    };
  }

  const rows = user.ghost || user.role === "SUPERADMIN"
    ? await prisma.clinicBranch.findMany({
        where: { institutionId: user.institutionId, isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          colorCode: true,
          isHeadquarters: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }).then((items) => items.map((item) => ({
        ...item,
        isPrimary: item.isHeadquarters,
        isBranchManager: true,
        permissionCodes: null,
      })))
    : await prisma.userBranch.findMany({
        where: {
          userId: user.id,
          institutionId: user.institutionId,
          isActive: true,
          branch: { isActive: true },
        },
        select: {
          isPrimary: true,
          isBranchManager: true,
          permissionCodes: true,
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              colorCode: true,
              isHeadquarters: true,
            },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { branch: { sortOrder: "asc" } }],
      }).then((items) => items.map((item) => ({
        ...item.branch,
        isPrimary: item.isPrimary,
        isBranchManager: item.isBranchManager,
        permissionCodes: Array.isArray(item.permissionCodes)
          ? item.permissionCodes.filter((code): code is string => typeof code === "string")
          : null,
      })));

  const selected = (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value || "";
  // Klinik personeli her zaman tek bir fiziksel şubenin bağlamında çalışır —
  // kurum geneli birleşik ("Tüm Şubeler") görünüm downstream API uçlarının
  // çoğunda desteklenmediği için kaldırıldı (bkz. denetim raporu): yarım
  // uygulanmış bir özellik, açık bırakılsaydı bazı ekranlarda çalışıp
  // bazılarında "önce şube seçin" hatası vererek kafa karıştırırdı.
  const activeBranch = rows.find((branch) => branch.id === selected)
    || rows.find((branch) => branch.isPrimary)
    || rows[0]
    || null;

  return {
    institutionId: user.institutionId,
    activeBranchId: activeBranch?.id || null,
    activeBranch,
    branches: rows,
  };
}

export function hasBranchPermission(context: BranchContext, permission: string) {
  if (!context.activeBranch) return false;
  const codes = context.activeBranch?.permissionCodes;
  return codes === null || codes === undefined || codes.includes("*") || codes.includes(permission);
}

export function getBranchScopedPermissions(
  context: BranchContext,
  rolePermissions: readonly string[],
  elevated = false,
) {
  if (elevated) return ["*"];
  if (!context.activeBranch) return [];

  const branchPermissions = context.activeBranch.permissionCodes;
  if (branchPermissions === null || branchPermissions === undefined || branchPermissions.includes("*")) {
    return [...rolePermissions];
  }

  const allowed = new Set(branchPermissions);
  return rolePermissions.filter((permission) => allowed.has(permission));
}

export function requireBranchManager(context: BranchContext) {
  const branch = requireActiveBranch(context);
  if (!branch.ok) return branch;
  if (!context.activeBranch?.isBranchManager) {
    return { ok: false as const, message: "Bu şubenin personel erişimlerini yalnızca şube yöneticisi değiştirebilir." };
  }
  return { ok: true as const, branchId: branch.branchId };
}

export function requireActiveBranch(context: BranchContext) {
  if (!context.activeBranchId) {
    return { ok: false as const, message: "Erişilebilir aktif şube bulunamadı." };
  }
  return { ok: true as const, branchId: context.activeBranchId };
}
