import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const item = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!item) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { name, category, unit, minQuantity, unitPrice, supplier } = body;

  if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });
  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

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

  await writeAudit(auth.user.id, "STOCK_ITEM_UPDATE", `Stok kalemi güncellendi (${params.id})`);
  return NextResponse.json(updated);
}

// PATCH: stock movement (GIRIS/CIKIS)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { type, quantity, note, supplier, unitPrice } = body;

  if (!type || !quantity) return NextResponse.json({ error: "type ve quantity zorunlu" }, { status: 400 });
  if (!["GIRIS", "CIKIS"].includes(type)) return NextResponse.json({ error: "type: GIRIS veya CIKIS olmalı" }, { status: 400 });
  if (Number(quantity) <= 0) return NextResponse.json({ error: "Miktar pozitif olmalı" }, { status: 400 });
  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      return applyStockMovement({
        tx,
        stockItemId: params.id,
        institutionId: auth.user.institutionId,
        userId: auth.user.id,
        type,
        quantity: Number(quantity),
        note,
        supplier,
        unitPrice: unitPrice !== undefined ? Number(unitPrice) : undefined,
      });
    });

    await writeAudit(auth.user.id, "STOCK_MOVEMENT", `${type === "GIRIS" ? "Stok girişi" : "Stok çıkışı"}: ${quantity} adet (${params.id})`);
    return NextResponse.json({ ...result.item, isCritical: result.isCritical });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stok hareketi kaydedilemedi" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  await (prisma as any).stockItem.update({
    where: { id: existing.id },
    data:  { isActive: false },
  });

  await writeAudit(auth.user.id, "STOCK_ITEM_DELETE", `Stok kalemi pasifleştirildi (${params.id})`);
  return NextResponse.json({ ok: true });
}
