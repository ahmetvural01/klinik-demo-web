import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

type FirmaIslem = { islemTipi: string; tutar: unknown };
type RawFirma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; isActive: boolean; createdAt: string;
  islemler: FirmaIslem[];
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const firmas = await (prisma as any).firma.findMany({
      where: { isActive: true },
      include: {
        islemler: {
          where: { status: "AKTIF" },
          select: { islemTipi: true, tutar: true, createdAt: true }
        },
        kontaktler: {
          where: { isActive: true },
          select: { id: true, ad: true, unvan: true, email: true, telefon: true, isPrimary: true }
        }
      },
      orderBy: { name: "asc" }
    });

    return NextResponse.json(
      firmas.map((f: any) => {
        const borc = f.islemler
          .filter((i: any) => i.islemTipi === "ALIM" || i.islemTipi === "HIZMET")
          .reduce((s: number, i: any) => s + Number(i.tutar), 0);
        const odenen = f.islemler
          .filter((i: any) => i.islemTipi === "ODEME")
          .reduce((s: number, i: any) => s + Number(i.tutar), 0);
        
        // Vendor Score hesaplama: ödeme disiplini + kalite + hız
        const totalIslem = f.islemler.length;
        const odemeDurumu = f.islemler.filter((i: any) => i.islemTipi === "ODEME").length;
        const odemeDisiplini = totalIslem > 0 ? Math.round((odemeDurumu / totalIslem) * 100) : 50;
        
        const aktifIslem = f.islemler.filter((i: any) => i.islemTipi !== "IPTAL").length;
        const kaliteSkoru = totalIslem > 0 ? Math.round(((totalIslem - 0) / totalIslem) * 100) : 50;
        
        const score = Math.round((odemeDisiplini * 0.4 + kaliteSkoru * 0.35 + 70 * 0.25));

        const { islemler: _, kontaktler, ...rest } = f;
        return {
          ...rest,
          borc,
          odenen,
          bakiye: borc - odenen,
          vendorScore: Math.min(100, Math.max(0, score)),
          primaryKontakt: kontaktler?.find((k: any) => k.isPrimary) || null,
          toplamKontakt: kontaktler?.length || 0
        };
      })
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const { name, phone, iban, ibanName, notes, kategori, paymentTerms, customPaymentDays } = await req.json();
    if (!name) return NextResponse.json({ error: "Firma adi zorunlu" }, { status: 400 });

    const firma = await (prisma as any).firma.create({
      data: {
        name,
        phone: phone || null,
        iban: iban || null,
        ibanName: ibanName || null,
        notes: notes || null,
        kategori: kategori || "TEDARICI",
        paymentTerms: paymentTerms || "NET_30",
        customPaymentDays: customPaymentDays || null,
        vendorScore: 0
      },
      include: {
        kontaktler: true
      }
    });
    return NextResponse.json(firma, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu firma adi zaten kayitli" }, { status: 409 });
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
