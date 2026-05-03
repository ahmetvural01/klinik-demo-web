import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const item = await (prisma as any).stockItem.findUnique({
    where: { id: params.id },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!item) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { name, category, unit, minQuantity, unitPrice, supplier } = body;

  if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });

  const updated = await (prisma as any).stockItem.update({
    where: { id: params.id },
    data: {
      name,
      category: category || undefined,
      unit: unit || undefined,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : undefined,
      unitPrice:   unitPrice   !== undefined ? Number(unitPrice)   : undefined,
      supplier:    supplier    !== undefined ? supplier             : undefined,
    },
  });

  return NextResponse.json(updated);
}

// PATCH: stock movement (GIRIS/CIKIS)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { type, quantity, note } = body;

  if (!type || !quantity) return NextResponse.json({ error: "type ve quantity zorunlu" }, { status: 400 });
  if (!["GIRIS", "CIKIS"].includes(type)) return NextResponse.json({ error: "type: GIRIS veya CIKIS olmalı" }, { status: 400 });
  if (Number(quantity) <= 0) return NextResponse.json({ error: "Miktar pozitif olmalı" }, { status: 400 });

  const item = await (prisma as any).stockItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (!item.isActive) return NextResponse.json({ error: "Pasif stok kalemi güncellenemez" }, { status: 400 });

  const delta = type === "GIRIS" ? Number(quantity) : -Number(quantity);
  const newQty = Math.max(0, item.quantity + delta);

  if (type === "CIKIS" && Number(quantity) > item.quantity) {
    return NextResponse.json({
      error: `Yetersiz stok. Mevcut: ${item.quantity}, İstenen çıkış: ${quantity}`,
    }, { status: 400 });
  }

  const [updated] = await (prisma as any).$transaction([
    (prisma as any).stockItem.update({
      where: { id: params.id },
      data:  { quantity: newQty },
    }),
    (prisma as any).stockMovement.create({
      data: { stockItemId: params.id, type, quantity: Number(quantity), note: note || null, userId: user.id },
    }),
  ]);

  const isCritical = newQty < Number(item.minQuantity);
  return NextResponse.json({ ...updated, isCritical });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  await (prisma as any).stockItem.update({
    where: { id: params.id },
    data:  { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
