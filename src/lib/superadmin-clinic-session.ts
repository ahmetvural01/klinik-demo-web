import { prisma } from "@/lib/prisma";
import { clearRolePreviewCookie, setGhostAuthCookie, signToken } from "@/lib/auth";
import { writeAudit } from "@/lib/api";

// Sistem sahibi (süperadmin) istediği kliniğe girer ve orada her şeyi görüp
// değiştirebilir: rol yetki matrisi, şube izinleri, hizmet/fatura/demo
// kısıtları ona uygulanmaz (bkz. requireAuth'taki ghost kuralı ve
// getBranchScopedPermissions). Oturum kliniğin yöneticisi adına açılır,
// çünkü randevu, ödeme gibi kayıtlar bir klinik kullanıcısına bağlanır.
// Bu oturumun işlemleri kliniğin kendi İşlem Kayıtları'nda görünmez;
// süperadmin Denetim Günlüğü'nde izlenir (bkz. writeAudit).
// İki giriş yolu aynı fonksiyonu kullanır: platform panelindeki "Kliniğe
// gir" düğmesi ve klinik giriş ekranına süperadmin bilgileriyle giriş.
// Kliniğin içinde sol menüdeki "Rol Görünümü" ile ekran bir rolün
// yetkilerine daraltılarak önizlenebilir (bkz. requireAuth previewRole).

/** Klinik giriş ekranında klinik adı yerine yazılınca Platform Yönetimi açılır. */
export function isPlatformLoginName(name: string) {
  const value = name.trim().toLowerCase();
  return value === "" || value === "superadmin" || value === "admin";
}

export function findInstitutionByLoginName(name: string) {
  return prisma.institution.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

export type SuperadminClinicEntry =
  | { ok: true; institutionId: string; institutionName: string; fullName: string }
  | { ok: false; status: number; message: string };

export async function startSuperadminClinicSession(params: {
  superadmin: { id: string; fullName: string };
  institutionId: string;
  source: "panel" | "login";
}): Promise<SuperadminClinicEntry> {
  const institution = await prisma.institution.findUnique({
    where: { id: params.institutionId },
    select: { id: true, name: true },
  });
  if (!institution) return { ok: false, status: 404, message: "Klinik bulunamadı." };

  const userSelect = { id: true, fullName: true, tokenVersion: true } as const;
  const targetUser =
    (await prisma.user.findFirst({
      where: { institutionId: institution.id, role: "YONETICI", isActive: true },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    })) ??
    (await prisma.user.findFirst({
      where: { institutionId: institution.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    }));
  if (!targetUser) {
    return {
      ok: false,
      status: 404,
      message: "Bu klinikte aktif kullanıcı yok. Önce Platform Yönetimi > Klinikler'den kliniğe bir yönetici ekleyin.",
    };
  }

  const token = signToken({
    userId: targetUser.id,
    role: "YONETICI",
    institutionId: institution.id,
    // Ekranda ve "… tarafından güncellendi" bildirimlerinde süperadmin kendi adıyla görünür.
    fullName: params.superadmin.fullName || `${targetUser.fullName} [SA]`,
    ghost: true,
    tokenVersion: targetUser.tokenVersion,
  });
  // Ayrı çerez: süperadmin'in kendi platform oturumu (klinik_token) bozulmaz.
  await setGhostAuthCookie(token);
  // Kliniğe her girişte tam görünümle başlanır; rol önizlemesi menüden seçilir.
  await clearRolePreviewCookie();

  await writeAudit(
    targetUser.id,
    "IMPERSONATE_START",
    `${institution.name} kliniğine "${params.superadmin.fullName}" (superadmin) ${params.source === "login" ? "klinik giriş ekranından" : "platform panelinden"} ${targetUser.fullName} kimliğiyle giriş yaptı`,
    { id: params.superadmin.id, role: "SUPERADMIN" },
  );

  return { ok: true, institutionId: institution.id, institutionName: institution.name, fullName: targetUser.fullName };
}
