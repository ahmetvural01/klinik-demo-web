import { prisma } from "@/lib/prisma";

/**
 * Hastaya görünen klinik adı ve telefonu TEK kuraldan gelir: Ayarlar ›
 * Klinik bilgileri (Setting.institutionName / institutionPhone) doluysa o,
 * değilse kurum kaydı (Institution.name / phone). Önceden randevu, ödeme ve
 * doğum günü mesajları ayar adını; bayram mesajı ve SMS izni bağlantısı ise
 * kurum kaydını kullanıyordu — aynı hastaya iki farklı klinik adı gidiyordu (H-6).
 */
export type ClinicDisplayInfo = {
  name: string;
  phone: string | null;
  /** Kurum logosu (https adresi ya da küçük data: görseli); yoksa null. */
  logoUrl: string | null;
};

export function resolveClinicDisplayInfo(institution: {
  name: string;
  phone?: string | null;
  logo?: string | null;
  settings?: { institutionName?: string | null; institutionPhone?: string | null } | null;
}): ClinicDisplayInfo {
  return {
    name: institution.settings?.institutionName?.trim() || institution.name,
    phone: institution.settings?.institutionPhone?.trim() || institution.phone?.trim() || null,
    logoUrl: institution.logo?.trim() || null,
  };
}

export async function getClinicDisplayInfo(institutionId: string): Promise<ClinicDisplayInfo | null> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: {
      name: true,
      phone: true,
      logo: true,
      settings: { select: { institutionName: true, institutionPhone: true } },
    },
  });
  return institution ? resolveClinicDisplayInfo(institution) : null;
}

/** Hastaya giden mesajlarda ve hasta sayfalarında yazılan klinik adı. */
export async function getClinicDisplayName(institutionId: string): Promise<string> {
  return (await getClinicDisplayInfo(institutionId))?.name || "";
}
