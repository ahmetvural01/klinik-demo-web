import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type FirmaIslem = { islemTipi: string; tutar: unknown };
type RawFirma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; isActive: boolean; createdAt: string;
  islemler: FirmaIslem[];
};

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const firmas = await (prisma as any).firma.findMany({
      where: { isActive: true },
      include: {
        islemler: {
          where: { status: "AKTIF" },
          select: { islemTipi: true, tutar: true }
        }
      },
      orderBy: { name: "asc" }
    });

    return NextResponse.json(
      firmas.map((f: RawFirma) => {
        const borc = f.islemler
          .filter((i) => i.islemTipi === "ALIM" || i.islemTipi === "HIZMET")
          .reduce((s: number, i) => s + Number(i.tutar), 0);
        const odenen = f.islemler
          .filter((i) => i.islemTipi === "ODEME")
          .reduce((s: number, i) => s + Number(i.tutar), 0);
        const { islemler: _, ...rest } = f;
        return { ...rest, borc, odenen, bakiye: borc - odenen };
      })
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { name, phone, iban, ibanName, notes } = await req.json();
    if (!name) return NextResponse.json({ error: "Firma adi zorunlu" }, { status: 400 });

    const firma = await (prisma as any).firma.create({
      data: {
        name,
        phone: phone || null,
        iban: iban || null,
        ibanName: ibanName || null,
        notes: notes || null
      }
    });
    return NextResponse.json(firma, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu firma adi zaten kayitli" }, { status: 409 });
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
