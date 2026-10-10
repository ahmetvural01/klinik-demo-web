import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { hasEffectivePermission } from "@/lib/api";

/**
 * Yalnız role bakar. Kişiye özel kısıtlamayı (Personel › Şube erişimi'nden
 * "Telefon ve TC görme" kapatılan kişi) görmez: o kişi ekranda *** görürken
 * API'de telefon ve TC açık gelirdi. Yeni kod `shouldHidePatientPhoneForUser`
 * kullanır; bu fonksiyon geriye uyumluluk için duruyor.
 */
export async function shouldHidePatientPhoneForRole(role: string | null | undefined) {
  if (!role) return true;
  return !(await can(role as Role, "patients:phone"));
}

/**
 * KVKK: hasta telefonu ve TC kimlik no bu kullanıcıdan gizlensin mi? Rol
 * matrisi + şube izin kodları birlikte (hasEffectivePermission). Süperadmin
 * ve görünmez oturum eskisi gibi görür; rol önizlemesi önizlenen rolün kuralını alır.
 */
export async function shouldHidePatientPhoneForUser(user: Parameters<typeof hasEffectivePermission>[0]) {
  return !(await hasEffectivePermission(user, "patients:phone"));
}
