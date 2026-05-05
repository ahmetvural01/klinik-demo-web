import { Role } from "@prisma/client";
import { getPermissionMap } from "@/lib/role-permission-store";

export function can(role: Role, permission: string) {
  const permissionMap = getPermissionMap();
  const permissions = permissionMap[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
