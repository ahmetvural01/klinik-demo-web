import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

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

    // Sadece isim yeniden adlandırma ve aktif/pasif geçişi destekleniyor —
    // ham `body`yi olduğu gibi vermek institutionId gibi alanların dışarıdan
    // değiştirilebilmesine yol açardı.
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.isDoctorPayout !== undefined) data.isDoctorPayout = Boolean(body.isDoctorPayout);

    const cat = await (prisma as any).expenseCategory.update({
      where: { id: existing.id },
      data
    });
    await writeAudit(auth.user.id, "EXPENSE_CATEGORY_UPDATE", params.id);
    return NextResponse.json(cat);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
