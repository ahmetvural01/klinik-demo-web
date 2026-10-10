// Yalnız sunucu bileşenlerinden çağrılır (oturum çerezi + veritabanı okur).
import type { Role } from "@prisma/client";
import { getCurrentUserFast } from "@/lib/auth";
import { getBranchScopedPermissions, resolveBranchContext } from "@/lib/branch-context";
import { getPermissionMap } from "@/lib/role-permission-store";

export type FinanceAccess = {
  userId: string;
  role: string;
  has: (permission: string) => boolean;
};

/**
 * Finans adreslerinin (/kasa, /taksit, /gider, /finans) sunucu tarafı
 * yönlendirmesi için oturumdaki ETKİN izinler — panel düzeniyle
 * (`(panel)/layout.tsx`) birebir aynı hesap: rol izinleri, aktif şubenin
 * izin daraltması, kliniğe girmiş süperadmin (rol önizlemesi yoksa) tam yetki.
 * Önceden bu adresler herkesi /muhasebe'ye gönderiyor, izni olmayan (ör.
 * doktor, asistan) oradan /yetkisiz'e düşüyordu. Yetkinin asıl denetimi her
 * API'de ayrıca yapılır; burada yalnız doğru sayfaya gönderilir.
 */
export async function getFinanceAccess(): Promise<FinanceAccess | null> {
  const user = await getCurrentUserFast();
  if (!user) return null;
  const elevated = user.ghost && !user.previewRole;
  const [branchContext, permissionMap] = await Promise.all([
    resolveBranchContext({ id: user.id, role: user.rawRole, institutionId: user.institution || null, ghost: elevated }),
    getPermissionMap(),
  ]);
  const permissions = getBranchScopedPermissions(branchContext, permissionMap[user.role as Role] || [], elevated);
  const has = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  return { userId: user.id, role: user.role, has };
}

/** Muhasebe ekranı açılamayan kullanıcının gideceği anlamlı yer (önce kendi günlük ekranı). */
export function financeFallbackPath(access: FinanceAccess | null, prefer: "anasayfa" | "hasta" = "anasayfa") {
  // Klinik giriş ekranına doğrudan (eski "/giris" fazladan bir yönlendirme adımıydı).
  if (!access) return "/klinik/giris";
  const order = prefer === "hasta" ? ["hasta", "anasayfa"] : ["anasayfa", "hasta"];
  for (const target of order) {
    if (target === "anasayfa" && access.has("dashboard:read")) return "/anasayfa";
    if (target === "hasta" && access.has("patients:read")) return "/hasta";
  }
  return "/profil";
}
