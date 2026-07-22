import { Role } from "@prisma/client";
import { getPermissionMap } from "@/lib/role-permission-store";

export async function can(role: Role, permission: string) {
  const permissionMap = await getPermissionMap();
  const permissions = permissionMap[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
