import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import {
  getPermissionPanelPayload,
  resetRolePermissionMap,
  saveRolePermissionMap,
} from "@/lib/role-permission-store";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  return NextResponse.json(getPermissionPanelPayload());
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const map = body?.map ?? {};

  const next = saveRolePermissionMap(map, auth.user.fullName || auth.user.id);
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

  const next = resetRolePermissionMap(auth.user.fullName || auth.user.id);
  return NextResponse.json({
    ok: true,
    version: next.version,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
    map: next.map,
  });
}
