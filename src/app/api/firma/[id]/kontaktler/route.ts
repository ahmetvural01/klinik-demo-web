import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const kontaktler = await (prisma as any).firmaKontakt.findMany({
      where: { firmaId: params.id, isActive: true },
      orderBy: { isPrimary: "desc" }
    });
    
    return NextResponse.json(kontaktler);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const { ad, unvan, email, telefon, rol, isPrimary } = await req.json();
    if (!ad) return NextResponse.json({ error: "Kontakt adi zorunlu" }, { status: 400 });

    // Eğer bu primary olarak işaretlenirse, diğer primary'leri false'a çevir
    if (isPrimary) {
      await (prisma as any).firmaKontakt.updateMany({
        where: { firmaId: params.id },
        data: { isPrimary: false }
      });
    }

    const kontakt = await (prisma as any).firmaKontakt.create({
      data: {
        firmaId: params.id,
        ad,
        unvan: unvan || null,
        email: email || null,
        telefon: telefon || null,
        rol: rol || null,
        isPrimary: isPrimary || false
      }
    });

    return NextResponse.json(kontakt, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
