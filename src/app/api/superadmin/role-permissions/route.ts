import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import {
  getPermissionPanelPayload,
  resetRolePermissionMap,
  RolePermissionVersionConflictError,
  saveRolePermissionMap,
} from "@/lib/role-permission-store";
import { MANAGEABLE_ROLES, normalizeRolePermissionMap } from "@/lib/role-permissions";

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
  const emptyRoles = MANAGEABLE_ROLES.filter((role) => role !== "YONETICI" && (normalized[role] || []).length === 0);
  if (emptyRoles.length > 0) {
    return NextResponse.json({
      message: `Şu rol(ler) hiç yetkiye sahip olmadan kaydedilemez: ${emptyRoles.join(", ")}. Bu, o rolü tüm kliniklerde işlevsiz bırakır.`,
    }, { status: 400 });
  }

  let next;
  try {
    next = await saveRolePermissionMap(map, auth.user.fullName || auth.user.id, expectedVersion);
  } catch (error) {
    if (error instanceof RolePermissionVersionConflictError) {
      return NextResponse.json({ message: "Yetki matrisi başka bir yönetici tarafından değiştirildi. Güncel veriyi yükleyip tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }
  await writeAudit(auth.user.id, "SUPERADMIN_ROLE_PERMISSIONS_UPDATE", `Rol yetki matrisi güncellendi. Versiyon: ${next.version}`);
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
