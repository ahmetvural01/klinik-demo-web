import { prisma } from "@/lib/prisma";

export type StaffLimitCheck = {
  institutionId: string;
  role: string;
  isActive: boolean;
  // Güncelleme senaryosunda mevcut personelin kendisi sayıma dahil edilmemeli
  // — aksi halde "aktif kalmaya devam eden" bir doktor bile limit dolu diye
  // engellenir.
  excludeUserId?: string;
};

// Klinik kendi personel ekranından (/api/staff) veya süperadmin panelinden yeni
// personel eklerken/güncellerken kullanılır. Institution.maxActiveUsers ve
// maxActiveDoctors alanları abonelik planından senkronlanır (bkz.
// src/lib/subscription-plans.ts). Sadece "aktif" hale gelecek kayıtlar kontrol
// edilir — pasif personel eklemek/bırakmak limitten etkilenmez.
export async function checkStaffLimit({ institutionId, role, isActive, excludeUserId }: StaffLimitCheck): Promise<string | null> {
  if (!isActive) return null;

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { maxActiveUsers: true, maxActiveDoctors: true },
  });
  if (!institution) return null;
  if (!institution.maxActiveUsers && !institution.maxActiveDoctors) return null;

  const [activeUsers, activeDoctors] = await Promise.all([
    prisma.user.count({
      where: { institutionId, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    }),
    prisma.user.count({
      where: { institutionId, isActive: true, role: "DOKTOR", ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    }),
  ]);

  if (institution.maxActiveUsers && activeUsers + 1 > institution.maxActiveUsers) {
    return `Abonelik paketinizde en fazla ${institution.maxActiveUsers} aktif kullanıcı bulunabilir. Yeni kişiyi ekleyebilmek için paketinizi yükseltin veya mevcut bir personeli pasife alın.`;
  }

  if (role === "DOKTOR" && institution.maxActiveDoctors && activeDoctors + 1 > institution.maxActiveDoctors) {
    return `Abonelik paketinizde en fazla ${institution.maxActiveDoctors} aktif doktor kaydı bulunabilir. Yeni doktor ekleyebilmek için paketinizi yükseltin veya mevcut bir doktoru pasife alın.`;
  }

  return null;
}
