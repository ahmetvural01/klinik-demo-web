import type { Institution, Prisma } from "@prisma/client";

export function operationalInstitutionWhere(now = new Date()): Prisma.InstitutionWhereInput {
  return {
    isActive: true,
    serviceMode: "NORMAL",
    AND: [
      { OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }] },
      { OR: [{ isDemo: false }, { demoExpiresAt: null }, { demoExpiresAt: { gte: now } }] },
    ],
  };
}

export function isInstitutionOperational(
  institution: Pick<Institution, "isActive" | "serviceMode" | "suspendedUntil" | "isDemo" | "demoExpiresAt">,
  now = new Date(),
) {
  return institution.isActive
    && institution.serviceMode === "NORMAL"
    && (!institution.suspendedUntil || institution.suspendedUntil <= now)
    && (!institution.isDemo || !institution.demoExpiresAt || institution.demoExpiresAt >= now);
}
