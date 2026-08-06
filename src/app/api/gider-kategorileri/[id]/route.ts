import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
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
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 120) {
        return NextResponse.json({ error: "Kategori adı 1-120 karakter olmalı" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json({ error: "Aktiflik bilgisi geçersiz" }, { status: 400 });
      }
      data.isActive = body.isActive;
    }
    if (body.isDoctorPayout !== undefined) {
      if (typeof body.isDoctorPayout !== "boolean") {
        return NextResponse.json({ error: "Hakediş kategorisi bilgisi geçersiz" }, { status: 400 });
      }
      data.isDoctorPayout = body.isDoctorPayout;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 });
    }

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
