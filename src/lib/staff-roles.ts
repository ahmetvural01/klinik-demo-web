// "Kim hekim sayılır?" sorusunun TEK cevabı. Sunucu tarafı (randevu bloğu,
// online randevu doktor listesi — bkz. /api/doctor-blocks, /api/public/booking/
// doctors) bir YÖNETİCİ'yi "Doktor olarak gizle" işaretli değilse hekim sayar;
// Profile.hideAsDoctor varsayılanı da false'tur. Önceden bazı ekranlar
// `profile?.hideAsDoctor === false` kullanıyordu: profil kaydı olmayan bir
// yönetici-hekim Randevular'da hekim olarak görünürken Hastalar/Lab/Muhasebe/
// Hakediş doktor listelerinde görünmüyordu. Bütün istemci ekranları bunu
// kullanmalı.

export type StaffLike = {
  id: string;
  fullName: string;
  role: string;
  isActive?: boolean | null;
  profile?: { hideAsDoctor?: boolean | null } | null;
};

export function isEffectiveDoctor(person: StaffLike): boolean {
  if (person.isActive === false) return false;
  if (person.role === "DOKTOR") return true;
  if (person.role === "YONETICI") return !person.profile?.hideAsDoctor;
  return false;
}

/** Hekim listesini Türkçe alfabetik sırada döndürür. */
export function selectDoctors<T extends StaffLike>(staff: readonly T[] | null | undefined): T[] {
  return (staff || []).filter(isEffectiveDoctor).sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
}

export const ROLE_LABELS: Record<string, string> = {
  YONETICI: "Klinik yöneticisi",
  DOKTOR: "Doktor",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
  SUPERADMIN: "Platform yöneticisi",
};

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) || role || "";
}
