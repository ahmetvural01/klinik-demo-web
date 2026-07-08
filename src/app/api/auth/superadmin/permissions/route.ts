import { NextResponse } from "next/server";
import { decodeTokenUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SUPERADMIN_MODULES, normalizeModules } from "@/lib/superadmin-modules";

export async function GET() {
  const user = decodeTokenUser();

  if (!user) return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
  if (user.role !== "SUPERADMIN") return NextResponse.json({ message: "Bu işlem için süper yönetici yetkisi gerekli." }, { status: 403 });

  const permission = await prisma.superadminPermission.findUnique({
    where: { userId: user.id },
  });

  const modules = permission
    ? normalizeModules(permission.modules)
    : normalizeModules(user.superadminModules || DEFAULT_SUPERADMIN_MODULES);

  return NextResponse.json({ modules });
}
