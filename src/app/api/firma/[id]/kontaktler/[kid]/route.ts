import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string; kid: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const kontakt = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        firma: {
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
      },
    });
    
    if (!kontakt) {
      return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
    }

    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; kid: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const { ad, unvan, email, telefon, rol, isPrimary } = await req.json();
    const existing = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        firma: {
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    // Eğer primary olarak işaretlenirse, diğer primary'leri false'a çevir
    if (isPrimary) {
      await (prisma as any).firmaKontakt.updateMany({
        where: { firmaId: params.id, id: { not: params.kid } },
        data: { isPrimary: false }
      });
    }

    const kontakt = await (prisma as any).firmaKontakt.update({
      where: { id: params.kid },
      data: {
        ad: ad || undefined,
        unvan: unvan || undefined,
        email: email || undefined,
        telefon: telefon || undefined,
        rol: rol || undefined,
        isPrimary: isPrimary !== undefined ? isPrimary : undefined
      }
    });

    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; kid: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const existing = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        firma: {
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    // Soft delete
    const kontakt = await (prisma as any).firmaKontakt.update({
      where: { id: params.kid },
      data: { isActive: false }
    });

    return NextResponse.json({ message: "Kontakt silindi" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
