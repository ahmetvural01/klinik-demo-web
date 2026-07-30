import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const existing = await prisma.smsPackage.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });

  const body = (await request.json()) as {
    name?: string;
    smsCount?: number;
    price?: number;
    isActive?: boolean;
  };

  const updated = await prisma.smsPackage.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.smsCount !== undefined && { smsCount: body.smsCount }),
      ...(body.price !== undefined && { price: body.price }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  await writeAudit(
    auth.user.id,
    "SUPERADMIN_SMS_PACKAGE_UPDATE",
    `${updated.name}: ${updated.smsCount} SMS / ₺${Number(updated.price).toLocaleString("tr-TR")}${updated.isActive ? "" : " (pasif)"}`
  );

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const existing = await prisma.smsPackage.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });

  await prisma.smsPackage.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PACKAGE_DELETE", `${existing.name}: ${existing.smsCount} SMS / ₺${Number(existing.price).toLocaleString("tr-TR")}`);
  return NextResponse.json({ success: true });
}
