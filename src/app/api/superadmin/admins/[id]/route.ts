import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { normalizeModules } from "@/lib/superadmin-modules";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as { modules?: string[]; isActive?: boolean };

  if (body.modules !== undefined) {
    const normalized = normalizeModules(body.modules);
    await prisma.superadminPermission.upsert({
      where: { userId: params.id },
      create: { userId: params.id, modules: normalized },
      update: { modules: normalized },
    });
  }

  if (body.isActive !== undefined) {
    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: body.isActive },
    });
  }

  return NextResponse.json({ success: true });
}
