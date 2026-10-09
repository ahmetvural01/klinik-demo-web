import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAuditWhere } from "@/lib/audit-query";
import { isValidDateKey, turkeyDayRangeUtc } from "@/lib/tz";

/**
 * Platform Denetim Günlüğü filtreleri — liste ve CSV dışa aktarma AYNI
 * filtreyi kullanır. Ortak buildAuditWhere'e (arama) ek olarak: klinik,
 * işlem grubu, kim yaptı ve Türkiye saatine göre tarih aralığı. Klinik
 * filtresi işlemi yapanın kliniğine VE platform yöneticisinin o kliniğe
 * yaptığı işlemlere (kayıt metninde klinik adı geçer) bakar.
 */
const GROUP_PREFIXES: Record<string, string[]> = {
  giris: ["LOGIN", "LOGOUT", "IMPERSONATE_"],
  fatura: ["SUPERADMIN_INVOICE_"],
  klinik: ["SUPERADMIN_INSTITUTION_", "SUPERADMIN_BRANCH_", "SUPERADMIN_DATA_"],
  sms: ["SMS_", "SUPERADMIN_SMS_", "PLATFORM_SMS_", "CELEBRATION_DAY_", "SUPERADMIN_WHATSAPP_"],
  platform: ["SUPERADMIN_ROLE_", "SUPERADMIN_SMTP_", "SUPERADMIN_CONSENT_", "PLATFORM_THEME_", "SUPERADMIN_CREATE", "SUPERADMIN_UPDATE", "SUPERADMIN_ANNOUNCEMENT_", "SUPERADMIN_SUPPORT_", "SUPERADMIN_AD_"],
  hasta: ["PATIENT_", "APPOINTMENT_", "EXAM_", "TREATMENT_", "PRESCRIPTION_"],
  finans: ["PAYMENT_", "KASA_", "GIDER_", "TAKSIT_", "FIRMA_", "PURCHASE_", "EXPENSE_"],
};

export const AUDIT_GROUP_KEYS = Object.keys(GROUP_PREFIXES);

export async function buildPlatformAuditWhere(searchParams: URLSearchParams): Promise<Prisma.AuditLogWhereInput> {
  const baseParams = new URLSearchParams(searchParams);
  baseParams.delete("startDate");
  baseParams.delete("endDate");
  const parts: Prisma.AuditLogWhereInput[] = [buildAuditWhere(baseParams)];

  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  if ((startDate && isValidDateKey(startDate)) || (endDate && isValidDateKey(endDate))) {
    parts.push({
      createdAt: {
        ...(startDate && isValidDateKey(startDate) ? { gte: turkeyDayRangeUtc(startDate).start } : {}),
        ...(endDate && isValidDateKey(endDate) ? { lte: turkeyDayRangeUtc(endDate).end } : {}),
      },
    });
  }

  const institutionId = searchParams.get("institutionId") || "";
  if (institutionId) {
    const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
    parts.push({
      OR: [
        { user: { institutionId } },
        ...(institution?.name ? [{ detail: { contains: institution.name } }] : []),
      ],
    });
  }

  const group = searchParams.get("group") || "";
  const prefixes = GROUP_PREFIXES[group];
  if (prefixes) {
    parts.push({ OR: prefixes.map((prefix) => (prefix.endsWith("_") ? { action: { startsWith: prefix } } : { action: prefix })) });
  }

  const actor = searchParams.get("actor") || "";
  if (actor === "platform") parts.push({ OR: [{ actorRole: "SUPERADMIN" }, { isGhost: true }] });
  if (actor === "klinik") parts.push({ NOT: { OR: [{ actorRole: "SUPERADMIN" }, { isGhost: true }] } });

  return { AND: parts };
}
