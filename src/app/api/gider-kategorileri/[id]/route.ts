import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const body = await req.json();
    const existing = await (prisma as any).expenseCategory.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const cat = await (prisma as any).expenseCategory.update({
      where: { id: existing.id },
      data: body
    });
    return NextResponse.json(cat);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
