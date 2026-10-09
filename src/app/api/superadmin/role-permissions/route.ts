import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import {
  getPermissionMap,
  getPermissionPanelPayload,
  resetRolePermissionMap,
  RolePermissionVersionConflictError,
  saveRolePermissionMap,
} from "@/lib/role-permission-store";
import { ALL_PERMISSIONS, MANAGEABLE_ROLES, PERMISSION_DETAILS, ROLE_META, normalizeRolePermissionMap } from "@/lib/role-permissions";

function expand(list: readonly string[] | undefined): Set<string> {
  const perms = list || [];
  return new Set(perms.includes("*") ? ALL_PERMISSIONS : perms);
}

/** Denetim kaydı için rol bazında fark özeti: "Doktor: +2, −1 (kritik: Finans — Dışa Aktarma)". */
function describeDiff(before: Record<string, string[]>, after: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const role of MANAGEABLE_ROLES) {
    const prev = expand(before[role]);
    const next = expand(after[role]);
    const added = [...next].filter((perm) => !prev.has(perm));
    const removed = [...prev].filter((perm) => !next.has(perm));
    if (added.length === 0 && removed.length === 0) continue;
    const critical = [...added, ...removed].filter((perm) => PERMISSION_DETAILS[perm]?.risk === "yuksek").map((perm) => PERMISSION_DETAILS[perm]?.title || perm);
    parts.push(`${ROLE_META[role]?.label || role}: +${added.length}, −${removed.length}${critical.length ? ` (kritik: ${critical.slice(0, 4).join(", ")}${critical.length > 4 ? "…" : ""})` : ""}`);
  }
  return parts.length ? parts.join("; ") : "değişiklik yok";
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  return NextResponse.json(await getPermissionPanelPayload());
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const map = body?.map ?? {};
  const expectedVersion = Number(body?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ message: "Yetki matrisi sürümü zorunludur." }, { status: 400 });
  }

  // Bu matris kurum bazlı değil TÜM kliniklerde geçerlidir — bir rolün
  // yetkilerini boş kaydetmek (ör. UI'da yanlışlıkla tüm kutuların
  // işareti kaldırılıp kaydedilirse) o rolü anında platform genelinde
  // işlevsiz bırakırdı, hiçbir uyarı olmadan (bkz. denetim raporu).
  const normalized = normalizeRolePermissionMap(map);
  // Yönetici rolü de bu korumaya dahildir: boşaltılırsa tüm kliniklerin
  // yöneticileri (ayarlar, personel, finans dahil) her şeye erişimi anında
  // kaybeder ve kendileri düzeltemez.
  const emptyRoles = MANAGEABLE_ROLES.filter((role) => (normalized[role] || []).length === 0);
  if (emptyRoles.length > 0) {
    return NextResponse.json({
      message: `Şu rol(ler) hiç yetkiye sahip olmadan kaydedilemez: ${emptyRoles.map((role) => ROLE_META[role]?.label || role).join(", ")}. Bu, o rolü tüm kliniklerde işlevsiz bırakır.`,
    }, { status: 400 });
  }
  const before = await getPermissionMap();

  let next;
  try {
    next = await saveRolePermissionMap(map, auth.user.fullName || auth.user.id, expectedVersion);
  } catch (error) {
    if (error instanceof RolePermissionVersionConflictError) {
      return NextResponse.json({ message: "Yetki matrisi başka bir yönetici tarafından değiştirildi. Güncel veriyi yükleyip tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }
  await writeAudit(auth.user.id, "SUPERADMIN_ROLE_PERMISSIONS_UPDATE", `Rol yetkileri değişti (sürüm ${next.version}): ${describeDiff(before, normalized)}`);
  return NextResponse.json({
    ok: true,
    version: next.version,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
    map: next.map,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "reset") {
    return NextResponse.json({ message: "Geçersiz işlem" }, { status: 400 });
  }

  const expectedVersion = Number(body?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ message: "Yetki matrisi sürümü zorunludur." }, { status: 400 });
  }
  let next;
  try {
    next = await resetRolePermissionMap(auth.user.fullName || auth.user.id, expectedVersion);
  } catch (error) {
    if (error instanceof RolePermissionVersionConflictError) {
      return NextResponse.json({ message: "Yetki matrisi başka bir yönetici tarafından değiştirildi. Güncel veriyi yükleyip tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }
  await writeAudit(auth.user.id, "SUPERADMIN_ROLE_PERMISSIONS_RESET", `Rol yetki matrisi varsayılana döndürüldü. Versiyon: ${next.version}`);
  return NextResponse.json({
    ok: true,
    version: next.version,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
    map: next.map,
  });
}
