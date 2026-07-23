export const SUPERADMIN_MODULES = [
  "dashboard",
  "institutions",
  "users",
  "roles",
  "invoices",
  "sms",
  "ads",
  "smtp",
  "reports",
  "support",
  "audit",
  "announcements",
  "settings",
  "admins",
] as const;

export type SuperadminModule = (typeof SUPERADMIN_MODULES)[number];

export const DEFAULT_SUPERADMIN_MODULES: SuperadminModule[] = [...SUPERADMIN_MODULES];

const MODULE_ROUTE_RULES: Array<{ module: SuperadminModule; prefixes: string[] }> = [
  { module: "dashboard", prefixes: ["/superadmin/panel", "/api/superadmin/dashboard"] },
  { module: "institutions", prefixes: ["/superadmin/institutions", "/api/superadmin/institutions"] },
  { module: "users", prefixes: ["/superadmin/users", "/api/superadmin/users"] },
  { module: "roles", prefixes: ["/superadmin/role-permissions", "/api/superadmin/role-permissions"] },
  { module: "invoices", prefixes: ["/superadmin/invoices", "/api/superadmin/invoices"] },
  {
    module: "sms",
    prefixes: [
      "/superadmin/sms",
      "/api/superadmin/sms",
      "/api/superadmin/sms-packages",
      "/api/superadmin/sms-stock",
      "/api/superadmin/sms-templates",
      "/api/superadmin/sms-provider",
    ],
  },
  { module: "ads", prefixes: ["/superadmin/ads", "/api/superadmin/ads"] },
  { module: "smtp", prefixes: ["/superadmin/smtp", "/api/superadmin/smtp"] },
  { module: "reports", prefixes: ["/superadmin/reports", "/api/superadmin/reports"] },
  { module: "support", prefixes: ["/superadmin/support", "/api/superadmin/support"] },
  { module: "audit", prefixes: ["/superadmin/audit", "/api/superadmin/audit"] },
  { module: "announcements", prefixes: ["/superadmin/announcements", "/api/superadmin/announcements"] },
  { module: "settings", prefixes: ["/superadmin/sistem", "/superadmin/site-content", "/api/superadmin/system-settings", "/api/superadmin/consent-template", "/api/superadmin/site-content", "/api/superadmin/theme"] },
  { module: "admins", prefixes: ["/superadmin/admins", "/api/superadmin/admins"] },
];

export function extractModuleFromPath(pathname: string): SuperadminModule | null {
  for (const rule of MODULE_ROUTE_RULES) {
    if (rule.prefixes.some((prefix) => pathname.startsWith(prefix))) {
      return rule.module;
    }
  }
  return null;
}

export function normalizeModules(input: unknown): SuperadminModule[] {
  if (!Array.isArray(input)) return [...DEFAULT_SUPERADMIN_MODULES];
  const filtered = input.filter((item): item is SuperadminModule =>
    typeof item === "string" && (SUPERADMIN_MODULES as readonly string[]).includes(item)
  );
  return filtered.length > 0 ? filtered : [...DEFAULT_SUPERADMIN_MODULES];
}

export function hasModuleAccess(modules: unknown, required: SuperadminModule): boolean {
  const list = normalizeModules(modules);
  return list.includes(required);
}
