import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MANAGEABLE_ROLES,
  PERMISSION_DETAILS,
  PERMISSION_GROUPS,
  ROLE_META,
  normalizeRolePermissionMap,
} from "@/lib/role-permissions";

type RolePermissionState = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  map: Record<Role, string[]>;
};

// Önceden data/role-permissions.json dosyasına yazılıyordu — Render'ın
// ephemeral dosya sisteminde her redeploy'da özel yetki değişiklikleri
// kayboluyordu. Artık RolePermissionConfig (id=1 tek satır) tablosunda,
// kısa süreli in-process cache ile tutuluyor (rbac.can() her istekte
// çağrıldığı için her seferinde DB'ye gitmemek gerekiyor).
let cache: RolePermissionState | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 3000;

function toState(row: { version: number; updatedAt: Date; updatedBy: string; map: unknown }): RolePermissionState {
  return {
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    map: normalizeRolePermissionMap(row.map),
  };
}

async function readState(): Promise<RolePermissionState> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;

  try {
    let row = await prisma.rolePermissionConfig.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await prisma.rolePermissionConfig.create({
        data: { id: 1, version: 1, updatedBy: "system", map: DEFAULT_ROLE_PERMISSIONS },
      });
    }
    const state = toState(row);
    cache = state;
    cacheAt = Date.now();
    return state;
  } catch {
    // DB erişilemezse (örn. build/migrate sırasında) varsayılana düş —
    // cache'e yazılmaz ki DB tekrar erişilebilir olunca güncel veri alınsın.
    return { version: 1, updatedAt: new Date().toISOString(), updatedBy: "system", map: { ...DEFAULT_ROLE_PERMISSIONS } };
  }
}

export async function getRolePermissionState() {
  return readState();
}

export async function getPermissionMap(): Promise<Record<Role, string[]>> {
  return (await readState()).map;
}

export async function saveRolePermissionMap(map: unknown, updatedBy: string) {
  const current = await readState();
  const normalized = normalizeRolePermissionMap(map);
  const row = await prisma.rolePermissionConfig.upsert({
    where: { id: 1 },
    update: { version: current.version + 1, updatedBy, map: normalized },
    create: { id: 1, version: current.version + 1, updatedBy, map: normalized },
  });
  const next = toState(row);
  cache = next;
  cacheAt = Date.now();
  return next;
}

export async function resetRolePermissionMap(updatedBy: string) {
  const current = await readState();
  const row = await prisma.rolePermissionConfig.upsert({
    where: { id: 1 },
    update: { version: current.version + 1, updatedBy, map: DEFAULT_ROLE_PERMISSIONS },
    create: { id: 1, version: current.version + 1, updatedBy, map: DEFAULT_ROLE_PERMISSIONS },
  });
  const next = toState(row);
  cache = next;
  cacheAt = Date.now();
  return next;
}

export async function getPermissionPanelPayload() {
  const state = await readState();
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    roles: MANAGEABLE_ROLES,
    roleMeta: ROLE_META,
    permissionGroups: PERMISSION_GROUPS,
    permissionDetails: PERMISSION_DETAILS,
    allPermissions: ALL_PERMISSIONS,
    map: state.map,
  };
}
