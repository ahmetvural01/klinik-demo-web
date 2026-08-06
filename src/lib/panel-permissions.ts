export type PanelPermissionRequirement = {
  anyOf: string[];
};

export function hasPanelPermission(permissions: readonly string[], permission: string) {
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyPanelPermission(permissions: readonly string[], required: readonly string[]) {
  return permissions.includes("*") || required.some((permission) => permissions.includes(permission));
}

const PANEL_ROUTE_REQUIREMENTS: Array<{ prefix: string; requirement: PanelPermissionRequirement }> = [
  { prefix: "/hasta-ekle", requirement: { anyOf: ["patients:write"] } },
  { prefix: "/hasta-detay", requirement: { anyOf: ["patients:read"] } },
  { prefix: "/personel-ekle", requirement: { anyOf: ["staff:write"] } },
  { prefix: "/firma-detay", requirement: { anyOf: ["finance:read"] } },
  { prefix: "/anasayfa", requirement: { anyOf: ["dashboard:read"] } },
  { prefix: "/dashboard", requirement: { anyOf: ["dashboard:read"] } },
  { prefix: "/randevu", requirement: { anyOf: ["appointments:read"] } },
  { prefix: "/hasta-takip", requirement: { anyOf: ["hastatracking:read"] } },
  { prefix: "/hasta", requirement: { anyOf: ["patients:read"] } },
  { prefix: "/gorevler", requirement: { anyOf: ["clinictasks:read"] } },
  { prefix: "/tedavi-plani", requirement: { anyOf: ["treatment:read"] } },
  { prefix: "/muayene", requirement: { anyOf: ["examinations:read"] } },
  { prefix: "/recete", requirement: { anyOf: ["prescriptions:read"] } },
  { prefix: "/lab", requirement: { anyOf: ["lab:read"] } },
  { prefix: "/muhasebe", requirement: { anyOf: ["finance:center"] } },
  { prefix: "/kasa", requirement: { anyOf: ["payments:read"] } },
  { prefix: "/taksit", requirement: { anyOf: ["installments:read"] } },
  { prefix: "/gider", requirement: { anyOf: ["finance:read"] } },
  { prefix: "/finans", requirement: { anyOf: ["earnings:read"] } },
  { prefix: "/rapor", requirement: { anyOf: ["reports:read"] } },
  { prefix: "/fiyat", requirement: { anyOf: ["prices:read"] } },
  { prefix: "/stok", requirement: { anyOf: ["stock:read"] } },
  { prefix: "/firma", requirement: { anyOf: ["finance:read"] } },
  { prefix: "/personel", requirement: { anyOf: ["staff:read"] } },
  { prefix: "/sms", requirement: { anyOf: ["sms:read"] } },
  { prefix: "/sistem-izleme", requirement: { anyOf: ["audit:read"] } },
  { prefix: "/log", requirement: { anyOf: ["audit:read"] } },
  { prefix: "/ayar", requirement: { anyOf: ["settings:read"] } },
  { prefix: "/profil", requirement: { anyOf: ["profile:read"] } },
  { prefix: "/destek", requirement: { anyOf: ["support:read"] } },
];

export function getPanelRouteRequirement(pathname: string): PanelPermissionRequirement | null {
  if (pathname === "/yetkisiz" || pathname === "/") return null;
  return PANEL_ROUTE_REQUIREMENTS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.requirement || null;
}
