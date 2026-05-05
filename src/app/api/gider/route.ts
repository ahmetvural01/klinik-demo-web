import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { status: "AKTIF" };
    if (categoryId) where.categoryId = categoryId;
    if (from || to) {
      where.tarih = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59") } : {})
      };
    }

    const expenses = await (prisma as any).expense.findMany({
      where,
      include: { expenseCategory: { select: { id: true, name: true } } },
      orderBy: { tarih: "desc" }
    });

    const total = expenses.reduce((s: number, e: { tutar: unknown }) => s + Number(e.tutar), 0);
    return NextResponse.json({ expenses, total });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    const { tarih, categoryId, category, description, tutar, yontem = "NAKIT", faturaNo, kdvOrani = 0 } = body;

    if (!tarih || !category || !tutar) {
      return NextResponse.json({ error: "Tarih, kategori ve tutar zorunlu" }, { status: 400 });
    }

    const expense = await (prisma as any).expense.create({
      data: {
        tarih: new Date(tarih),
        categoryId: categoryId || null,
        category,
        description: description || null,
        tutar: Number(tutar),
        yontem,
        faturaNo: faturaNo || null,
        kdvOrani: Number(kdvOrani),
        status: "AKTIF"
      }
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
