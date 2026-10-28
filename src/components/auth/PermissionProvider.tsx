"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hasAnyPanelPermission, hasPanelPermission } from "@/lib/panel-permissions";
import { usePanelSummary } from "@/components/layout/use-panel-alerts";

type PermissionContextValue = {
  role: string;
  permissions: string[];
  features: InstitutionFeatures;
  scopeKey: string;
  /** Oturumdaki kullanıcının kimliği (layout verir; yoksa null). */
  userId: string | null;
  /**
   * Süperadmin'in kliniğe görünmez (destek) oturumu mu (layout verir; yoksa false).
   * Rol önizlemesinde de true kalır. Ekip mesajı / duyuru yazma gibi kliniğe
   * kendi adıyla iz bırakan kutular özet gelmeden bu bilgiyle gizlenir.
   */
  ghost: boolean;
  /**
   * Etkin şubenin yöneticisi mi (layout verir). Şube erişimini yönetmek (pasif
   * personeli geri açmak dahil) rol izniyle birlikte bunu ister — sunucu ikisini
   * birden denetler; YÖNETİCİ rolü "*" taşıdığı için izin listesi tek başına yetmez.
   */
  branchManager: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  hasFeature: (feature: keyof InstitutionFeatures) => boolean;
  /**
   * İzin listesi sunucudan doğrulandı mı (sayfa yüklenirken layout'tan ya da
   * başarılı bir özet yanıtından). Geçici hatada liste SİLİNMEZ; son doğrulanmış
   * liste korunur. Sayfa koruması yalnız doğrulanmış listeye göre yönlendirir.
   */
  permissionsVerified: boolean;
  /** "degraded": son yoklamalar art arda başarısız (ekran son bilinen bilgiyle çalışıyor). */
  accessStatus: "ok" | "degraded";
};

export type InstitutionFeatures = {
  whatsapp: boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

function samePermissions(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function PermissionProvider({
  role,
  permissions,
  features,
  scopeKey,
  userId = null,
  ghost = false,
  branchManager = false,
  children,
}: {
  role: string;
  permissions: string[];
  features: InstitutionFeatures;
  scopeKey: string;
  userId?: string | null;
  ghost?: boolean;
  branchManager?: boolean;
  children: ReactNode;
}) {
  const [activeFeatures, setActiveFeatures] = useState(features);
  const [activePermissions, setActivePermissions] = useState(permissions);
  const summary = usePanelSummary();

  // Layout yeniden çizildiğinde (ör. router.refresh) gelen liste; içerik aynıysa
  // durum değişmez — 28 dosyadaki usePermissions tüketicisi boşuna çizilmesin.
  useEffect(() => {
    setActivePermissions((current) => (samePermissions(current, permissions) ? current : permissions));
  }, [permissions]);
  useEffect(() => {
    setActiveFeatures((current) => (current.whatsapp === features.whatsapp ? current : features));
  }, [features]);

  // Yetki yoklaması artık ayrı bir 15 sn'lik istek değil: kabuk özeti
  // (/api/panel-summary) izin ve özellikleri de taşır. Önceden tek bir geçici
  // hata (429, 5xx, ağ kopması) izinleri [] yapıyor, sayfa koruması kullanıcıyı
  // /yetkisiz'e atıp açık formu siliyordu. Artık yalnız BAŞARILI yanıt listeyi
  // değiştirir; hata durumunda son doğrulanmış liste geçerli kalır.
  const verified = summary.data;
  useEffect(() => {
    if (!verified) return;
    setActivePermissions((current) => (samePermissions(current, verified.permissions) ? current : verified.permissions));
    setActiveFeatures((current) => (current.whatsapp === verified.features.whatsapp ? current : { whatsapp: verified.features.whatsapp }));
  }, [verified]);

  const can = useCallback((permission: string) => hasPanelPermission(activePermissions, permission), [activePermissions]);
  const canAny = useCallback((...required: string[]) => hasAnyPanelPermission(activePermissions, required), [activePermissions]);
  const hasFeature = useCallback((feature: keyof InstitutionFeatures) => Boolean(activeFeatures[feature]), [activeFeatures]);
  const accessStatus: PermissionContextValue["accessStatus"] = summary.failures >= 3 ? "degraded" : "ok";

  const value = useMemo<PermissionContextValue>(() => ({
    role,
    permissions: activePermissions,
    features: activeFeatures,
    scopeKey,
    userId,
    ghost,
    branchManager,
    can,
    canAny,
    hasFeature,
    permissionsVerified: true,
    accessStatus,
  }), [accessStatus, activeFeatures, activePermissions, branchManager, can, canAny, hasFeature, ghost, role, scopeKey, userId]);

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
