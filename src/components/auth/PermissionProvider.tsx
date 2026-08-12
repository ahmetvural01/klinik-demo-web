"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasAnyPanelPermission, hasPanelPermission } from "@/lib/panel-permissions";
import { showToastSafe } from "@/lib/toast-client";

type PermissionContextValue = {
  role: string;
  permissions: string[];
  features: InstitutionFeatures;
  scopeKey: string;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  hasFeature: (feature: keyof InstitutionFeatures) => boolean;
};

export type InstitutionFeatures = {
  whatsapp: boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  role,
  permissions,
  features,
  scopeKey,
  children,
}: {
  role: string;
  permissions: string[];
  features: InstitutionFeatures;
  scopeKey: string;
  children: ReactNode;
}) {
  const [activeFeatures, setActiveFeatures] = useState(features);
  const [activePermissions, setActivePermissions] = useState(permissions);
  const accessFailureShown = useRef(false);
  const refreshAccess = useCallback(async () => {
    const [capabilityResponse, identityResponse] = await Promise.all([
      fetch("/api/capabilities", { cache: "no-store" }).catch(() => null),
      fetch("/api/auth/me", { cache: "no-store" }).catch(() => null),
    ]);
    const [capabilityData, identityData] = await Promise.all([
      capabilityResponse?.json().catch(() => null),
      identityResponse?.json().catch(() => null),
    ]);
    const accessUnavailable = !capabilityResponse?.ok || !identityResponse?.ok;
    if (capabilityResponse?.ok && capabilityData?.features) {
      setActiveFeatures({ whatsapp: Boolean(capabilityData.features.whatsapp) });
    } else {
      setActiveFeatures({ whatsapp: false });
    }
    if (identityResponse?.ok && Array.isArray(identityData?.permissions)) {
      setActivePermissions(identityData.permissions.filter((item: unknown): item is string => typeof item === "string"));
    } else {
      setActivePermissions([]);
    }
    if (accessUnavailable && !accessFailureShown.current) {
      accessFailureShown.current = true;
      showToastSafe({
        title: "Erişim bilgileri doğrulanamadı",
        message: "Güvenlik nedeniyle işlemler geçici olarak kapatıldı. Bağlantınızı kontrol edip sayfayı yenileyin.",
        type: "error",
      });
    } else if (!accessUnavailable) {
      accessFailureShown.current = false;
    }
  }, []);

  useEffect(() => setActiveFeatures(features), [features]);
  useEffect(() => setActivePermissions(permissions), [permissions]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") void refreshAccess(); };
    const onFeatureChange = () => void refreshAccess();
    const interval = window.setInterval(() => void refreshAccess(), 15_000);
    window.addEventListener("institution-features-change", onFeatureChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("institution-features-change", onFeatureChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAccess]);

  const value = useMemo<PermissionContextValue>(() => ({
    role,
    permissions: activePermissions,
    features: activeFeatures,
    scopeKey,
    can: (permission) => hasPanelPermission(activePermissions, permission),
    canAny: (...required) => hasAnyPanelPermission(activePermissions, required),
    hasFeature: (feature) => Boolean(activeFeatures[feature]),
  }), [activeFeatures, activePermissions, role, scopeKey]);

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
