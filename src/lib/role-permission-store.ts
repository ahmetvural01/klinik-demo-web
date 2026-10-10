import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MANAGEABLE_ROLES,
  PERMISSION_DETAILS,
  PERMISSION_GROUPS,
  ROLE_META,
  diffRolePermissionMaps,
  normalizeRolePermissionMap,
} from "@/lib/role-permissions";

type RolePermissionState = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  map: Record<Role, string[]>;
  /** Matris hiç düzenlenmedi: koddaki önerilen varsayılan geçerli. */
  followsDefaults: boolean;
};

export class RolePermissionVersionConflictError extends Error {
  constructor() {
    super("ROLE_PERMISSION_VERSION_CONFLICT");
  }
}

const SYSTEM_AUTHOR = "system";

/**
 * Satır yalnız ilk okumada varsayılandan otomatik oluşturulmuş ve o günden beri
 * hiç kaydedilmemişse (sürüm 1, "system"), içindeki JSON o günkü varsayılanın
 * kopyasıdır — kimsenin seçimi değildir. Bu durumda koddaki GÜNCEL varsayılan
 * geçerlidir; önceden varsayılan matris değiştiğinde hiç dokunulmamış
 * kurulumlar da eski (rastgele) matriste kalıyordu. Her kayıt (Rol Yetkileri
 * ekranı, "Varsayılana döndür", betik) sürümü artırır; o andan sonra
 * veritabanındaki matris geçerlidir ve kod değişikliği onu sessizce değiştirmez.
 */
function followsDefaults(row: { version: number; updatedBy: string }) {
  return row.version === 1 && row.updatedBy === SYSTEM_AUTHOR;
}

function toState(row: { version: number; updatedAt: Date; updatedBy: string; map: unknown }): RolePermissionState {
  const pristine = followsDefaults(row);
  return {
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    map: normalizeRolePermissionMap(pristine ? DEFAULT_ROLE_PERMISSIONS : row.map),
    followsDefaults: pristine,
  };
}

/**
 * Süreç içi kısa önbellek: `can()` her istekte (çoğu zaman birkaç kez) matrisi
 * okuyordu. Kayıt ve "Varsayılana döndür" önbelleği anında siler; başka bir
 * sunucu örneğindeki değişiklik en geç TTL kadar sonra görünür. `globalThis`
 * üzerinde tutulur ki aynı süreçteki ayrı paket kopyaları da aynı önbelleği
 * paylaşsın ve kayıtta hepsi birlikte geçersiz olsun.
 */
const PERMISSION_CACHE_TTL_MS = 5_000;

type PermissionCache = {
  state: RolePermissionState | null;
  expiresAt: number;
  pending: Promise<RolePermissionState> | null;
  generation: number;
};

const globalPermissionCache = globalThis as typeof globalThis & {
  __ksRolePermissionCache?: PermissionCache;
};

function permissionCache(): PermissionCache {
  const existing = globalPermissionCache.__ksRolePermissionCache;
  if (existing) return existing;
  const created: PermissionCache = { state: null, expiresAt: 0, pending: null, generation: 0 };
  globalPermissionCache.__ksRolePermissionCache = created;
  return created;
}

function invalidatePermissionCache() {
  const cache = permissionCache();
  cache.state = null;
  cache.expiresAt = 0;
  cache.pending = null;
  // Kayıttan önce başlamış bir okuma eski matrisi önbelleğe yazmasın.
  cache.generation += 1;
}

async function readCachedState(): Promise<RolePermissionState> {
  const cache = permissionCache();
  if (cache.state && cache.expiresAt > Date.now()) return cache.state;
  if (cache.pending) return cache.pending;

  const generation = cache.generation;
  const pending = readStateFromDb()
    .then(({ state, fromDb }) => {
      // Veritabanı hatasındaki yedek varsayılan önbelleğe yazılmaz: veritabanı
      // yeniden erişilebilir olunca bir sonraki istek güncel matrisi okur.
      if (fromDb && cache.generation === generation) {
        cache.state = state;
        cache.expiresAt = Date.now() + PERMISSION_CACHE_TTL_MS;
      }
      return state;
    })
    .finally(() => {
      if (cache.pending === pending) cache.pending = null;
    });
  cache.pending = pending;
  return pending;
}

async function readState(): Promise<RolePermissionState> {
  return (await readStateFromDb()).state;
}

async function readStateFromDb(): Promise<{ state: RolePermissionState; fromDb: boolean }> {
  try {
    let row = await prisma.rolePermissionConfig.findUnique({ where: { id: 1 } });
    if (!row) {
      // Satır, sürüm denetimli kayıt (saveRolePermissionMap) için gerekir;
      // içeriği "system" sürüm 1 olduğu sürece kullanılmaz (bkz. followsDefaults).
      row = await prisma.rolePermissionConfig.create({
        data: { id: 1, version: 1, updatedBy: SYSTEM_AUTHOR, map: DEFAULT_ROLE_PERMISSIONS },
      });
    }
    return { state: toState(row), fromDb: true };
  } catch {
    // DB erişilemezse (örn. build/migrate sırasında) varsayılana düş —
    // cache'e yazılmaz ki DB tekrar erişilebilir olunca güncel veri alınsın.
    return {
      state: {
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: SYSTEM_AUTHOR,
        map: normalizeRolePermissionMap(DEFAULT_ROLE_PERMISSIONS),
        followsDefaults: true,
      },
      fromDb: false,
    };
  }
}

/** Sürüm (iyimser kilit) için kullanılır; önbellek atlanır. */
export async function getRolePermissionState() {
  return readState();
}

export async function getPermissionMap(): Promise<Record<Role, string[]>> {
  return (await readCachedState()).map;
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
  invalidatePermissionCache();
  return toState(row);
}

/**
 * "Varsayılana döndür": matrisi koddaki önerilen varsayılana eşitler (tüm
 * özelleştirmeler silinir, sürüm artar). Mevcut kurulumda yeni varsayılanı
 * uygulamanın yolu budur; değişecek izinler önce `getPermissionPanelPayload`
 * içindeki `differencesFromDefaults` ile gösterilebilir.
 */
export async function resetRolePermissionMap(updatedBy: string, expectedVersion: number) {
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.rolePermissionConfig.updateMany({
      where: { id: 1, version: expectedVersion },
      data: { version: { increment: 1 }, updatedBy, map: normalizeRolePermissionMap(DEFAULT_ROLE_PERMISSIONS) },
    });
    if (updated.count !== 1) throw new RolePermissionVersionConflictError();
    return tx.rolePermissionConfig.findUniqueOrThrow({ where: { id: 1 } });
  });
  invalidatePermissionCache();
  return toState(row);
}

export async function getPermissionPanelPayload() {
  // Düzenleme ekranı önbelleği atlar: sürüm (iyimser kilit) her zaman güncel olsun.
  const state = await readState();
  const defaultMap = normalizeRolePermissionMap(DEFAULT_ROLE_PERMISSIONS);
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
    // Ekranın "önerilen varsayılandan farklar"ı göstermesi için (yalnız ek alan):
    // geçerli matris → önerilen varsayılan; `added` = "Varsayılana döndür" ile
    // eklenecek, `removed` = kaldırılacak izinler.
    followsDefaults: state.followsDefaults,
    defaultMap,
    differencesFromDefaults: diffRolePermissionMaps(state.map, defaultMap),
  };
}
