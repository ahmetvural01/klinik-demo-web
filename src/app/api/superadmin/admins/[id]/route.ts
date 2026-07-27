import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { normalizeModules } from "@/lib/superadmin-modules";

// bkz. src/app/api/superadmin/admins/route.ts — kardeş liste rotasındaki
// aynı kontrol. Bu [id] rotası önceden bu kontrolü, denetim kaydını ve
// "son superadmin" korumasını hiç yapmıyordu — settings/admins modülü
// olmayan bir superadmin bile başka bir superadmin'i (hatta tüm
// superadminleri) pasifleştirebilir/yetkisizleştirebilirdi (bkz. denetim
// raporu).
function hasSettingsAccess(modules?: string[]) {
  if (!modules) return true;
  return modules.includes("settings") || modules.includes("admins");
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  if (!hasSettingsAccess(auth.user.superadminModules))
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, role: true, isActive: true } });
  if (!target || target.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Superadmin bulunamadı" }, { status: 404 });
  }

  const body = (await request.json()) as { modules?: string[]; isActive?: boolean };
  const detail: string[] = [];

  // Sistemde etkin en az bir superadmin kalmalı — aksi halde platforma
  // erişebilecek kimse kalmaz.
  if (body.isActive === false && target.isActive) {
    const otherActiveCount = await prisma.user.count({
      where: { role: "SUPERADMIN", isActive: true, id: { not: params.id } },
    });
    if (otherActiveCount === 0) {
      return NextResponse.json({ message: "Son etkin superadmin hesabı pasifleştirilemez." }, { status: 400 });
    }
  }

  if (body.modules !== undefined) {
    const normalized = normalizeModules(body.modules);
    await prisma.superadminPermission.upsert({
      where: { userId: params.id },
      create: { userId: params.id, modules: normalized },
      update: { modules: normalized },
    });
    detail.push(`modüller: ${normalized.join(", ") || "yok"}`);
  }

  if (body.isActive !== undefined) {
    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: body.isActive },
    });
    detail.push(`isActive: ${target.isActive} → ${body.isActive}`);
  }

  await writeAudit(auth.user.id, "SUPERADMIN_UPDATE", `${target.fullName} güncellendi (${detail.join(", ") || "değişiklik yok"})`);

  return NextResponse.json({ success: true });
}
