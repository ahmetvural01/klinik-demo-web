import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

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

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN")
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  await prisma.smsPackage.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
