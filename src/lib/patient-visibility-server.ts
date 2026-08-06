import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";

export async function shouldHidePatientPhoneForRole(role: string | null | undefined) {
  if (!role) return true;
  return !(await can(role as Role, "patients:phone"));
}
