import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { packageConflictMessage, parsePackageInput } from "../package-input";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const existing = await prisma.smsPackage.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = parsePackageInput(body, true);
  if (parsed.error) return NextResponse.json({ message: parsed.error }, { status: 400 });
  const isActive = body && typeof body === "object" && typeof (body as { isActive?: unknown }).isActive === "boolean"
    ? (body as { isActive: boolean }).isActive
    : undefined;

  let updated;
  try {
    updated = await prisma.smsPackage.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        ...(isActive !== undefined && { isActive }),
      },
    });
  } catch (error) {
    const conflict = packageConflictMessage(error);
    if (conflict) return NextResponse.json({ message: conflict }, { status: 409 });
    throw error;
  }

  await writeAudit(
    auth.user.id,
    "SUPERADMIN_SMS_PACKAGE_UPDATE",
    `${updated.name}: ${updated.smsCount} SMS / ₺${Number(updated.price).toLocaleString("tr-TR")}${updated.isActive ? "" : " (pasif)"}`
  );

  return NextResponse.json({ ...updated, price: Number(updated.price) });
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
