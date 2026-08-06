"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasAnyPanelPermission, hasPanelPermission } from "@/lib/panel-permissions";

type PermissionContextValue = {
  role: string;
  permissions: string[];
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ role, permissions, children }: { role: string; permissions: string[]; children: ReactNode }) {
  const value = useMemo<PermissionContextValue>(() => ({
    role,
    permissions,
    can: (permission) => hasPanelPermission(permissions, permission),
    canAny: (...required) => hasAnyPanelPermission(permissions, required),
  }), [permissions, role]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error("usePermissions, PermissionProvider içinde kullanılmalıdır");
  return context;
}

export function PermissionGate({ permission, anyOf, children }: { permission?: string; anyOf?: string[]; children: ReactNode }) {
  const { can, canAny } = usePermissions();
  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : false;
  return allowed ? children : null;
}
