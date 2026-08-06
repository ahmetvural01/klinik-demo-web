import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

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
    if (!auth.user.institutionId) {
      return NextResponse.json({ error: "Gider kategorisi için kurum bağlamı zorunlu" }, { status: 403 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return NextResponse.json({ error: "Kategori adı 1-120 karakter olmalı" }, { status: 400 });
    }
    if (body.isDoctorPayout !== undefined && typeof body.isDoctorPayout !== "boolean") {
      return NextResponse.json({ error: "Hakediş kategorisi bilgisi geçersiz" }, { status: 400 });
    }
    const cat = await (prisma as any).expenseCategory.create({
      data: { name, institutionId: auth.user.institutionId, isDoctorPayout: body.isDoctorPayout ?? false },
    });
    await writeAudit(auth.user.id, "EXPENSE_CATEGORY_CREATE", name);
    return NextResponse.json(cat, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu kategori zaten mevcut" }, { status: 409 });
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
