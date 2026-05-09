import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const firma = await (prisma as any).firma.findUnique({
      where: { id: params.id },
      include: {
        islemler: {
          where: { status: "AKTIF" },
          orderBy: { tarih: "asc" }
        },
        kontaktler: {
          where: { isActive: true },
          orderBy: { isPrimary: "desc" }
        }
      }
    });
    if (!firma) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
    return NextResponse.json(firma);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    
    const body = await req.json();
    const { kategori, paymentTerms, customPaymentDays, ...rest } = body;
    
    const firma = await (prisma as any).firma.update({
      where: { id: params.id },
      data: {
        ...rest,
        kategori: kategori || undefined,
        paymentTerms: paymentTerms || undefined,
        customPaymentDays: customPaymentDays || undefined
      },
      include: {
        kontaktler: {
          where: { isActive: true }
        }
      }
    });
    return NextResponse.json(firma);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
