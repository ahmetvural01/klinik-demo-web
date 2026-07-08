import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const cats = await (prisma as any).expenseCategory.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      orderBy: { name: "asc" }
    });
    return NextResponse.json(cats);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });
    const cat = await (prisma as any).expenseCategory.create({
      data: { name, institutionId: auth.user.institutionId },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu kategori zaten mevcut" }, { status: 409 });
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
