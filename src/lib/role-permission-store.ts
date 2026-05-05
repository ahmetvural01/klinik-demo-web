import fs from "node:fs";
import path from "node:path";
import { Role } from "@prisma/client";
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

const ROLE_PERMISSION_FILE = path.join(process.cwd(), "data", "role-permissions.json");

let cache: RolePermissionState | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 3000;

function buildDefaultState(updatedBy = "system"): RolePermissionState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    map: { ...DEFAULT_ROLE_PERMISSIONS },
  };
}

function ensureDir() {
  const dir = path.dirname(ROLE_PERMISSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState(): RolePermissionState {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;

  try {
    if (!fs.existsSync(ROLE_PERMISSION_FILE)) {
      const initial = buildDefaultState();
      ensureDir();
      fs.writeFileSync(ROLE_PERMISSION_FILE, JSON.stringify(initial, null, 2), "utf-8");
      cache = initial;
      cacheAt = Date.now();
      return initial;
    }

    const parsed = JSON.parse(fs.readFileSync(ROLE_PERMISSION_FILE, "utf-8")) as Partial<RolePermissionState>;
    const state: RolePermissionState = {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : "unknown",
      map: normalizeRolePermissionMap(parsed.map),
    };

    cache = state;
    cacheAt = Date.now();
    return state;
  } catch {
    const fallback = buildDefaultState();
    cache = fallback;
    cacheAt = Date.now();
    return fallback;
  }
}

export function getRolePermissionState() {
  return readState();
}

export function getPermissionMap(): Record<Role, string[]> {
  return readState().map;
}

export function saveRolePermissionMap(map: unknown, updatedBy: string) {
  const current = readState();
  const next: RolePermissionState = {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    map: normalizeRolePermissionMap(map),
  };

  ensureDir();
  fs.writeFileSync(ROLE_PERMISSION_FILE, JSON.stringify(next, null, 2), "utf-8");
  cache = next;
  cacheAt = Date.now();
  return next;
}

export function resetRolePermissionMap(updatedBy: string) {
  const next = buildDefaultState(updatedBy);
  ensureDir();
  fs.writeFileSync(ROLE_PERMISSION_FILE, JSON.stringify(next, null, 2), "utf-8");
  cache = next;
  cacheAt = Date.now();
  return next;
}

export function getPermissionPanelPayload() {
  const state = readState();
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
