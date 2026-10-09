import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, role: true, isActive: true } });
  if (!target || target.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Superadmin bulunamadı" }, { status: 404 });
  }

  const body = (await request.json()) as { isActive?: boolean };
  const detail: string[] = [];

  // Sistemde etkin en az bir superadmin kalmalı — aksi halde platforma
  // erişebilecek kimse kalmaz.
  if (body.isActive === false && target.isActive) {
    const otherActiveCount = await prisma.user.count({
      where: { role: "SUPERADMIN", isActive: true, id: { not: params.id } },
    });
    if (otherActiveCount === 0) {
      return NextResponse.json({ message: "Son etkin platform yöneticisi pasife alınamaz; önce başka bir yönetici ekleyin." }, { status: 400 });
    }
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
