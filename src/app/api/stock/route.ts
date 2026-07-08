import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  let items: any[] = [];
  try {
    items = await (prisma as any).stockItem.findMany({
      where: {
        isActive: true,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("[stock GET] fallback:", error);
    items = [];
  }

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { name, category, unit, quantity, minQuantity, unitPrice, supplier } = body;

  if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });

  let item;
  try {
    item = await (prisma as any).$transaction(async (tx: any) => {
      const created = await tx.stockItem.create({
        data: {
          name,
          institutionId: auth.user.institutionId,
          category: category || "SARF",
          unit: unit || "adet",
          quantity: 0,
          minQuantity: Number(minQuantity) || 5,
          unitPrice: unitPrice ? Number(unitPrice) : null,
          supplier: supplier || null,
        },
      });

      const initialQuantity = Number(quantity) || 0;
      if (initialQuantity > 0) {
        const movement = await applyStockMovement({
          tx,
          stockItemId: created.id,
          institutionId: auth.user.institutionId,
          userId: auth.user.id,
          type: "GIRIS",
          quantity: initialQuantity,
          note: "Başlangıç stok girişi",
          supplier: supplier || null,
          unitPrice: unitPrice ? Number(unitPrice) : null,
        });
        return movement.item;
      }

      return created;
    });
  } catch (error) {
    console.error("[stock POST] fallback:", error);
    return NextResponse.json({ error: "Stok kaydı oluşturulamadı" }, { status: 503 });
  }

  return NextResponse.json(item, { status: 201 });
}
