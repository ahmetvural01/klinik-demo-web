import { findRouteRequirement } from "@/lib/nav";

export type PanelPermissionRequirement = {
  anyOf: string[];
};

export function hasPanelPermission(permissions: readonly string[], permission: string) {
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyPanelPermission(permissions: readonly string[], required: readonly string[]) {
  return permissions.includes("*") || required.some((permission) => permissions.includes(permission));
}

/** Adresin açılması için gereken izinler (tablo: src/lib/nav.ts ROUTE_REQUIREMENTS). */
export function getPanelRouteRequirement(pathname: string): PanelPermissionRequirement | null {
  const found = findRouteRequirement(pathname);
  return found ? { anyOf: [...found.anyOf] } : null;
}
