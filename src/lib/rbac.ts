import { Role } from "@prisma/client";

const permissionMap: Record<Role, string[]> = {
  SUPERADMIN: ["*"],
  YONETICI: ["*"],
  DOKTOR: [
    "dashboard:read",
    "appointments:read",
    "appointments:write",
    "patients:read",
    "examinations:read",
    "examinations:write",
    "finance:read",
    "payments:read",
    "payments:write",
    "support:read",
    "profile:write"
  ],
  ASISTAN: [
    "dashboard:read",
    "appointments:read",
    "appointments:write",
    "patients:read",
    "patients:write",
    "payments:read",
    "payments:write",
    "support:read",
    "support:write",
    "profile:write"
  ],
  BANKO: ["appointments:read", "appointments:write", "patients:read", "patients:write", "payments:read", "payments:write", "support:read", "support:write"],
  MUHASEBE: ["finance:read", "finance:write", "reports:read", "prices:read", "prices:write", "payments:read", "support:read"]
};

export function can(role: Role, permission: string) {
  const permissions = permissionMap[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
