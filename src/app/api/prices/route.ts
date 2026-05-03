import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("prices:read");
  if (auth.error) return auth.error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const type = request.nextUrl.searchParams.get("type"); // "standard" | "custom" | null

  const isCustomFilter =
    type === "standard" ? false :
    type === "custom" ? true :
    undefined;

  const prices = await prisma.priceItem.findMany({
    where: {
      ...(isCustomFilter !== undefined ? { isCustom: isCustomFilter } : {}),
      ...(q ? {
        OR: [
          { treatment: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } }
        ]
      } : {})
    },
    orderBy: [{ code: "asc" }, { treatment: "asc" }]
  });

  return NextResponse.json(prices);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("prices:write");
  if (auth.error) return auth.error;

  const body = await request.json();

  const price = await prisma.priceItem.create({
    data: {
      code: body.code,
      treatment: body.treatment,
      amount: Number(body.amount),
      isFavorite: Boolean(body.isFavorite),
      isCustom: body.isCustom !== undefined ? Boolean(body.isCustom) : true
    }
  });

  await writeAudit(auth.user.id, "PRICE_CREATE", `${price.treatment} eklendi`);
  return NextResponse.json(price, { status: 201 });
}
