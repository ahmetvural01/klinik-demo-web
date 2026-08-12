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

export class RolePermissionVersionConflictError extends Error {
  constructor() {
    super("ROLE_PERMISSION_VERSION_CONFLICT");
  }
}

function toState(row: { version: number; updatedAt: Date; updatedBy: string; map: unknown }): RolePermissionState {
  return {
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    map: normalizeRolePermissionMap(row.map),
  };
}

async function readState(): Promise<RolePermissionState> {
  try {
    let row = await prisma.rolePermissionConfig.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await prisma.rolePermissionConfig.create({
        data: { id: 1, version: 1, updatedBy: "system", map: DEFAULT_ROLE_PERMISSIONS },
      });
    }
    return toState(row);
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

export async function saveRolePermissionMap(map: unknown, updatedBy: string, expectedVersion: number) {
  const normalized = normalizeRolePermissionMap(map);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.rolePermissionConfig.updateMany({
      where: { id: 1, version: expectedVersion },
      data: { version: { increment: 1 }, updatedBy, map: normalized },
    });
    if (updated.count !== 1) throw new RolePermissionVersionConflictError();
    return tx.rolePermissionConfig.findUniqueOrThrow({ where: { id: 1 } });
  });
  return toState(row);
}

export async function resetRolePermissionMap(updatedBy: string, expectedVersion: number) {
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.rolePermissionConfig.updateMany({
      where: { id: 1, version: expectedVersion },
      data: { version: { increment: 1 }, updatedBy, map: DEFAULT_ROLE_PERMISSIONS },
    });
    if (updated.count !== 1) throw new RolePermissionVersionConflictError();
    return tx.rolePermissionConfig.findUniqueOrThrow({ where: { id: 1 } });
  });
  return toState(row);
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
