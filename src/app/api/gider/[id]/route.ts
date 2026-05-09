import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const expense = await (prisma as any).expense.findUnique({
      where: { id: params.id },
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    if (!expense) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json(expense);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    const expense = await (prisma as any).expense.update({
      where: { id: params.id },
      data: body,
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    return NextResponse.json(expense);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    // Soft delete (status = IPTAL)
    await (prisma as any).expense.update({
      where: { id: params.id },
      data: { status: "IPTAL" }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
