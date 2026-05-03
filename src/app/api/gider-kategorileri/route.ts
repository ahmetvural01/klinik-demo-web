import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const cats = await (prisma as any).expenseCategory.findMany({
      orderBy: { name: "asc" }
    });
    return NextResponse.json(cats);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });
    const cat = await (prisma as any).expenseCategory.create({ data: { name } });
    return NextResponse.json(cat, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu kategori zaten mevcut" }, { status: 409 });
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
