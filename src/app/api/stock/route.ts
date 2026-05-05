import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const items = await (prisma as any).stockItem.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { name, category, unit, quantity, minQuantity, unitPrice, supplier } = body;

  if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });

  const item = await (prisma as any).stockItem.create({
    data: { name, category: category || "SARF", unit: unit || "adet", quantity: Number(quantity) || 0, minQuantity: Number(minQuantity) || 5, unitPrice: unitPrice ? Number(unitPrice) : null, supplier },
  });

  return NextResponse.json(item, { status: 201 });
}
